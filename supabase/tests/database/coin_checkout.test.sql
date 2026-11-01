-- pgTAP tests for the coin pack checkout functions (Stripe PromptPay).
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- r1 = reader, r2 = reader who gets banned, x1 = suspended
insert into auth.users (id, aud, role, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'buyer1@test', now()),
  ('00000000-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'buyer2@test', now()),
  ('00000000-0000-0000-0000-0000000000d3', 'authenticated', 'authenticated', 'buyer3@test', now());
update public.profiles set status = 'suspended' where id = '00000000-0000-0000-0000-0000000000d3';

create temp table ids (name text primary key, id bigint);
grant all on ids to service_role, authenticated;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
set local role authenticated;
select throws_ok(
  $$ select public.create_coin_purchase('00000000-0000-0000-0000-0000000000d1', 1::smallint) $$,
  '42501', null, 'authenticated cannot call create_coin_purchase');
select throws_ok(
  $$ select public.complete_coin_purchase(1, 'cs_x', 'pi_x', 6400, 'thb') $$,
  '42501', null, 'authenticated cannot call complete_coin_purchase');
reset role;

set local role service_role;

-- -----------------------------------------------------------------------------
-- create_coin_purchase
-- -----------------------------------------------------------------------------
insert into ids
select 'p1', (public.create_coin_purchase('00000000-0000-0000-0000-0000000000d1',
  (select id from public.coin_packs where coins = 50))->>'purchase_id')::bigint;

select results_eq(
  $$ select status::text, coins, amount_satang from public.coin_purchases where id = (select id from ids where name = 'p1') $$,
  $$ values ('pending', 50, 6400) $$,
  'pending purchase snapshots pack coins and price');

select throws_ok(
  $$ select public.create_coin_purchase('00000000-0000-0000-0000-0000000000d1', 999::smallint) $$,
  'P0001', 'coin_pack_not_found', 'unknown pack rejected');

update public.coin_packs set is_active = false where coins = 200;
select throws_ok(
  $$ select public.create_coin_purchase('00000000-0000-0000-0000-0000000000d1',
       (select id from public.coin_packs where coins = 200)) $$,
  'P0001', 'coin_pack_not_found', 'inactive pack rejected');
update public.coin_packs set is_active = true where coins = 200;

select throws_ok(
  $$ select public.create_coin_purchase('00000000-0000-0000-0000-0000000000d3', 1::smallint) $$,
  'P0001', 'account_not_active', 'suspended user cannot start a purchase');

-- -----------------------------------------------------------------------------
-- attach_checkout_session
-- -----------------------------------------------------------------------------
select lives_ok(
  $$ select public.attach_checkout_session((select id from ids where name = 'p1'),
       '00000000-0000-0000-0000-0000000000d1', 'cs_test_p1') $$,
  'attach session to own purchase');
select throws_ok(
  $$ select public.attach_checkout_session((select id from ids where name = 'p1'),
       '00000000-0000-0000-0000-0000000000d2', 'cs_test_p1') $$,
  'P0001', 'purchase_not_found', 'cannot attach to someone else''s purchase');
select throws_ok(
  $$ select public.attach_checkout_session((select id from ids where name = 'p1'),
       '00000000-0000-0000-0000-0000000000d1', 'cs_test_other') $$,
  'P0001', 'purchase_not_found', 'cannot replace an attached session');

-- -----------------------------------------------------------------------------
-- complete_coin_purchase
-- -----------------------------------------------------------------------------
select throws_ok(
  $$ select public.complete_coin_purchase((select id from ids where name = 'p1'), 'cs_test_p1', 'pi_1', 100, 'thb') $$,
  'P0001', 'purchase_amount_mismatch', 'wrong amount rejected');
select throws_ok(
  $$ select public.complete_coin_purchase((select id from ids where name = 'p1'), 'cs_test_p1', 'pi_1', 6400, 'usd') $$,
  'P0001', 'purchase_amount_mismatch', 'wrong currency rejected');
select throws_ok(
  $$ select public.complete_coin_purchase((select id from ids where name = 'p1'), 'cs_test_evil', 'pi_1', 6400, 'thb') $$,
  'P0001', 'purchase_session_mismatch', 'different session rejected');
select throws_ok(
  $$ select public.complete_coin_purchase(987654, 'cs_x', 'pi_x', 6400, 'thb') $$,
  'P0001', 'purchase_not_found', 'unknown purchase rejected');

select is(
  public.complete_coin_purchase((select id from ids where name = 'p1'), 'cs_test_p1', 'pi_1', 6400, 'THB')->>'purchased_balance',
  '50', 'completion credits purchased coins');
select is(
  public.complete_coin_purchase((select id from ids where name = 'p1'), 'cs_test_p1', 'pi_1', 6400, 'thb')->>'already_completed',
  'true', 'repeat webhook is a no-op');

select results_eq(
  $$ select purchased_balance, welcome_balance from public.coin_wallets where user_id = '00000000-0000-0000-0000-0000000000d1' $$,
  $$ values (50, 5) $$,
  'wallet credited exactly once; welcome coins untouched');
select results_eq(
  $$ select count(*)::int, sum(delta)::int from public.coin_ledger
      where purchase_id = (select id from ids where name = 'p1') and reason = 'purchase' $$,
  $$ values (1, 50) $$,
  'one purchase ledger row');
select results_eq(
  $$ select status::text, stripe_payment_intent_id, paid_at is not null from public.coin_purchases
      where id = (select id from ids where name = 'p1') $$,
  $$ values ('succeeded', 'pi_1', true) $$,
  'purchase marked succeeded');

select is(
  public.fail_coin_purchase((select id from ids where name = 'p1'), 'cs_test_p1', 'canceled')->>'status',
  'succeeded', 'late expired/failed event never downgrades a succeeded purchase');

-- -----------------------------------------------------------------------------
-- Webhook arrives before attach (looked up by client_reference_id)
-- -----------------------------------------------------------------------------
insert into ids
select 'p2', (public.create_coin_purchase('00000000-0000-0000-0000-0000000000d1',
  (select id from public.coin_packs where coins = 100))->>'purchase_id')::bigint;
select is(
  public.complete_coin_purchase((select id from ids where name = 'p2'), 'cs_test_p2', 'pi_2', 12100, 'thb')->>'purchased_balance',
  '150', 'completes without an attached session and stores it');
select is(
  (select stripe_checkout_session_id from public.coin_purchases where id = (select id from ids where name = 'p2')),
  'cs_test_p2', 'session id recorded by the webhook');
select lives_ok(
  $$ select public.attach_checkout_session((select id from ids where name = 'p2'),
       '00000000-0000-0000-0000-0000000000d1', 'cs_test_p2') $$,
  'late attach with the same session is fine');

-- -----------------------------------------------------------------------------
-- fail_coin_purchase
-- -----------------------------------------------------------------------------
insert into ids
select 'p3', (public.create_coin_purchase('00000000-0000-0000-0000-0000000000d1',
  (select id from public.coin_packs where coins = 50))->>'purchase_id')::bigint;
select is(
  public.fail_coin_purchase((select id from ids where name = 'p3'), 'cs_test_p3', 'canceled')->>'status',
  'canceled', 'expired session cancels a pending purchase');
select throws_ok(
  $$ select public.fail_coin_purchase((select id from ids where name = 'p3'), 'cs_test_p3', 'succeeded') $$,
  'P0001', 'invalid_purchase_status', 'fail_coin_purchase only accepts failed/canceled');
select is(
  public.complete_coin_purchase((select id from ids where name = 'p3'), 'cs_test_p3', 'pi_3', 6400, 'thb')->>'coins',
  '50', 'money received after a failed/canceled event still credits');

-- -----------------------------------------------------------------------------
-- Paid after ban → payment recorded, coins forfeited
-- -----------------------------------------------------------------------------
insert into ids
select 'p4', (public.create_coin_purchase('00000000-0000-0000-0000-0000000000d2',
  (select id from public.coin_packs where coins = 50))->>'purchase_id')::bigint;
update public.profiles set status = 'banned' where id = '00000000-0000-0000-0000-0000000000d2';
select is(
  public.complete_coin_purchase((select id from ids where name = 'p4'), 'cs_test_p4', 'pi_4', 6400, 'thb')->>'purchased_balance',
  '0', 'banned user''s wallet stays at zero');
select results_eq(
  $$ select reason::text, delta from public.coin_ledger
      where purchase_id = (select id from ids where name = 'p4') order by id $$,
  $$ values ('purchase', 50), ('ban_forfeit', -50) $$,
  'credit and forfeit both recorded');

select * from finish();
rollback;
