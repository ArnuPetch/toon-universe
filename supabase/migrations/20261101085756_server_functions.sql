-- =============================================================================
-- Toon Universe — server-side functions (prototype)
--
-- Every operation that moves coins or money runs as ONE Postgres function so it
-- is atomic (a single transaction) and keeps the ledger consistent.
--
-- Calling convention
--   * Public RPCs live in `public` so the Next.js server can call them with
--     `supabase.rpc()` using the service_role key. EXECUTE is granted to
--     service_role ONLY — anon/authenticated cannot call them.
--   * They are SECURITY INVOKER: service_role already bypasses RLS, and nothing
--     here is reachable by end users.
--   * The acting user is passed explicitly (p_user_id / p_admin_id) because
--     there is no end-user JWT on a service_role call. The server MUST take that
--     id from the verified session (`supabase.auth.getClaims()`), never from the
--     request body.
--   * Admin RPCs re-check `app_metadata.role = 'admin'` in the database as
--     defence in depth.
--   * Errors are raised with SQLSTATE P0001 and a machine-readable message
--     (e.g. 'insufficient_coins'); the server maps them to user-facing text.
--
-- Lock order (to avoid deadlocks): profiles → series → episodes → coin_wallets
-- (wallets always locked in user_id order).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Schema adjustments needed by the server logic
-- -----------------------------------------------------------------------------

-- Released episodes are soft-deleted by the server (refund flow); unlocks keep
-- their FK to the episode row.
alter table public.episodes add column deleted_at timestamptz;

drop policy "episodes: read released or own" on public.episodes;
create policy "episodes: read released or own" on public.episodes
  for select to anon, authenticated
  using (
    deleted_at is null
    and (
      (publish_at <= now() and exists (select 1 from public.series s where s.id = series_id))
      or private.owns_series(series_id)
    )
  );

drop policy "episodes: uploader update" on public.episodes;
create policy "episodes: uploader update" on public.episodes
  for update to authenticated
  using (private.owns_series(series_id) and deleted_at is null)
  with check (private.owns_series(series_id) and (select private.is_active_user()));

-- Same as before, plus: the episode must not be soft-deleted.
create or replace function private.can_read_episode(p_episode_id bigint)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.episodes e
    join public.series s on s.id = e.series_id
    where e.id = p_episode_id
      and e.deleted_at is null
      and (
        s.uploader_id = (select auth.uid())
        or (
          e.publish_at <= now()
          and s.visibility = 'published'
          and s.moderation_status = 'active'
          and s.deleted_at is null
          and private.meets_age_rating(s.age_rating)
          and (
            e.price = 0
            or exists (
              select 1 from public.episode_unlocks u
              where u.episode_id = e.id
                and u.user_id = (select auth.uid())
                and u.refunded_at is null
                and u.expires_at > now()
            )
          )
        )
      )
  );
$$;

-- Once released, an episode's publish_at is fixed. Otherwise an uploader could
-- move a sold episode back to "scheduled" (hiding it from buyers) or delete it
-- via the "unreleased" delete policy and skip the refund flow.
create or replace function private.enforce_episode_price_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.publish_at is distinct from old.publish_at
     and old.publish_at is not null and old.publish_at <= now() then
    raise exception 'Released episodes cannot be rescheduled'
      using errcode = 'check_violation';
  end if;

  if new.price is distinct from old.price
     and old.publish_at is not null and old.publish_at <= now() then
    if old.price_changed_at is not null and old.price_changed_at > now() - interval '1 month' then
      raise exception 'Episode price can only be changed once per month (last change: %)', old.price_changed_at
        using errcode = 'check_violation';
    end if;
    new.price_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger enforce_price_change on public.episodes;
create trigger enforce_episode_rules before update of price, publish_at on public.episodes
  for each row execute function private.enforce_episode_price_change();

-- At most one open review hold per series.
create unique index content_holds_one_open_idx on public.content_holds (series_id)
  where ended_at is null;

-- Lookups used by refund / ban flows.
create index uploader_earnings_pending_idx on public.uploader_earnings (uploader_id, available_at)
  where status = 'pending';
create index user_sanctions_active_idx on public.user_sanctions (user_id)
  where lifted_at is null;

-- =============================================================================
-- Private helpers
-- =============================================================================

-- Raise unless the user exists and is active (not suspended/banned).
create function private.assert_active_user(p_user_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_status public.account_status;
begin
  select status into v_status from public.profiles where id = p_user_id;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0001';
  elsif v_status <> 'active' then
    raise exception 'account_not_active' using errcode = 'P0001', detail = v_status::text;
  end if;
end;
$$;

-- Raise unless the user is an active admin (app_metadata.role = 'admin').
-- SECURITY DEFINER only to read auth.users; not callable by API roles.
create function private.assert_admin(p_admin_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_admin_id is null or not exists (
    select 1
    from auth.users u
    join public.profiles p on p.id = u.id
    where u.id = p_admin_id
      and u.raw_app_meta_data ->> 'role' = 'admin'
      and p.status = 'active'
  ) then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
end;
$$;

-- Age check for an explicit user (service_role calls have no auth.uid()).
create function private.user_meets_age_rating(p_user_id uuid, p_rating public.age_rating)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case p_rating
    when 'all' then true
    else coalesce((
      select age(current_date, birth_date) >= case p_rating when 'teen' then interval '13 years'
                                                            else interval '18 years' end
      from public.user_private_info
      where user_id = p_user_id
    ), false)
  end;
$$;

-- Lock a wallet row and drop expired welcome coins (lazy expiry; a cron job
-- will also sweep them). Returns the up-to-date wallet.
create function private.lock_wallet(p_user_id uuid)
returns public.coin_wallets
language plpgsql
set search_path = ''
as $$
declare
  v_wallet public.coin_wallets;
begin
  select * into v_wallet from public.coin_wallets where user_id = p_user_id for update;
  if not found then
    raise exception 'wallet_not_found' using errcode = 'P0001';
  end if;

  if v_wallet.welcome_balance > 0 and v_wallet.welcome_expires_at <= now() then
    insert into public.coin_ledger (user_id, kind, delta, reason)
    values (p_user_id, 'welcome', -v_wallet.welcome_balance, 'welcome_expire');

    update public.coin_wallets set welcome_balance = 0
     where user_id = p_user_id
    returning * into v_wallet;
  end if;

  return v_wallet;
end;
$$;

-- Refund the purchased-coin part of the given unlocks (welcome coins are not
-- refunded), end their access, and reverse the uploader's pending earnings.
-- Callers decide WHICH unlocks qualify.
create function private.refund_unlocks(p_unlock_ids bigint[], p_note text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
  v_coins integer;
begin
  -- Lock affected wallets in a stable order before touching them.
  perform 1 from public.coin_wallets w
   where w.user_id in (select u.user_id from public.episode_unlocks u where u.id = any (p_unlock_ids))
   order by w.user_id
   for update;

  with refunded as (
    update public.episode_unlocks u
       set refunded_at = now()
     where u.id = any (p_unlock_ids) and u.refunded_at is null
    returning u.id, u.user_id, u.series_id, u.episode_id, u.purchased_coins_used
  ),
  reversed as (
    update public.uploader_earnings e
       set status = 'reversed', reversed_at = now()
      from refunded r
     where e.unlock_id = r.id and e.status = 'pending'
    returning e.id
  ),
  per_user as (
    select user_id, sum(purchased_coins_used)::integer as coins
      from refunded
     where purchased_coins_used > 0
     group by user_id
  ),
  credited as (
    update public.coin_wallets w
       set purchased_balance = w.purchased_balance + p.coins
      from per_user p
     where w.user_id = p.user_id
    returning w.user_id
  ),
  ledger as (
    insert into public.coin_ledger (user_id, kind, delta, reason, unlock_id, note)
    select user_id, 'purchased', purchased_coins_used, 'refund', id, p_note
      from refunded
     where purchased_coins_used > 0
    returning id
  ),
  notified as (
    insert into public.notifications (user_id, type, series_id, episode_id, payload)
    select user_id, 'refund', series_id, episode_id,
           jsonb_build_object('kind', 'unlock', 'coins', purchased_coins_used, 'note', p_note)
      from refunded
    returning id
  )
  select count(*), coalesce(sum(purchased_coins_used), 0)
    into v_count, v_coins
    from refunded;

  return jsonb_build_object('unlocks_refunded', v_count, 'coins_refunded', v_coins);
end;
$$;

-- Refund the given donations to their senders and reverse pending earnings.
create function private.refund_donations(p_donation_ids bigint[], p_note text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
  v_coins integer;
begin
  perform 1 from public.coin_wallets w
   where w.user_id in (select d.from_user_id from public.donations d where d.id = any (p_donation_ids))
   order by w.user_id
   for update;

  with refunded as (
    update public.donations d
       set refunded_at = now()
     where d.id = any (p_donation_ids) and d.refunded_at is null
    returning d.id, d.from_user_id, d.series_id, d.amount
  ),
  reversed as (
    update public.uploader_earnings e
       set status = 'reversed', reversed_at = now()
      from refunded r
     where e.donation_id = r.id and e.status = 'pending'
    returning e.id
  ),
  per_user as (
    select from_user_id as user_id, sum(amount)::integer as coins
      from refunded
     group by from_user_id
  ),
  credited as (
    update public.coin_wallets w
       set purchased_balance = w.purchased_balance + p.coins
      from per_user p
     where w.user_id = p.user_id
    returning w.user_id
  ),
  ledger as (
    insert into public.coin_ledger (user_id, kind, delta, reason, donation_id, note)
    select from_user_id, 'purchased', amount, 'refund', id, p_note
      from refunded
    returning id
  ),
  notified as (
    insert into public.notifications (user_id, type, series_id, payload)
    select from_user_id, 'refund', series_id,
           jsonb_build_object('kind', 'donation', 'coins', amount, 'note', p_note)
      from refunded
    returning id
  )
  select count(*), coalesce(sum(amount), 0)
    into v_count, v_coins
    from refunded;

  return jsonb_build_object('donations_refunded', v_count, 'coins_refunded', v_coins);
end;
$$;

-- Close an open review hold and compensate: extend readers' access and the
-- uploader's withdrawal wait by the hold's duration. Does not change
-- series.moderation_status (the caller decides).
create function private.close_content_hold(p_hold_id bigint)
returns interval
language plpgsql
set search_path = ''
as $$
declare
  v_series_id  bigint;
  v_started_at timestamptz;
  v_duration   interval;
begin
  update public.content_holds
     set ended_at = now(), compensated_at = now()
   where id = p_hold_id and ended_at is null
  returning series_id, started_at into v_series_id, v_started_at;

  if not found then
    raise exception 'hold_not_open' using errcode = 'P0001';
  end if;

  v_duration := now() - v_started_at;

  -- Unlocks that were still valid when the hold started.
  update public.episode_unlocks
     set expires_at = expires_at + v_duration
   where series_id = v_series_id
     and refunded_at is null
     and expires_at > v_started_at;

  -- Earnings (unlocks + donations to this series) not yet withdrawable when the hold started.
  update public.uploader_earnings
     set available_at = available_at + v_duration
   where series_id = v_series_id
     and status = 'pending'
     and available_at > v_started_at;

  return v_duration;
end;
$$;

-- Recompute profiles.status from the user's active sanctions (ban > suspend).
create function private.refresh_user_status(p_user_id uuid)
returns public.account_status
language plpgsql
set search_path = ''
as $$
declare
  v_status public.account_status;
begin
  select case
           when exists (select 1 from public.user_sanctions
                         where user_id = p_user_id and kind = 'ban'
                           and lifted_at is null and starts_at <= now()
                           and (ends_at is null or ends_at > now())) then 'banned'
           when exists (select 1 from public.user_sanctions
                         where user_id = p_user_id and kind = 'suspend'
                           and lifted_at is null and starts_at <= now()
                           and (ends_at is null or ends_at > now())) then 'suspended'
           else 'active'
         end::public.account_status
    into v_status;

  update public.profiles set status = v_status where id = p_user_id and status <> v_status;
  return v_status;
end;
$$;

-- =============================================================================
-- Reader: unlock & donate
-- =============================================================================

-- Unlock an episode for 30 days. Purchased coins are spent before welcome coins;
-- only the purchased part becomes uploader revenue (withdrawable after 30 days).
-- Idempotent: if the user already has access, returns the existing unlock.
create function public.unlock_episode(p_user_id uuid, p_episode_id bigint)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_ep        record;
  v_wallet    public.coin_wallets;
  v_unlock    public.episode_unlocks;
  v_purchased integer;
  v_welcome   integer;
begin
  perform private.assert_active_user(p_user_id);

  -- Share-lock the episode + series so a concurrent removal/hold/ban waits for
  -- us (and then refunds this unlock) or we see its result.
  select e.id, e.series_id, e.price, s.uploader_id, s.age_rating
    into v_ep
    from public.episodes e
    join public.series s on s.id = e.series_id
   where e.id = p_episode_id
     and e.deleted_at is null
     and e.publish_at <= now()
     and s.visibility = 'published'
     and s.moderation_status = 'active'
     and s.deleted_at is null
     for share of e, s;

  if not found then
    raise exception 'episode_not_available' using errcode = 'P0001';
  elsif v_ep.uploader_id = p_user_id then
    raise exception 'own_episode' using errcode = 'P0001';
  elsif v_ep.price = 0 then
    raise exception 'episode_is_free' using errcode = 'P0001';
  elsif not private.user_meets_age_rating(p_user_id, v_ep.age_rating) then
    raise exception 'age_restricted' using errcode = 'P0001';
  end if;

  -- The wallet lock also serialises concurrent unlocks by the same user.
  v_wallet := private.lock_wallet(p_user_id);

  select * into v_unlock
    from public.episode_unlocks
   where user_id = p_user_id and episode_id = p_episode_id
     and refunded_at is null and expires_at > now()
   order by expires_at desc
   limit 1;

  if found then
    return jsonb_build_object(
      'unlock_id', v_unlock.id,
      'expires_at', v_unlock.expires_at,
      'already_unlocked', true,
      'purchased_balance', v_wallet.purchased_balance,
      'welcome_balance', v_wallet.welcome_balance
    );
  end if;

  if v_wallet.purchased_balance + v_wallet.welcome_balance < v_ep.price then
    raise exception 'insufficient_coins' using errcode = 'P0001',
      detail = format('price=%s purchased=%s welcome=%s',
                      v_ep.price, v_wallet.purchased_balance, v_wallet.welcome_balance);
  end if;

  v_purchased := least(v_wallet.purchased_balance, v_ep.price);
  v_welcome   := v_ep.price - v_purchased;

  update public.coin_wallets
     set purchased_balance = purchased_balance - v_purchased,
         welcome_balance   = welcome_balance   - v_welcome
   where user_id = p_user_id
  returning * into v_wallet;

  insert into public.episode_unlocks
    (user_id, episode_id, series_id, price, purchased_coins_used, welcome_coins_used, expires_at)
  values
    (p_user_id, v_ep.id, v_ep.series_id, v_ep.price, v_purchased, v_welcome, now() + interval '30 days')
  returning * into v_unlock;

  insert into public.coin_ledger (user_id, kind, delta, reason, unlock_id)
  select p_user_id, k.kind, -k.amount, 'unlock', v_unlock.id
    from (values ('purchased'::public.coin_kind, v_purchased),
                 ('welcome'::public.coin_kind,   v_welcome)) as k (kind, amount)
   where k.amount > 0;

  if v_purchased > 0 then
    insert into public.uploader_earnings
      (uploader_id, source, unlock_id, series_id, amount, available_at)
    values
      (v_ep.uploader_id, 'unlock', v_unlock.id, v_ep.series_id, v_purchased, now() + interval '30 days');
  end if;

  return jsonb_build_object(
    'unlock_id', v_unlock.id,
    'expires_at', v_unlock.expires_at,
    'already_unlocked', false,
    'purchased_coins_used', v_purchased,
    'welcome_coins_used', v_welcome,
    'purchased_balance', v_wallet.purchased_balance,
    'welcome_balance', v_wallet.welcome_balance
  );
end;
$$;

-- Tip an uploader (min 10, purchased coins only). Optional series context.
create function public.donate(
  p_from_user_id uuid,
  p_to_user_id   uuid,
  p_amount       integer,
  p_series_id    bigint default null,
  p_message      text   default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_wallet   public.coin_wallets;
  v_donation public.donations;
begin
  perform private.assert_active_user(p_from_user_id);

  if p_amount is null or p_amount < 10 then
    raise exception 'donation_below_minimum' using errcode = 'P0001', detail = 'min=10';
  elsif p_from_user_id = p_to_user_id then
    raise exception 'cannot_donate_to_self' using errcode = 'P0001';
  end if;

  -- Recipient must be active. Share-lock so a concurrent ban waits for us.
  perform 1 from public.profiles where id = p_to_user_id and status = 'active' for share;
  if not found then
    raise exception 'recipient_not_available' using errcode = 'P0001';
  end if;

  if p_series_id is not null then
    perform 1 from public.series
     where id = p_series_id and uploader_id = p_to_user_id
       and visibility = 'published' and moderation_status = 'active' and deleted_at is null
     for share;
    if not found then
      raise exception 'series_not_available' using errcode = 'P0001';
    end if;
  end if;

  v_wallet := private.lock_wallet(p_from_user_id);

  if v_wallet.purchased_balance < p_amount then
    raise exception 'insufficient_coins' using errcode = 'P0001',
      detail = format('amount=%s purchased=%s', p_amount, v_wallet.purchased_balance);
  end if;

  update public.coin_wallets
     set purchased_balance = purchased_balance - p_amount
   where user_id = p_from_user_id
  returning * into v_wallet;

  insert into public.donations (from_user_id, to_user_id, series_id, amount, message)
  values (p_from_user_id, p_to_user_id, p_series_id, p_amount, nullif(btrim(p_message), ''))
  returning * into v_donation;

  insert into public.coin_ledger (user_id, kind, delta, reason, donation_id)
  values (p_from_user_id, 'purchased', -p_amount, 'donation', v_donation.id);

  insert into public.uploader_earnings
    (uploader_id, source, donation_id, series_id, amount, available_at)
  values
    (p_to_user_id, 'donation', v_donation.id, p_series_id, p_amount, now() + interval '30 days');

  return jsonb_build_object(
    'donation_id', v_donation.id,
    'purchased_balance', v_wallet.purchased_balance
  );
end;
$$;

-- =============================================================================
-- Content removal (uploader or admin) → refunds
-- =============================================================================

-- Soft-delete a series. Refunds 100% of purchased coins for unlocks that are
-- still valid, reverses the matching pending earnings, and refunds donations
-- to this series that the uploader cannot withdraw yet.
create function public.remove_series(p_series_id bigint, p_actor_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_series    public.series;
  v_is_admin  boolean := false;
  v_hold_id   bigint;
  v_unlocks   jsonb;
  v_donations jsonb;
begin
  select * into v_series from public.series
   where id = p_series_id and deleted_at is null
   for update;
  if not found then
    raise exception 'series_not_found' using errcode = 'P0001';
  end if;

  if v_series.uploader_id is distinct from p_actor_id then
    perform private.assert_admin(p_actor_id);
    v_is_admin := true;
  elsif exists (select 1 from public.profiles where id = p_actor_id and status = 'banned') then
    raise exception 'account_not_active' using errcode = 'P0001', detail = 'banned';
  end if;

  -- Compensate first so the refund sees the extended access periods.
  select id into v_hold_id from public.content_holds
   where series_id = p_series_id and ended_at is null;
  if found then
    perform private.close_content_hold(v_hold_id);
  end if;

  update public.series
     set deleted_at = now(),
         moderation_status = case when v_is_admin then 'removed' else moderation_status end
   where id = p_series_id;

  v_unlocks := private.refund_unlocks(
    array(select id from public.episode_unlocks
           where series_id = p_series_id and refunded_at is null and expires_at > now()),
    'series_removed');

  v_donations := private.refund_donations(
    array(select d.id
            from public.donations d
            join public.uploader_earnings e on e.donation_id = d.id
           where d.series_id = p_series_id
             and d.refunded_at is null
             and e.status = 'pending'
             and e.available_at > now()),
    'series_removed');

  return jsonb_build_object('series_id', p_series_id, 'unlocks', v_unlocks, 'donations', v_donations);
end;
$$;

-- Soft-delete one released episode and refund its still-valid unlocks.
-- (Unreleased/draft episodes can be deleted by the uploader directly via RLS.)
create function public.remove_episode(p_episode_id bigint, p_actor_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_uploader_id uuid;
  v_series_id   bigint;
  v_unlocks     jsonb;
begin
  select s.uploader_id, s.id into v_uploader_id, v_series_id
    from public.episodes e
    join public.series s on s.id = e.series_id
   where e.id = p_episode_id and e.deleted_at is null
     for update of e;
  if not found then
    raise exception 'episode_not_found' using errcode = 'P0001';
  end if;

  if v_uploader_id is distinct from p_actor_id then
    perform private.assert_admin(p_actor_id);
  elsif exists (select 1 from public.profiles where id = p_actor_id and status = 'banned') then
    raise exception 'account_not_active' using errcode = 'P0001', detail = 'banned';
  end if;

  update public.episodes set deleted_at = now() where id = p_episode_id;

  v_unlocks := private.refund_unlocks(
    array(select id from public.episode_unlocks
           where episode_id = p_episode_id and refunded_at is null and expires_at > now()),
    'episode_removed');

  return jsonb_build_object('episode_id', p_episode_id, 'series_id', v_series_id, 'unlocks', v_unlocks);
end;
$$;

-- =============================================================================
-- Withdrawals
-- =============================================================================

-- Request a payout of ALL currently withdrawable earnings (min 100 coin = 100 THB).
-- Earnings from a series that is under review are held back until the review ends.
create function public.request_withdrawal(p_uploader_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_payout     public.payout_accounts;
  v_ids        bigint[];
  v_amount     integer;
  v_withdrawal public.withdrawals;
begin
  perform private.assert_active_user(p_uploader_id);

  -- Serialise withdrawal requests per uploader.
  perform 1 from public.profiles where id = p_uploader_id for update;

  select array_agg(e.id), coalesce(sum(e.amount), 0)
    into v_ids, v_amount
    from public.uploader_earnings e
   where e.uploader_id = p_uploader_id
     and e.status = 'pending'
     and e.available_at <= now()
     and not exists (select 1 from public.series s
                      where s.id = e.series_id and s.moderation_status = 'under_review');

  if v_amount < 100 then
    raise exception 'below_minimum_withdrawal' using errcode = 'P0001',
      detail = format('available=%s min=100', v_amount);
  end if;

  select * into v_payout from public.payout_accounts where user_id = p_uploader_id;
  if not found then
    raise exception 'payout_account_missing' using errcode = 'P0001';
  end if;

  insert into public.withdrawals (uploader_id, amount, promptpay_id, account_name)
  values (p_uploader_id, v_amount, v_payout.promptpay_id, v_payout.account_name)
  returning * into v_withdrawal;

  update public.uploader_earnings
     set status = 'withdrawn', withdrawal_id = v_withdrawal.id
   where id = any (v_ids);

  return jsonb_build_object(
    'withdrawal_id', v_withdrawal.id,
    'amount', v_withdrawal.amount,
    'earnings_count', cardinality(v_ids)
  );
end;
$$;

-- Admin: approve or reject a pending withdrawal. Rejecting releases the
-- earnings back to the uploader's withdrawable balance.
create function public.review_withdrawal(
  p_withdrawal_id bigint,
  p_admin_id      uuid,
  p_approve       boolean,
  p_reject_reason text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_w public.withdrawals;
begin
  perform private.assert_admin(p_admin_id);

  select * into v_w from public.withdrawals where id = p_withdrawal_id for update;
  if not found then
    raise exception 'withdrawal_not_found' using errcode = 'P0001';
  elsif v_w.status <> 'pending' then
    raise exception 'withdrawal_not_pending' using errcode = 'P0001', detail = v_w.status::text;
  end if;

  if p_approve then
    update public.withdrawals
       set status = 'approved', reviewed_by = p_admin_id, reviewed_at = now()
     where id = p_withdrawal_id
    returning * into v_w;
  else
    if nullif(btrim(p_reject_reason), '') is null then
      raise exception 'reject_reason_required' using errcode = 'P0001';
    end if;

    update public.withdrawals
       set status = 'rejected', reviewed_by = p_admin_id, reviewed_at = now(),
           reject_reason = btrim(p_reject_reason)
     where id = p_withdrawal_id
    returning * into v_w;

    update public.uploader_earnings
       set status = 'pending', withdrawal_id = null
     where withdrawal_id = p_withdrawal_id;
  end if;

  insert into public.notifications (user_id, type, payload)
  values (v_w.uploader_id, 'withdrawal_update',
          jsonb_build_object('withdrawal_id', v_w.id, 'status', v_w.status,
                             'amount', v_w.amount, 'reason', v_w.reject_reason));

  return jsonb_build_object('withdrawal_id', v_w.id, 'status', v_w.status);
end;
$$;

-- Admin: record that the manual PromptPay transfer was made.
create function public.mark_withdrawal_paid(
  p_withdrawal_id bigint,
  p_admin_id      uuid,
  p_transfer_ref  text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_w public.withdrawals;
begin
  perform private.assert_admin(p_admin_id);

  if nullif(btrim(p_transfer_ref), '') is null then
    raise exception 'transfer_ref_required' using errcode = 'P0001';
  end if;

  update public.withdrawals
     set status = 'paid', paid_at = now(), transfer_ref = btrim(p_transfer_ref)
   where id = p_withdrawal_id and status = 'approved'
  returning * into v_w;
  if not found then
    raise exception 'withdrawal_not_approved' using errcode = 'P0001';
  end if;

  insert into public.notifications (user_id, type, payload)
  values (v_w.uploader_id, 'withdrawal_update',
          jsonb_build_object('withdrawal_id', v_w.id, 'status', v_w.status, 'amount', v_w.amount));

  return jsonb_build_object('withdrawal_id', v_w.id, 'status', v_w.status, 'paid_at', v_w.paid_at);
end;
$$;

-- =============================================================================
-- Sanctions: suspend / ban / lift
-- =============================================================================

-- Suspend: account cannot act (unlock, donate, upload, comment, withdraw) but
-- coins and earnings are kept. p_ends_at null = until lifted.
create function public.suspend_user(
  p_user_id  uuid,
  p_admin_id uuid,
  p_reason   text,
  p_ends_at  timestamptz default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_status   public.account_status;
  v_sanction public.user_sanctions;
begin
  perform private.assert_admin(p_admin_id);

  if p_user_id = p_admin_id then
    raise exception 'cannot_sanction_self' using errcode = 'P0001';
  elsif nullif(btrim(p_reason), '') is null then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  select status into v_status from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0001';
  elsif v_status = 'banned' then
    raise exception 'already_banned' using errcode = 'P0001';
  end if;

  insert into public.user_sanctions (user_id, kind, reason, ends_at, created_by)
  values (p_user_id, 'suspend', btrim(p_reason), p_ends_at, p_admin_id)
  returning * into v_sanction;

  v_status := private.refresh_user_status(p_user_id);

  return jsonb_build_object('sanction_id', v_sanction.id, 'status', v_status);
end;
$$;

-- Ban: the user's coins are forfeited. As an uploader, their series are
-- removed; readers/donors are refunded for anything the uploader could not
-- withdraw yet; remaining unpaid earnings and open withdrawals are forfeited.
-- The server must also block sign-in (auth.admin.updateUserById ban_duration).
create function public.ban_user(p_user_id uuid, p_admin_id uuid, p_reason text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_status      public.account_status;
  v_sanction    public.user_sanctions;
  v_hold        record;
  v_series      integer;
  v_unlock_ids   bigint[];
  v_donation_ids bigint[];
  v_unlocks     jsonb;
  v_donations   jsonb;
  v_forfeited   integer;
  v_withdrawals integer;
  v_wallet      public.coin_wallets;
begin
  perform private.assert_admin(p_admin_id);

  if p_user_id = p_admin_id then
    raise exception 'cannot_sanction_self' using errcode = 'P0001';
  elsif nullif(btrim(p_reason), '') is null then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  select status into v_status from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0001';
  elsif v_status = 'banned' then
    raise exception 'already_banned' using errcode = 'P0001';
  end if;

  insert into public.user_sanctions (user_id, kind, reason, created_by)
  values (p_user_id, 'ban', btrim(p_reason), p_admin_id)
  returning * into v_sanction;

  perform private.refresh_user_status(p_user_id);

  -- 1) Take down the uploader's series (lock them first, in id order).
  perform 1 from public.series
   where uploader_id = p_user_id and deleted_at is null
   order by id
   for update;

  for v_hold in
    select h.id from public.content_holds h
      join public.series s on s.id = h.series_id
     where s.uploader_id = p_user_id and h.ended_at is null
  loop
    perform private.close_content_hold(v_hold.id);
  end loop;

  update public.series
     set moderation_status = 'removed'
   where uploader_id = p_user_id and deleted_at is null and moderation_status <> 'removed';
  get diagnostics v_series = row_count;

  -- 2) Refund readers/donors for earnings that are not withdrawable yet.
  v_unlock_ids := array(
    select unlock_id from public.uploader_earnings
     where uploader_id = p_user_id and source = 'unlock'
       and status = 'pending' and available_at > now());
  v_donation_ids := array(
    select donation_id from public.uploader_earnings
     where uploader_id = p_user_id and source = 'donation'
       and status = 'pending' and available_at > now());

  -- Lock every wallet this ban touches (readers, donors, the user) in one ordered pass.
  perform 1 from public.coin_wallets w
   where w.user_id = p_user_id
      or w.user_id in (select u.user_id from public.episode_unlocks u where u.id = any (v_unlock_ids))
      or w.user_id in (select d.from_user_id from public.donations d where d.id = any (v_donation_ids))
   order by w.user_id
   for update;

  v_unlocks   := private.refund_unlocks(v_unlock_ids, 'uploader_banned');
  v_donations := private.refund_donations(v_donation_ids, 'uploader_banned');

  -- 3) Close open withdrawals and forfeit every remaining unpaid earning.
  update public.withdrawals
     set status = 'rejected', reviewed_by = p_admin_id, reviewed_at = now(),
         reject_reason = 'account_banned'
   where uploader_id = p_user_id and status in ('pending', 'approved');
  get diagnostics v_withdrawals = row_count;

  update public.uploader_earnings e
     set status = 'reversed', reversed_at = now(), withdrawal_id = null
   where e.uploader_id = p_user_id
     and (e.status = 'pending'
          or (e.status = 'withdrawn'
              and exists (select 1 from public.withdrawals w
                           where w.id = e.withdrawal_id and w.status = 'rejected')));
  get diagnostics v_forfeited = row_count;

  -- 4) Forfeit the user's own coins.
  v_wallet := private.lock_wallet(p_user_id);

  insert into public.coin_ledger (user_id, kind, delta, reason, note)
  select p_user_id, k.kind, -k.amount, 'ban_forfeit', 'sanction ' || v_sanction.id
    from (values ('purchased'::public.coin_kind, v_wallet.purchased_balance),
                 ('welcome'::public.coin_kind,   v_wallet.welcome_balance)) as k (kind, amount)
   where k.amount > 0;

  update public.coin_wallets
     set purchased_balance = 0, welcome_balance = 0
   where user_id = p_user_id;

  return jsonb_build_object(
    'sanction_id', v_sanction.id,
    'series_removed', v_series,
    'unlocks', v_unlocks,
    'donations', v_donations,
    'withdrawals_rejected', v_withdrawals,
    'earnings_forfeited', v_forfeited,
    'coins_forfeited', jsonb_build_object('purchased', v_wallet.purchased_balance,
                                          'welcome',   v_wallet.welcome_balance)
  );
end;
$$;

-- Lift a sanction early. Lifting a ban does NOT restore forfeited coins or
-- removed series.
create function public.lift_sanction(p_sanction_id bigint, p_admin_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_status  public.account_status;
begin
  perform private.assert_admin(p_admin_id);

  update public.user_sanctions
     set lifted_at = now()
   where id = p_sanction_id and lifted_at is null
  returning user_id into v_user_id;
  if not found then
    raise exception 'sanction_not_active' using errcode = 'P0001';
  end if;

  perform 1 from public.profiles where id = v_user_id for update;
  v_status := private.refresh_user_status(v_user_id);

  return jsonb_build_object('user_id', v_user_id, 'status', v_status);
end;
$$;

-- =============================================================================
-- Content review holds
-- =============================================================================

-- Admin: close a series for review. Readers lose access during the hold; it is
-- given back (plus the uploader's withdrawal wait is extended) when it ends.
create function public.start_content_hold(p_series_id bigint, p_admin_id uuid, p_reason text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_series public.series;
  v_hold   public.content_holds;
begin
  perform private.assert_admin(p_admin_id);

  if nullif(btrim(p_reason), '') is null then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  update public.series
     set moderation_status = 'under_review'
   where id = p_series_id and deleted_at is null and moderation_status = 'active'
  returning * into v_series;
  if not found then
    raise exception 'series_not_active' using errcode = 'P0001';
  end if;

  insert into public.content_holds (series_id, reason, created_by)
  values (p_series_id, btrim(p_reason), p_admin_id)
  returning * into v_hold;

  insert into public.notifications (user_id, type, series_id, payload)
  values (v_series.uploader_id, 'moderation', p_series_id,
          jsonb_build_object('action', 'hold_started', 'hold_id', v_hold.id, 'reason', v_hold.reason));

  return jsonb_build_object('hold_id', v_hold.id, 'started_at', v_hold.started_at);
end;
$$;

-- Admin: end the review and reopen the series, compensating readers and the
-- uploader for the time it was closed. (To take it down instead, call
-- remove_series, which closes and compensates the hold before refunding.)
create function public.end_content_hold(p_series_id bigint, p_admin_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_hold_id     bigint;
  v_uploader_id uuid;
  v_duration    interval;
begin
  perform private.assert_admin(p_admin_id);

  select uploader_id into v_uploader_id from public.series
   where id = p_series_id and deleted_at is null and moderation_status = 'under_review'
   for update;
  if not found then
    raise exception 'series_not_under_review' using errcode = 'P0001';
  end if;

  select id into v_hold_id from public.content_holds
   where series_id = p_series_id and ended_at is null;
  if not found then
    raise exception 'hold_not_open' using errcode = 'P0001';
  end if;

  v_duration := private.close_content_hold(v_hold_id);

  update public.series set moderation_status = 'active' where id = p_series_id;

  insert into public.notifications (user_id, type, series_id, payload)
  values (v_uploader_id, 'moderation', p_series_id,
          jsonb_build_object('action', 'hold_ended', 'hold_id', v_hold_id,
                             'extended_by_seconds', extract(epoch from v_duration)::bigint));

  return jsonb_build_object(
    'hold_id', v_hold_id,
    'extended_by_seconds', extract(epoch from v_duration)::bigint
  );
end;
$$;

-- =============================================================================
-- Privileges
-- Supabase's default privileges grant EXECUTE on new functions to anon and
-- authenticated, so revoke from them explicitly (not just from PUBLIC).
-- =============================================================================
revoke execute on function
  private.assert_active_user(uuid),
  private.assert_admin(uuid),
  private.user_meets_age_rating(uuid, public.age_rating),
  private.lock_wallet(uuid),
  private.refund_unlocks(bigint[], text),
  private.refund_donations(bigint[], text),
  private.close_content_hold(bigint),
  private.refresh_user_status(uuid),
  public.unlock_episode(uuid, bigint),
  public.donate(uuid, uuid, integer, bigint, text),
  public.remove_series(bigint, uuid),
  public.remove_episode(bigint, uuid),
  public.request_withdrawal(uuid),
  public.review_withdrawal(bigint, uuid, boolean, text),
  public.mark_withdrawal_paid(bigint, uuid, text),
  public.suspend_user(uuid, uuid, text, timestamptz),
  public.ban_user(uuid, uuid, text),
  public.lift_sanction(bigint, uuid),
  public.start_content_hold(bigint, uuid, text),
  public.end_content_hold(bigint, uuid)
from public, anon, authenticated;

grant execute on function
  private.assert_active_user(uuid),
  private.assert_admin(uuid),
  private.user_meets_age_rating(uuid, public.age_rating),
  private.lock_wallet(uuid),
  private.refund_unlocks(bigint[], text),
  private.refund_donations(bigint[], text),
  private.close_content_hold(bigint),
  private.refresh_user_status(uuid),
  public.unlock_episode(uuid, bigint),
  public.donate(uuid, uuid, integer, bigint, text),
  public.remove_series(bigint, uuid),
  public.remove_episode(bigint, uuid),
  public.request_withdrawal(uuid),
  public.review_withdrawal(bigint, uuid, boolean, text),
  public.mark_withdrawal_paid(bigint, uuid, text),
  public.suspend_user(uuid, uuid, text, timestamptz),
  public.ban_user(uuid, uuid, text),
  public.lift_sanction(bigint, uuid),
  public.start_content_hold(bigint, uuid, text),
  public.end_content_hold(bigint, uuid)
to service_role;
