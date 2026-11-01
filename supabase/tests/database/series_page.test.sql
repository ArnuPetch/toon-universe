-- pgTAP tests for the series page helpers (20261101150000_series_page.sql).
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'uploader@test', now(), '{}'),
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'adult@test',    now(), '{}'),
  ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'teen@test',     now(), '{}');
update public.user_private_info set birth_date = '1990-01-01' where user_id = '00000000-0000-0000-0000-0000000000c1';
update public.user_private_info set birth_date = current_date - interval '15 years'
 where user_id = '00000000-0000-0000-0000-0000000000c2';

insert into public.series (id, uploader_id, slug, title, visibility) overriding system value values
  (1001, '00000000-0000-0000-0000-0000000000b1', 'pub',   'Pub',   'published'),
  (1002, '00000000-0000-0000-0000-0000000000b1', 'draft', 'Draft', 'draft');
insert into public.episodes (id, series_id, number, publish_at) overriding system value values
  (2001, 1001, 1, now() - interval '1 day');
insert into public.episode_view_daily (episode_id, series_id, view_date, views) values
  (2001, 1001, current_date, 42);
insert into public.series_follows (user_id, series_id) values ('00000000-0000-0000-0000-0000000000c1', 1001);
insert into public.reviews (user_id, series_id, rating) values ('00000000-0000-0000-0000-0000000000c1', 1001, 4);
refresh materialized view private.series_rank_stats;

-- Privileges
select ok(has_function_privilege('anon', 'public.get_series_stats(bigint)', 'execute'), 'anon can read stats');
select ok(has_function_privilege('anon', 'public.viewer_meets_age_rating(public.age_rating)', 'execute'),
  'anon can check age rating');

-- get_series_stats (as anon)
set local role anon;
select results_eq('select views, follows, rating_avg, rating_count from public.get_series_stats(1001)',
  $$values (42::bigint, 1::bigint, 4.00::numeric, 1)$$, 'all-time stats of a public series');
select is_empty('select * from public.get_series_stats(1002)', 'draft series: no stats (series RLS)');
select is_empty('select * from public.get_series_stats(999999)', 'unknown series: no row');

-- viewer_meets_age_rating
select ok(public.viewer_meets_age_rating('all'), 'anon: all ok');
select ok(not public.viewer_meets_age_rating('teen'), 'anon: teen blocked');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
select ok(public.viewer_meets_age_rating('teen'), '15-year-old: teen ok');
select ok(not public.viewer_meets_age_rating('mature'), '15-year-old: mature blocked');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select ok(public.viewer_meets_age_rating('mature'), 'adult: mature ok');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
select is_empty('select * from public.get_series_stats(999999)', 'still nothing for unknown series');
select isnt_empty('select * from public.get_series_stats(1002)', 'uploader sees own draft series stats row');
reset role;

select * from finish();
rollback;
