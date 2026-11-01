-- pgTAP tests for ranking & recommendation (20261101140000_ranking.sql).
-- One rolled-back transaction, so now() is constant — older activity is
-- simulated by back-dating rows.
--
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- -----------------------------------------------------------------------------
-- Fixtures: b1 = uploader, c1..c4 = readers (c1 is an adult)
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'uploader@test', now(), '{}'),
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'reader1@test',  now(), '{}'),
  ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'reader2@test',  now(), '{}'),
  ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'reader3@test',  now(), '{}'),
  ('00000000-0000-0000-0000-0000000000c4', 'authenticated', 'authenticated', 'reader4@test',  now(), '{}');
update public.user_private_info set birth_date = '1990-01-01'
 where user_id = '00000000-0000-0000-0000-0000000000c1';

insert into public.series (id, uploader_id, slug, title, visibility, age_rating)
overriding system value values
  (1001, '00000000-0000-0000-0000-0000000000b1', 'alpha', 'Alpha', 'published', 'all'),
  (1002, '00000000-0000-0000-0000-0000000000b1', 'beta',  'Beta',  'published', 'all'),
  (1003, '00000000-0000-0000-0000-0000000000b1', 'gamma', 'Gamma', 'published', 'mature'),
  (1004, '00000000-0000-0000-0000-0000000000b1', 'delta', 'Delta', 'draft',     'all'),
  (1005, '00000000-0000-0000-0000-0000000000b1', 'eps',   'Eps',   'published', 'all'),
  (1006, '00000000-0000-0000-0000-0000000000b1', 'zeta',  'Zeta',  'published', 'all');

-- action: 1001 1002 1003 1006 · fantasy: 1001 · romance: 1005
insert into public.series_genres (series_id, genre_id)
select s, (select id from public.genres where slug = g)
  from (values (1001, 'action'), (1001, 'fantasy'), (1002, 'action'), (1003, 'action'),
               (1005, 'romance'), (1006, 'action')) v(s, g);

insert into public.episodes (id, series_id, number, publish_at)
overriding system value values
  (2001, 1001, 1, now() - interval '1 day'),
  (2002, 1001, 2, now() + interval '1 day'),
  (2011, 1002, 1, now() - interval '1 day'),
  (2021, 1003, 1, now() - interval '1 day'),
  (2041, 1004, 1, now() - interval '1 day'),
  (2051, 1005, 1, now() - interval '1 day'),
  (2061, 1006, 1, now() - interval '1 day');

-- -----------------------------------------------------------------------------
-- series.published_at
-- -----------------------------------------------------------------------------
select is((select published_at from public.series where id = 1001), now(), 'published_at set on publish');
select is((select published_at from public.series where id = 1004), null, 'draft has no published_at');

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.record_episode_view(bigint, text)', 'execute')
      and not has_function_privilege('authenticated', 'public.record_episode_view(bigint, text)', 'execute'),
  'API roles cannot record views');
select ok(has_function_privilege('anon',
            'public.get_series_ranking(public.ranking_kind, public.ranking_period, smallint, integer, integer)', 'execute')
      and has_function_privilege('anon', 'public.get_series_recommendations(bigint, integer)', 'execute'),
  'anon can read rankings and recommendations');
select ok(not has_table_privilege('anon', 'private.episode_view_seen', 'select'),
  'anon cannot read who viewed what');

-- -----------------------------------------------------------------------------
-- record_episode_view
-- -----------------------------------------------------------------------------
set local role service_role;
select is(public.record_episode_view(2001, '00000000-0000-0000-0000-0000000000c1'), true,  'first view counts');
select is(public.record_episode_view(2001, '00000000-0000-0000-0000-0000000000c1'), false, 'same viewer same day does not');
select is(public.record_episode_view(2001, 'anon:6f1c'), true, 'anonymous viewer counts');
select is(public.record_episode_view(2001, '00000000-0000-0000-0000-0000000000b1'), false, 'uploader''s own view does not');
select is(public.record_episode_view(2002, 'anon:6f1c'), false, 'scheduled episode does not');
select is(public.record_episode_view(2041, 'anon:6f1c'), false, 'episode of a draft series does not');
reset role;

select results_eq(
  $$select episode_id, series_id, view_date, views from public.episode_view_daily$$,
  $$values (2001::bigint, 1001::bigint, private.bkk_today(), 2)$$,
  'two views on today''s (Bangkok) row');

-- -----------------------------------------------------------------------------
-- Activity fixtures
-- -----------------------------------------------------------------------------
-- 1001: 2 today + 100 three days ago  → day 2 (prev 100), week/month 102
-- 1002: 50 today + 5 ten days ago     → day 50, week 50 (prev 5), month 55
-- 1003: 500 today (mature)
-- 1005: 1000 sixty days ago           → all only
insert into public.episode_view_daily (episode_id, series_id, view_date, views) values
  (2001, 1001, private.bkk_today() - 3,  100),
  (2011, 1002, private.bkk_today(),      50),
  (2011, 1002, private.bkk_today() - 10, 5),
  (2021, 1003, private.bkk_today(),      500),
  (2051, 1005, private.bkk_today() - 60, 1000);

-- Series reviews: 1001 = one 5; 1002 = four 3s (+ a hidden 5, + an episode
-- review that must be ignored). Mean of the window = 17/5 = 3.4.
insert into public.reviews (user_id, series_id, episode_id, rating) values
  ('00000000-0000-0000-0000-0000000000c1', 1001, null, 5),
  ('00000000-0000-0000-0000-0000000000c1', 1002, null, 3),
  ('00000000-0000-0000-0000-0000000000c2', 1002, null, 3),
  ('00000000-0000-0000-0000-0000000000c3', 1002, null, 3),
  ('00000000-0000-0000-0000-0000000000c4', 1002, null, 3),
  ('00000000-0000-0000-0000-0000000000b1', 1002, null, 5),
  ('00000000-0000-0000-0000-0000000000c1', 1001, 2001, 1);
update public.reviews set hidden_at = now()
 where user_id = '00000000-0000-0000-0000-0000000000b1';

update public.series set published_at = now() - interval '40 days' where id = 1002;
update public.series set last_episode_at = now() - interval '1 day'   where id = 1001;
update public.series set last_episode_at = now() - interval '1 hour'  where id = 1002;
update public.series set last_episode_at = now() - interval '20 days' where id = 1006;

-- Readers: c1 c2 c3 read 1001 + 1002 + 1003; c4 reads 1002; c1 c2 read 1006
-- (c3 only plans to → doesn't count, so 1001–1006 has 2 co-readers < 3);
-- c1 also reads the draft 1004 (ignored).
insert into public.reading_progress (user_id, series_id, episode_id)
select u::uuid, s, e
  from (values ('00000000-0000-0000-0000-0000000000c1', 1001, 2001),
               ('00000000-0000-0000-0000-0000000000c2', 1001, 2001),
               ('00000000-0000-0000-0000-0000000000c3', 1001, 2001),
               ('00000000-0000-0000-0000-0000000000c1', 1002, 2011),
               ('00000000-0000-0000-0000-0000000000c2', 1002, 2011),
               ('00000000-0000-0000-0000-0000000000c3', 1002, 2011),
               ('00000000-0000-0000-0000-0000000000c4', 1002, 2011),
               ('00000000-0000-0000-0000-0000000000c1', 1003, 2021),
               ('00000000-0000-0000-0000-0000000000c2', 1003, 2021),
               ('00000000-0000-0000-0000-0000000000c3', 1003, 2021),
               ('00000000-0000-0000-0000-0000000000c1', 1004, 2041),
               ('00000000-0000-0000-0000-0000000000c1', 1006, 2061),
               ('00000000-0000-0000-0000-0000000000c2', 1006, 2061)) v(u, s, e);
insert into public.bookshelf_entries (user_id, series_id, status) values
  ('00000000-0000-0000-0000-0000000000c3', 1006, 'plan_to_read');

refresh materialized view private.series_rank_stats;
refresh materialized view private.series_also_read;

select is((select count(*)::integer from private.series_rank_stats), 20,
  '4 periods × 5 public series (draft excluded)');

-- -----------------------------------------------------------------------------
-- get_series_ranking (anon: no mature)
-- -----------------------------------------------------------------------------
set local role anon;

select results_eq(
  $$select rank, series_id, views from public.get_series_ranking('views', 'week')$$,
  $$values (1, 1001::bigint, 102::bigint), (2, 1002::bigint, 50::bigint)$$,
  'views/week: mature series hidden from anon');

select results_eq(
  $$select series_id, views from public.get_series_ranking('views', 'day')$$,
  $$values (1002::bigint, 50::bigint), (1001::bigint, 2::bigint)$$,
  'views/day = today + yesterday');

select results_eq(
  $$select series_id, views from public.get_series_ranking('views', 'all')$$,
  $$values (1005::bigint, 1000::bigint), (1001::bigint, 102::bigint), (1002::bigint, 55::bigint)$$,
  'views/all');

select results_eq(
  $$select rank, series_id from public.get_series_ranking('views', 'all', p_limit => 1, p_offset => 1)$$,
  $$values (2, 1001::bigint)$$,
  'limit/offset keep global ranks');

select results_eq(
  $$select series_id from public.get_series_ranking('views', 'week',
      (select id from public.genres where slug = 'fantasy'))$$,
  $$values (1001::bigint)$$,
  'genre filter');

select results_eq(
  $$select series_id, score from public.get_series_ranking('trending', 'day')$$,
  $$values (1002::bigint, round(50 * ln(70 / 20.0), 4))$$,
  'trending/day: growing series only (1001 shrank 100 → 2)');

select results_eq(
  $$select series_id from public.get_series_ranking('trending', 'all')$$,
  $$select series_id from public.get_series_ranking('trending', 'month')$$,
  'trending/all falls back to month');

select results_eq(
  $$select series_id, rating_avg, rating_count, score from public.get_series_ranking('rating', 'all')$$,
  $$values (1001::bigint, 5.00, 1, round((5 * 3.4 + 5) / 6, 4)),
           (1002::bigint, 3.00, 4, round((5 * 3.4 + 12) / 9, 4))$$,
  'rating: Bayesian score, hidden + episode reviews ignored');

select results_eq(
  $$select series_id from public.get_series_ranking('new', 'week')$$,
  $$values (1001::bigint), (1005::bigint), (1006::bigint)$$,
  'new/week: published this week (1002 is 40 days old); ties by views');

select results_eq(
  $$select series_id from public.get_series_ranking('updated', 'week')$$,
  $$values (1002::bigint), (1001::bigint)$$,
  'updated/week: latest episode first');
select results_eq(
  $$select series_id from public.get_series_ranking('updated', 'month')$$,
  $$values (1002::bigint), (1001::bigint), (1006::bigint)$$,
  'updated/month');

reset role;

-- Adult reader sees the mature series.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select series_id from public.get_series_ranking('views', 'week')$$,
  $$values (1003::bigint), (1001::bigint), (1002::bigint)$$,
  'adult reader sees mature series');
reset role;

-- -----------------------------------------------------------------------------
-- get_series_recommendations
-- -----------------------------------------------------------------------------
select results_eq(
  $$select series_id, other_series_id, co_readers from private.series_also_read
     where series_id = 1001 order by rank$$,
  $$values (1001::bigint, 1003::bigint, 3), (1001::bigint, 1002::bigint, 3)$$,
  'also_read: pairs need 3 co-readers; plan_to_read ignored; cosine order');

select set_config('request.jwt.claims', null, true);
set local role anon;
select results_eq(
  $$select series_id, reason from public.get_series_recommendations(1001)$$,
  $$values (1002::bigint, 'also_read'), (1006::bigint, 'same_genre')$$,
  'anon: co-read first, topped up by genre; mature hidden');
select is((select count(*)::integer from public.get_series_recommendations(1004)), 0,
  'nothing for a series the caller cannot see');
reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select series_id, reason from public.get_series_recommendations(1001)$$,
  $$values (1003::bigint, 'also_read'), (1002::bigint, 'also_read'), (1006::bigint, 'same_genre')$$,
  'adult: mature co-read series included');
reset role;

-- -----------------------------------------------------------------------------
-- Visibility is checked at read time, not refresh time
-- -----------------------------------------------------------------------------
update public.series set moderation_status = 'removed' where id = 1005;
select set_config('request.jwt.claims', null, true);
set local role anon;
select results_eq(
  $$select rank, series_id from public.get_series_ranking('views', 'all')$$,
  $$values (1, 1001::bigint), (2, 1002::bigint)$$,
  'removed series drops out before the next refresh');
reset role;

-- Publishing a draft later sets published_at once.
update public.series set visibility = 'published' where id = 1004;
select is((select published_at from public.series where id = 1004), now(), 'published_at set when a draft is published');
update public.series set published_at = now() - interval '5 days', visibility = 'draft' where id = 1004;
update public.series set visibility = 'published' where id = 1004;
select is((select published_at from public.series where id = 1004), now() - interval '5 days',
  'republishing keeps the first published_at');

select * from finish();
rollback;
