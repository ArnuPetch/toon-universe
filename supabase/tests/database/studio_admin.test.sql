-- pgTAP tests for the uploader studio + admin RPCs (20261102090000_studio_admin.sql).
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- f1 uploader, f2 reader, f3 admin, f4 other uploader
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'sa-up@test',     now(), '{}'),
  ('00000000-0000-0000-0000-0000000000f2', 'authenticated', 'authenticated', 'sa-reader@test', now(), '{}'),
  ('00000000-0000-0000-0000-0000000000f3', 'authenticated', 'authenticated', 'sa-admin@test',  now(), '{"role":"admin"}'),
  ('00000000-0000-0000-0000-0000000000f4', 'authenticated', 'authenticated', 'sa-other@test',  now(), '{}');
update public.profiles set username = 'sa_uploader' where id = '00000000-0000-0000-0000-0000000000f1';

insert into public.series (id, uploader_id, slug, title, visibility, moderation_status) overriding system value values
  (8001, '00000000-0000-0000-0000-0000000000f1', 'sa-one', 'One', 'published', 'active'),
  (8002, '00000000-0000-0000-0000-0000000000f1', 'sa-two', 'Two', 'published', 'under_review'),
  (8003, '00000000-0000-0000-0000-0000000000f4', 'sa-other', 'Other', 'published', 'active');
insert into public.episodes (id, series_id, number, price, publish_at) overriding system value values
  (8101, 8001, 1, 10, now() - interval '40 days'),
  (8102, 8001, 2, 10, now() - interval '1 day'),
  (8201, 8002, 1, 10, now() - interval '40 days'),
  (8301, 8003, 1, 0,  now() - interval '1 day');

insert into public.episode_view_daily (episode_id, series_id, view_date, views) values
  (8101, 8001, current_date - 60, 100),
  (8101, 8001, current_date - 1, 5),
  (8102, 8001, current_date, 7);
insert into public.series_follows (user_id, series_id) values ('00000000-0000-0000-0000-0000000000f2', 8001);

insert into public.episode_unlocks (id, user_id, episode_id, series_id, price, purchased_coins_used, welcome_coins_used,
                                    unlocked_at, expires_at) overriding system value values
  (8501, '00000000-0000-0000-0000-0000000000f2', 8101, 8001, 10, 10, 0, now() - interval '40 days', now() - interval '10 days'),
  (8502, '00000000-0000-0000-0000-0000000000f2', 8102, 8001, 10, 10, 0, now() - interval '1 day',  now() + interval '29 days'),
  (8503, '00000000-0000-0000-0000-0000000000f2', 8201, 8002, 10, 10, 0, now() - interval '40 days', now() - interval '10 days');
insert into public.uploader_earnings (uploader_id, source, unlock_id, series_id, amount, created_at, available_at) values
  ('00000000-0000-0000-0000-0000000000f1', 'unlock', 8501, 8001, 10, now() - interval '40 days', now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000000f1', 'unlock', 8502, 8001, 10, now() - interval '1 day',  now() + interval '29 days'),
  ('00000000-0000-0000-0000-0000000000f1', 'unlock', 8503, 8002, 10, now() - interval '40 days', now() - interval '10 days');

-- ---- page_count trigger ------------------------------------------------------------
insert into public.episode_pages (episode_id, page_number, storage_key) values
  (8101, 1, 'k1'), (8101, 2, 'k2'), (8101, 3, 'k3');
select is((select page_count from public.episodes where id = 8101), 3, 'page_count follows inserts');
delete from public.episode_pages where episode_id = 8101 and page_number = 3;
select is((select page_count from public.episodes where id = 8101), 2, 'page_count follows deletes');

-- Uploader writing pages through RLS also updates page_count (security definer trigger).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
select lives_ok($$insert into public.episode_pages (episode_id, page_number, storage_key) values (8102, 1, 'episodes/8001/8102/abcd1234/001.jpg')$$,
  'uploader adds a page');
reset role;
select is((select page_count from public.episodes where id = 8102), 1, 'page_count updated for an RLS write');

-- ---- get_uploader_stats -------------------------------------------------------------
select results_eq(
  $$select series_id, views, views_30d, followers, unlocks, unlocks_30d, revenue, revenue_30d
      from public.get_uploader_stats('00000000-0000-0000-0000-0000000000f1') where series_id = 8001$$,
  $$values (8001::bigint, 112::bigint, 12::bigint, 1::bigint, 2::bigint, 1::bigint, 20::bigint, 10::bigint)$$,
  'per-series stats');
select is((select count(*)::int from public.get_uploader_stats('00000000-0000-0000-0000-0000000000f1')), 2,
  'only the uploader''s own series');

select results_eq(
  $$select episode_id, views, unlocks from public.get_uploader_episode_stats('00000000-0000-0000-0000-0000000000f1', 8001)
     order by episode_id$$,
  $$values (8101::bigint, 105::bigint, 1::bigint), (8102::bigint, 7::bigint, 1::bigint)$$,
  'per-episode stats');
select is_empty($$select * from public.get_uploader_episode_stats('00000000-0000-0000-0000-0000000000f1', 8003)$$,
  'episode stats of someone else''s series are empty');

-- ---- get_uploader_balance -------------------------------------------------------------
select is(public.get_uploader_balance('00000000-0000-0000-0000-0000000000f1') ->> 'withdrawable', '10',
  'withdrawable excludes not-yet-30-days and held series');
select is(public.get_uploader_balance('00000000-0000-0000-0000-0000000000f1') ->> 'waiting', '20',
  'waiting = < 30 days + held series');

-- ---- Admin RPCs ----------------------------------------------------------------------
insert into public.comments (id, user_id, series_id, body) overriding system value
values (8901, '00000000-0000-0000-0000-0000000000f2', 8001, 'spam');
insert into public.reports (id, reporter_id, target_type, comment_id, reason) overriding system value values
  (8951, '00000000-0000-0000-0000-0000000000f1', 'comment', 8901, 'spam'),
  (8952, '00000000-0000-0000-0000-0000000000f4', 'comment', 8901, 'abusive');
insert into public.reports (id, reporter_id, target_type, target_user_id, reason) overriding system value values
  (8953, '00000000-0000-0000-0000-0000000000f1', 'user', '00000000-0000-0000-0000-0000000000f4', 'impersonation');

select throws_ok($$select public.set_content_hidden('00000000-0000-0000-0000-0000000000f1', 'comment', 8901, true)$$,
  'P0001', 'not_admin', 'non-admin cannot hide');
select is(public.set_content_hidden('00000000-0000-0000-0000-0000000000f3', 'comment', 8901, true, 'spam') ->> 'reports_resolved',
  '2', 'hiding resolves the open reports');
select isnt((select hidden_at from public.comments where id = 8901), null, 'comment hidden');
select is(public.set_content_hidden('00000000-0000-0000-0000-0000000000f3', 'comment', 8901, false) ->> 'hidden',
  'false', 'unhide');
select is((select hidden_at from public.comments where id = 8901), null, 'comment visible again');
select throws_ok($$select public.set_content_hidden('00000000-0000-0000-0000-0000000000f3', 'review', 999999, true)$$,
  'P0001', 'review_not_found', 'unknown review');
select throws_ok($$select public.set_content_hidden('00000000-0000-0000-0000-0000000000f3', 'series', 8001, true)$$,
  'P0001', 'invalid_input', 'only comments / reviews');

select is(public.resolve_report(8953, '00000000-0000-0000-0000-0000000000f3', 'dismissed', 'no proof') ->> 'status',
  'dismissed', 'dismiss a report');
select throws_ok($$select public.resolve_report(8953, '00000000-0000-0000-0000-0000000000f3', 'resolved')$$,
  'P0001', 'report_not_open', 'closed report cannot be closed again');
select throws_ok($$select public.resolve_report(8953, '00000000-0000-0000-0000-0000000000f3', 'open')$$,
  'P0001', 'invalid_input', 'cannot reopen');

select is(public.set_user_verified('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3', true) ->> 'is_verified',
  'true', 'grant verified badge');
select ok((select is_verified from public.profiles where id = '00000000-0000-0000-0000-0000000000f1'), 'badge stored');
select throws_ok($$select public.set_user_verified('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', false)$$,
  'P0001', 'not_admin', 'non-admin cannot change the badge');

select is((select count(*)::int from public.admin_find_users('00000000-0000-0000-0000-0000000000f3', 'sa-up@')), 1,
  'find user by email');
select is((select email from public.admin_find_users('00000000-0000-0000-0000-0000000000f3', 'sa_uploader')), 'sa-up@test',
  'find user by username');
select is((select count(*)::int from public.admin_find_users('00000000-0000-0000-0000-0000000000f3', '%')), 0,
  'LIKE wildcards are escaped');
select throws_ok($$select * from public.admin_find_users('00000000-0000-0000-0000-0000000000f2', '')$$,
  'P0001', 'not_admin', 'non-admin cannot search users');

-- ---- Privileges: API roles cannot call any of them ----------------------------------------
set local role authenticated;
select throws_ok($$select public.get_uploader_balance('00000000-0000-0000-0000-0000000000f1')$$,
  '42501', null, 'authenticated cannot call get_uploader_balance');
select throws_ok($$select * from public.admin_find_users('00000000-0000-0000-0000-0000000000f3', '')$$,
  '42501', null, 'authenticated cannot call admin_find_users');
reset role;

select * from finish();
rollback;
