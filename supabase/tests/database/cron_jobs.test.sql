-- pgTAP tests for the scheduled-job functions (20261101130000_cron_jobs.sql).
-- One rolled-back transaction, so now() is constant — time is simulated by
-- back-dating rows.
--
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- -----------------------------------------------------------------------------
-- Fixtures: b1 = uploader, c1 / c2 / c3 = readers
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'uploader@test', now(), '{}'),
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'reader1@test',  now(), '{}'),
  ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'reader2@test',  now(), '{}'),
  ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'reader3@test',  now(), '{}');

insert into public.series (id, uploader_id, slug, title, visibility, last_episode_at)
overriding system value values
  (1001, '00000000-0000-0000-0000-0000000000b1', 'live',  'Live',  'published', now() - interval '10 days'),
  (1002, '00000000-0000-0000-0000-0000000000b1', 'draft', 'Draft', 'draft',     null);

insert into public.episodes (id, series_id, number, title, publish_at)
overriding system value values
  (2001, 1001, 1, 'Due',       now() - interval '1 minute'),
  (2002, 1001, 2, 'Scheduled', now() + interval '1 day'),
  (2003, 1001, 3, 'No date',   null),
  (2004, 1001, 4, 'Deleted',   now() - interval '2 minutes'),
  (2011, 1002, 1, 'Hidden',    now() - interval '1 minute');
update public.episodes set deleted_at = now() where id = 2004;

-- c1, c2 and the uploader follow both series; c3 follows nothing.
insert into public.series_follows (user_id, series_id) values
  ('00000000-0000-0000-0000-0000000000c1', 1001),
  ('00000000-0000-0000-0000-0000000000c2', 1001),
  ('00000000-0000-0000-0000-0000000000b1', 1001),
  ('00000000-0000-0000-0000-0000000000c1', 1002);

-- -----------------------------------------------------------------------------
-- Schedules + privileges
-- -----------------------------------------------------------------------------
select results_eq(
  $$select jobname::text, schedule::text from cron.job order by jobname$$,
  $$values ('expire-welcome-coins', '*/10 * * * *'),
           ('purge-cron-history',   '0 3 * * *'),
           ('refresh-suspensions',  '* * * * *'),
           ('release-episodes',     '* * * * *')$$,
  'cron jobs are scheduled');

select ok(not has_function_privilege('authenticated', 'private.release_due_episodes(integer)', 'execute')
      and not has_function_privilege('anon', 'private.expire_welcome_coins(integer)', 'execute')
      and not has_function_privilege('authenticated', 'private.refresh_expired_suspensions(integer)', 'execute'),
  'API roles cannot execute the job functions');

-- -----------------------------------------------------------------------------
-- release_due_episodes
-- -----------------------------------------------------------------------------
select is(private.release_due_episodes(), 3, 'handles the 3 due episodes (live, deleted, hidden series)');

select results_eq(
  $$select id from public.episodes where released_at is not null order by id$$,
  $$values (2001::bigint), (2004::bigint), (2011::bigint)$$,
  'scheduled and undated episodes are left alone');

select results_eq(
  $$select user_id, episode_id from public.notifications where type = 'new_episode' order by user_id$$,
  $$values ('00000000-0000-0000-0000-0000000000c1'::uuid, 2001::bigint),
           ('00000000-0000-0000-0000-0000000000c2'::uuid, 2001::bigint)$$,
  'only followers of the visible episode are notified (not the uploader, not deleted/hidden)');

select is(
  (select payload from public.notifications where type = 'new_episode' limit 1),
  '{"series_title": "Live", "episode_number": 1, "episode_title": "Due"}'::jsonb,
  'notification payload');

select is((select last_episode_at from public.series where id = 1001), now() - interval '1 minute',
  'last_episode_at follows the released episode (deleted one ignored)');
select is((select last_episode_at from public.series where id = 1002), now() - interval '1 minute',
  'last_episode_at is set even on a draft series');

select is(private.release_due_episodes(), 0, 'second run does nothing');
select is((select count(*)::integer from public.notifications where type = 'new_episode'), 2,
  'no duplicate notifications');

-- The scheduled episode becomes due later.
update public.episodes set publish_at = now() - interval '1 second' where id = 2002;
select is(private.release_due_episodes(), 1, 'scheduled episode is handled once due');
select is((select count(*)::integer from public.notifications where episode_id = 2002), 2,
  'followers are notified about the scheduled episode');

-- An older publish_at never moves last_episode_at backwards.
insert into public.episodes (id, series_id, number, publish_at)
overriding system value values (2005, 1001, 5, now() - interval '1 hour');
select is(private.release_due_episodes(), 1, 'back-dated episode is handled');
select is((select last_episode_at from public.series where id = 1001), now() - interval '1 second',
  'last_episode_at does not go backwards');

-- Batch limit: one series per run.
insert into public.episodes (id, series_id, number, publish_at)
overriding system value values
  (2006, 1001, 6, now() - interval '1 second'),
  (2012, 1002, 2, now() - interval '1 second');
select is(private.release_due_episodes(1), 1, 'p_limit caps the number of series per run');
select is(private.release_due_episodes(1), 1, 'the rest is picked up next run');

-- -----------------------------------------------------------------------------
-- refresh_expired_suspensions
-- -----------------------------------------------------------------------------
insert into public.user_sanctions (user_id, kind, reason, starts_at, ends_at) values
  ('00000000-0000-0000-0000-0000000000c1', 'suspend', 'ended',      now() - interval '2 days', now() - interval '1 second'),
  ('00000000-0000-0000-0000-0000000000c2', 'suspend', 'running',    now() - interval '2 days', now() + interval '1 day'),
  ('00000000-0000-0000-0000-0000000000c3', 'suspend', 'indefinite', now() - interval '2 days', null);
update public.profiles set status = 'suspended'
 where id in ('00000000-0000-0000-0000-0000000000c1',
              '00000000-0000-0000-0000-0000000000c2',
              '00000000-0000-0000-0000-0000000000c3');

select is(private.refresh_expired_suspensions(), 1, 'one suspension has ended');
select results_eq(
  $$select id, status::text from public.profiles
     where id in ('00000000-0000-0000-0000-0000000000c1',
                  '00000000-0000-0000-0000-0000000000c2',
                  '00000000-0000-0000-0000-0000000000c3') order by id$$,
  $$values ('00000000-0000-0000-0000-0000000000c1'::uuid, 'active'),
           ('00000000-0000-0000-0000-0000000000c2'::uuid, 'suspended'),
           ('00000000-0000-0000-0000-0000000000c3'::uuid, 'suspended')$$,
  'ended suspension → active; running and indefinite stay suspended');
select is(private.refresh_expired_suspensions(), 0, 'second run does nothing');

-- -----------------------------------------------------------------------------
-- expire_welcome_coins
-- -----------------------------------------------------------------------------
select is((select welcome_balance from public.coin_wallets
            where user_id = '00000000-0000-0000-0000-0000000000c1'), 5,
  'fixture: readers got welcome coins');

update public.coin_wallets set welcome_expires_at = now() - interval '1 second'
 where user_id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2');
update public.coin_wallets set welcome_balance = 2
 where user_id = '00000000-0000-0000-0000-0000000000c2';

select is(private.expire_welcome_coins(), 2, 'two expired wallets swept');
select results_eq(
  $$select user_id, welcome_balance from public.coin_wallets
     where user_id in ('00000000-0000-0000-0000-0000000000c1',
                       '00000000-0000-0000-0000-0000000000c2',
                       '00000000-0000-0000-0000-0000000000c3') order by user_id$$,
  $$values ('00000000-0000-0000-0000-0000000000c1'::uuid, 0),
           ('00000000-0000-0000-0000-0000000000c2'::uuid, 0),
           ('00000000-0000-0000-0000-0000000000c3'::uuid, 5)$$,
  'expired balances zeroed, unexpired kept');
select results_eq(
  $$select user_id, kind::text, delta from public.coin_ledger
     where reason = 'welcome_expire' order by user_id$$,
  $$values ('00000000-0000-0000-0000-0000000000c1'::uuid, 'welcome', -5),
           ('00000000-0000-0000-0000-0000000000c2'::uuid, 'welcome', -2)$$,
  'ledger records each expiry');
select is(private.expire_welcome_coins(), 0, 'second run does nothing');

select * from finish();
rollback;
