-- =============================================================================
-- Toon Universe — coin pack checkout (Stripe PromptPay)
--
-- Flow
--   1. create_coin_purchase       server action (user from getClaims())
--                                 → pending coin_purchases row (price snapshot)
--   2. Stripe Checkout Session    created by the server with
--                                 client_reference_id = purchase id
--   3. attach_checkout_session    stores the session id on the pending row
--   4. Stripe webhook (signature verified)
--        checkout.session.completed / async_payment_succeeded (paid)
--                                 → complete_coin_purchase (credits the wallet)
--        checkout.session.async_payment_failed → fail_coin_purchase('failed')
--        checkout.session.expired              → fail_coin_purchase('canceled')
--
-- Webhooks can arrive more than once and out of order, so:
--   * complete_coin_purchase is idempotent (a succeeded purchase is never
--     credited twice) and wins over an earlier failed/canceled state (the
--     money was received).
--   * fail_coin_purchase only touches pending rows.
--   * The purchase is looked up by id (client_reference_id) so a webhook that
--     beats attach_checkout_session still finds it; the session id must then
--     match if one was already attached.
--
-- Same conventions as *_server_functions.sql: service_role only, SECURITY
-- INVOKER, errors = SQLSTATE P0001 + code (keep src/lib/server/errors.ts in sync).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Reader: start a purchase
-- -----------------------------------------------------------------------------
create function public.create_coin_purchase(p_user_id uuid, p_pack_id smallint)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pack     public.coin_packs;
  v_purchase public.coin_purchases;
begin
  perform private.assert_active_user(p_user_id);

  select * into v_pack from public.coin_packs where id = p_pack_id and is_active;
  if not found then
    raise exception 'coin_pack_not_found' using errcode = 'P0001';
  end if;

  insert into public.coin_purchases (user_id, pack_id, coins, amount_satang)
  values (p_user_id, v_pack.id, v_pack.coins, v_pack.price_satang)
  returning * into v_purchase;

  return jsonb_build_object(
    'purchase_id',   v_purchase.id,
    'coins',         v_purchase.coins,
    'amount_satang', v_purchase.amount_satang
  );
end;
$$;

create function public.attach_checkout_session(
  p_purchase_id bigint, p_user_id uuid, p_session_id text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.coin_purchases
     set stripe_checkout_session_id = p_session_id
   where id = p_purchase_id
     and user_id = p_user_id
     and (stripe_checkout_session_id is null or stripe_checkout_session_id = p_session_id);
  if not found then
    raise exception 'purchase_not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Webhook: payment succeeded → credit purchased coins
-- -----------------------------------------------------------------------------
create function public.complete_coin_purchase(
  p_purchase_id       bigint,
  p_session_id        text,
  p_payment_intent_id text,
  p_amount_satang     integer,
  p_currency          text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_purchase public.coin_purchases;
  v_status   public.account_status;
  v_wallet   public.coin_wallets;
begin
  -- Lock order: profiles → coin_wallets. Locking the profile (shared) makes a
  -- concurrent ban_user (FOR UPDATE on profiles) run strictly before or after us.
  select p.status into v_status
    from public.coin_purchases cp
    join public.profiles p on p.id = cp.user_id
   where cp.id = p_purchase_id
     for share of p;

  select * into v_purchase from public.coin_purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'purchase_not_found' using errcode = 'P0001';
  end if;

  if v_purchase.stripe_checkout_session_id is distinct from p_session_id
     and v_purchase.stripe_checkout_session_id is not null then
    raise exception 'purchase_session_mismatch' using errcode = 'P0001',
      detail = 'purchase ' || p_purchase_id;
  end if;

  if v_purchase.status = 'succeeded' then
    return jsonb_build_object('purchase_id', v_purchase.id, 'already_completed', true);
  end if;

  if p_amount_satang is distinct from v_purchase.amount_satang
     or lower(p_currency) is distinct from 'thb' then
    raise exception 'purchase_amount_mismatch' using errcode = 'P0001',
      detail = format('purchase %s: expected %s thb, got %s %s',
                      p_purchase_id, v_purchase.amount_satang, p_amount_satang, p_currency);
  end if;

  update public.coin_purchases
     set status                     = 'succeeded',
         stripe_checkout_session_id = p_session_id,
         stripe_payment_intent_id   = p_payment_intent_id,
         paid_at                    = now()
   where id = v_purchase.id;

  v_wallet := private.lock_wallet(v_purchase.user_id);

  insert into public.coin_ledger (user_id, kind, delta, reason, purchase_id)
  values (v_purchase.user_id, 'purchased', v_purchase.coins, 'purchase', v_purchase.id);

  update public.coin_wallets
     set purchased_balance = purchased_balance + v_purchase.coins
   where user_id = v_purchase.user_id
  returning * into v_wallet;

  -- Paid after being banned: the payment is kept (no top-up refunds, see ToS)
  -- but a banned wallet stays at zero, same as ban_user.
  if v_status = 'banned' then
    insert into public.coin_ledger (user_id, kind, delta, reason, purchase_id, note)
    values (v_purchase.user_id, 'purchased', -v_purchase.coins, 'ban_forfeit', v_purchase.id,
            'purchase completed after ban');

    update public.coin_wallets
       set purchased_balance = purchased_balance - v_purchase.coins
     where user_id = v_purchase.user_id
    returning * into v_wallet;
  end if;

  return jsonb_build_object(
    'purchase_id',       v_purchase.id,
    'already_completed', false,
    'coins',             v_purchase.coins,
    'purchased_balance', v_wallet.purchased_balance
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Webhook: payment failed / session expired
-- -----------------------------------------------------------------------------
create function public.fail_coin_purchase(
  p_purchase_id bigint, p_session_id text, p_status public.payment_status
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_purchase public.coin_purchases;
begin
  if p_status not in ('failed', 'canceled') then
    raise exception 'invalid_purchase_status' using errcode = 'P0001';
  end if;

  select * into v_purchase from public.coin_purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'purchase_not_found' using errcode = 'P0001';
  end if;

  if v_purchase.stripe_checkout_session_id is distinct from p_session_id
     and v_purchase.stripe_checkout_session_id is not null then
    raise exception 'purchase_session_mismatch' using errcode = 'P0001',
      detail = 'purchase ' || p_purchase_id;
  end if;

  -- Never downgrade a completed purchase; repeat events are no-ops.
  if v_purchase.status = 'pending' then
    update public.coin_purchases
       set status = p_status,
           stripe_checkout_session_id = p_session_id
     where id = v_purchase.id
    returning * into v_purchase;
  end if;

  return jsonb_build_object('purchase_id', v_purchase.id, 'status', v_purchase.status);
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges (see *_server_functions.sql)
-- -----------------------------------------------------------------------------
revoke execute on function
  public.create_coin_purchase(uuid, smallint),
  public.attach_checkout_session(bigint, uuid, text),
  public.complete_coin_purchase(bigint, text, text, integer, text),
  public.fail_coin_purchase(bigint, text, public.payment_status)
from public, anon, authenticated;

grant execute on function
  public.create_coin_purchase(uuid, smallint),
  public.attach_checkout_session(bigint, uuid, text),
  public.complete_coin_purchase(bigint, text, text, integer, text),
  public.fail_coin_purchase(bigint, text, public.payment_status)
to service_role;
