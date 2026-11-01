-- pgTAP tests for the server-side functions (unlock, donate, holds, withdrawals,
-- removal refunds, sanctions). Everything runs in one rolled-back transaction,
-- so now() is constant — time is simulated by back-dating rows.
--
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- -----------------------------------------------------------------------------
-- Fixtures (as postgres)
--   a1 = admin, b1 = uploader, c1 / c2 = readers
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'admin@test',    now(), '{"role":"admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'uploader@test', now(), '{}'),
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'reader1@test',  now(), '{}'),
  ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'reader2@test',  now(), '{}');

insert into public.series (id, uploader_id, slug, title, visibility, age_rating)
overriding system value values
  (1001, '00000000-0000-0000-0000-0000000000b1', 'main',   'Main',   'published', 'all'),
  (1002, '00000000-0000-0000-0000-0000000000b1', 'mature', 'Mature', 'published', 'mature'),
  (1003, '00000000-0000-0000-0000-0000000000b1', 'doomed', 'Doomed', 'published', 'all');

insert into public.episodes (id, series_id, number, price, publish_at)
overriding system value values
  (2001, 1001, 1,   0, now() - interval '1 day'),
  (2002, 1001, 2,   8, now() - interval '1 day'),
  (2003, 1001, 3,   3, now() - interval '1 day'),
  (2004, 1001, 4, 100, now() - interval '1 day'),
  (2005, 1001, 5,   5, now() + interval '1 day'),   -- scheduled
  (2006, 1001, 6,   7, now() - interval '1 day'),
  (2011, 1002, 1,   5, now() - interval '1 day'),
  (2021, 1003, 1,  20, now() - interval '1 day');

-- reader1 has 300 purchased coins; reader2 only the 5 welcome coins from signup.
update public.coin_wallets set purchased_balance = 300
 where user_id = '00000000-0000-0000-0000-0000000000c1';
insert into public.coin_ledger (user_id, kind, delta, reason)
values ('00000000-0000-0000-0000-0000000000c1', 'purchased', 300, 'admin_adjust');

-- -----------------------------------------------------------------------------
-- Privileges: API roles cannot call the RPCs
-- -----------------------------------------------------------------------------
set local role authenticated;
select throws_ok(
  $$select public.unlock_episode('00000000-0000-0000-0000-0000000000c1', 2002)$$,
  '42501', null, 'authenticated cannot call unlock_episode');
reset role;
set local role anon;
select throws_ok(
  $$select public.ban_user('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'x')$$,
  '42501', null, 'anon cannot call ban_user');
reset role;

set local role service_role;

-- -----------------------------------------------------------------------------
-- unlock_episode
-- -----------------------------------------------------------------------------
select is(
  (public.unlock_episode('00000000-0000-0000-0000-0000000000c1', 2002) ->> 'purchased_coins_used')::int,
  8, 'unlock spends purchased coins first');
select is(
  (select purchased_balance || '/' || welcome_balance from public.coin_wallets
    where user_id = '00000000-0000-0000-0000-0000000000c1'),
  '292/5', 'reader1 wallet after unlock');
select is(
  (select amount from public.uploader_earnings e join public.episode_unlocks u on u.id = e.unlock_id
    where u.episode_id = 2002 and u.user_id = '00000000-0000-0000-0000-0000000000c1'),
  8, 'uploader earns the purchased part');
select is(
  (public.unlock_episode('00000000-0000-0000-0000-0000000000c1', 2002) ->> 'already_unlocked')::boolean,
  true, 'second unlock is idempotent');
select is(
  (select purchased_balance from public.coin_wallets where user_id = '00000000-0000-0000-0000-0000000000c1'),
  292, 'idempotent unlock does not charge again');

select is(
  (public.unlock_episode('00000000-0000-0000-0000-0000000000c2', 2003) ->> 'welcome_coins_used')::int,
  3, 'welcome coins used when no purchased coins');
select is(
  (select count(*)::int from public.uploader_earnings e join public.episode_unlocks u on u.id = e.unlock_id
    where u.user_id = '00000000-0000-0000-0000-0000000000c2'),
  0, 'welcome coins are not uploader revenue');
select throws_ok(
  $$select public.unlock_episode('00000000-0000-0000-0000-0000000000c2', 2002)$$,
  'P0001', 'insufficient_coins', 'not enough coins');

select throws_ok($$select public.unlock_episode('00000000-0000-0000-0000-0000000000c1', 2005)$$,
  'P0001', 'episode_not_available', 'scheduled episode');
select throws_ok($$select public.unlock_episode('00000000-0000-0000-0000-0000000000b1', 2002)$$,
  'P0001', 'own_episode', 'uploader cannot buy own episode');
select throws_ok($$select public.unlock_episode('00000000-0000-0000-0000-0000000000c1', 2001)$$,
  'P0001', 'episode_is_free', 'free episode');
select throws_ok($$select public.unlock_episode('00000000-0000-0000-0000-0000000000c1', 2011)$$,
  'P0001', 'age_restricted', 'mature series without birth date');

-- Expired welcome coins are dropped (and logged) the next time the wallet is touched.
update public.coin_wallets set welcome_expires_at = now() - interval '1 second'
 where user_id = '00000000-0000-0000-0000-0000000000c2';
select public.unlock_episode('00000000-0000-0000-0000-0000000000c2', 2003);
select is(
  (select welcome_balance from public.coin_wallets where user_id = '00000000-0000-0000-0000-0000000000c2'),
  0, 'expired welcome coins removed');
select is(
  (select delta from public.coin_ledger
    where user_id = '00000000-0000-0000-0000-0000000000c2' and reason = 'welcome_expire'),
  -2, 'welcome expiry logged in ledger');

-- -----------------------------------------------------------------------------
-- donate
-- -----------------------------------------------------------------------------
select throws_ok(
  $$select public.donate('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 5)$$,
  'P0001', 'donation_below_minimum', 'min 10');
select throws_ok(
  $$select public.donate('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 10)$$,
  'P0001', 'cannot_donate_to_self', 'no self donation');
select throws_ok(
  $$select public.donate('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', 10)$$,
  'P0001', 'insufficient_coins', 'welcome coins cannot be donated');
select is(
  (public.donate('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 10, 1001, 'สู้ๆ')
    ->> 'purchased_balance')::int,
  282, 'donation deducts purchased coins');

-- -----------------------------------------------------------------------------
-- content holds
-- -----------------------------------------------------------------------------
select throws_ok(
  $$select public.start_content_hold(1001, '00000000-0000-0000-0000-0000000000c1', 'x')$$,
  'P0001', 'not_admin', 'non-admin cannot hold');
select lives_ok(
  $$select public.start_content_hold(1001, '00000000-0000-0000-0000-0000000000a1', 'copyright check')$$,
  'admin starts hold');
select throws_ok($$select public.unlock_episode('00000000-0000-0000-0000-0000000000c1', 2003)$$,
  'P0001', 'episode_not_available', 'cannot unlock during hold');

-- Pretend the hold started 2 days ago.
update public.content_holds set started_at = now() - interval '2 days' where series_id = 1001;
select public.end_content_hold(1001, '00000000-0000-0000-0000-0000000000a1');
select is(
  (select expires_at from public.episode_unlocks
    where user_id = '00000000-0000-0000-0000-0000000000c1' and episode_id = 2002),
  now() + interval '32 days', 'access extended by hold duration');
select is(
  (select available_at from public.uploader_earnings where source = 'donation' and series_id = 1001),
  now() + interval '32 days', 'withdrawal wait extended by hold duration');
select is((select moderation_status::text from public.series where id = 1001), 'active', 'series reopened');

-- -----------------------------------------------------------------------------
-- withdrawals
-- -----------------------------------------------------------------------------
select public.unlock_episode('00000000-0000-0000-0000-0000000000c1', 2004);   -- +100 earnings
select throws_ok($$select public.request_withdrawal('00000000-0000-0000-0000-0000000000b1')$$,
  'P0001', 'below_minimum_withdrawal', 'nothing withdrawable before 30 days');

update public.uploader_earnings set available_at = now() - interval '1 day'
 where uploader_id = '00000000-0000-0000-0000-0000000000b1';
select throws_ok($$select public.request_withdrawal('00000000-0000-0000-0000-0000000000b1')$$,
  'P0001', 'payout_account_missing', 'needs payout account');

insert into public.payout_accounts (user_id, promptpay_id, account_name)
values ('00000000-0000-0000-0000-0000000000b1', '0812345678', 'Uploader');

select is(
  (public.request_withdrawal('00000000-0000-0000-0000-0000000000b1') ->> 'amount')::int,
  118, 'withdraws all available earnings (8 + 10 + 100)');
select throws_ok($$select public.request_withdrawal('00000000-0000-0000-0000-0000000000b1')$$,
  'P0001', 'below_minimum_withdrawal', 'earnings cannot be withdrawn twice');

select throws_ok(
  format($$select public.review_withdrawal(%s, '00000000-0000-0000-0000-0000000000a1', false)$$,
         (select max(id) from public.withdrawals)),
  'P0001', 'reject_reason_required', 'reject needs a reason');
select public.review_withdrawal((select max(id) from public.withdrawals),
                                '00000000-0000-0000-0000-0000000000a1', false, 'wrong account name');
select is(
  (select count(*)::int from public.uploader_earnings
    where uploader_id = '00000000-0000-0000-0000-0000000000b1' and status = 'pending'),
  3, 'rejected withdrawal releases earnings');

select public.request_withdrawal('00000000-0000-0000-0000-0000000000b1');
select throws_ok(
  format($$select public.mark_withdrawal_paid(%s, '00000000-0000-0000-0000-0000000000a1', 'ref1')$$,
         (select max(id) from public.withdrawals)),
  'P0001', 'withdrawal_not_approved', 'must approve before paying');
select public.review_withdrawal((select max(id) from public.withdrawals),
                                '00000000-0000-0000-0000-0000000000a1', true);
select is(
  public.mark_withdrawal_paid((select max(id) from public.withdrawals),
                              '00000000-0000-0000-0000-0000000000a1', 'KBANK-123') ->> 'status',
  'paid', 'withdrawal paid');

-- -----------------------------------------------------------------------------
-- remove_series / remove_episode → refunds
-- -----------------------------------------------------------------------------
update public.coin_wallets set purchased_balance = 400
 where user_id = '00000000-0000-0000-0000-0000000000c2';
insert into public.coin_ledger (user_id, kind, delta, reason)
values ('00000000-0000-0000-0000-0000000000c2', 'purchased', 400, 'admin_adjust');

select public.unlock_episode('00000000-0000-0000-0000-0000000000c1', 2021);           -- 20, still valid
select public.donate('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', 15, 1003);
select public.donate('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', 10, 1003);
-- the 10-coin donation is already withdrawable → must NOT be refunded
update public.uploader_earnings e set available_at = now() - interval '1 day'
  from public.donations d
 where e.donation_id = d.id and d.series_id = 1003 and d.amount = 10;

select throws_ok($$select public.remove_series(1003, '00000000-0000-0000-0000-0000000000c1')$$,
  'P0001', 'not_admin', 'stranger cannot remove series');
select is(
  public.remove_series(1003, '00000000-0000-0000-0000-0000000000b1'),
  '{"series_id": 1003, "unlocks": {"coins_refunded": 20, "unlocks_refunded": 1},
    "donations": {"coins_refunded": 15, "donations_refunded": 1}}'::jsonb,
  'series removal refunds valid unlocks + not-yet-withdrawable donations');
select is(
  (select purchased_balance from public.coin_wallets where user_id = '00000000-0000-0000-0000-0000000000c2'),
  400 - 15 - 10 + 15, 'donor refunded 15 only');
select is(
  (select count(*)::int from public.uploader_earnings where series_id = 1003 and status = 'reversed'),
  2, 'uploader earnings reversed for refunded items');

select is(
  public.remove_episode(2003, '00000000-0000-0000-0000-0000000000b1') -> 'unlocks',
  '{"coins_refunded": 0, "unlocks_refunded": 1}'::jsonb,
  'welcome-coin unlock is ended but not refunded');

-- Released episode cannot be rescheduled to dodge refunds.
select throws_ok($$update public.episodes set publish_at = now() + interval '1 day' where id = 2002$$,
  '23514', null, 'released episode cannot be rescheduled');

-- -----------------------------------------------------------------------------
-- suspend / lift
-- -----------------------------------------------------------------------------
select public.suspend_user('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', 'spam');
select throws_ok($$select public.unlock_episode('00000000-0000-0000-0000-0000000000c2', 2002)$$,
  'P0001', 'account_not_active', 'suspended user cannot unlock');
select is(
  public.lift_sanction((select max(id) from public.user_sanctions), '00000000-0000-0000-0000-0000000000a1') ->> 'status',
  'active', 'lifting suspension reactivates');
select is(
  (select purchased_balance from public.coin_wallets where user_id = '00000000-0000-0000-0000-0000000000c2'),
  390, 'suspension keeps coins');

-- -----------------------------------------------------------------------------
-- ban (uploader)
-- -----------------------------------------------------------------------------
select public.unlock_episode('00000000-0000-0000-0000-0000000000c1', 2006);   -- 7, not withdrawable yet → refund
select public.donate('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', 100, 1001);
update public.uploader_earnings set available_at = now() - interval '1 day'
 where uploader_id = '00000000-0000-0000-0000-0000000000b1' and source = 'donation' and status = 'pending';
select public.request_withdrawal('00000000-0000-0000-0000-0000000000b1');      -- 100 (+10 old donation) pending

select is(
  public.ban_user('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'stolen works')
    - 'sanction_id',
  '{"series_removed": 2,
    "unlocks": {"coins_refunded": 7, "unlocks_refunded": 1},
    "donations": {"coins_refunded": 0, "donations_refunded": 0},
    "withdrawals_rejected": 1,
    "earnings_forfeited": 2,
    "coins_forfeited": {"purchased": 0, "welcome": 5}}'::jsonb,
  'ban refunds pending revenue, forfeits the rest');
select is((select status::text from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'),
  'banned', 'profile banned');
select is(
  (select purchased_balance + welcome_balance from public.coin_wallets
    where user_id = '00000000-0000-0000-0000-0000000000b1'),
  0, 'banned wallet emptied');
select is(
  (select status::text from public.withdrawals where id = (select max(id) from public.withdrawals)),
  'rejected', 'open withdrawal rejected');
select is(
  (select count(*)::int from public.uploader_earnings
    where uploader_id = '00000000-0000-0000-0000-0000000000b1' and status = 'withdrawn'),
  3, 'already-paid earnings untouched');
select throws_ok(
  $$select public.donate('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 10)$$,
  'P0001', 'recipient_not_available', 'cannot donate to banned user');
select ok(
  (select count(*) from public.notifications where type = 'refund') >= 3,
  'readers notified of refunds');

-- Ledger matches wallets for every user.
select is(
  (select count(*)::int
     from public.coin_wallets w
    where w.purchased_balance <> (select coalesce(sum(delta), 0) from public.coin_ledger l
                                   where l.user_id = w.user_id and l.kind = 'purchased')
       or w.welcome_balance   <> (select coalesce(sum(delta), 0) from public.coin_ledger l
                                   where l.user_id = w.user_id and l.kind = 'welcome')),
  0, 'every wallet equals the sum of its ledger');

select * from finish();
rollback;
