-- pgTAP tests for search_series (20261101160000_reader_pages.sql).
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'uploader@test', now(), '{}'),
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'adult@test',    now(), '{}');
update public.profiles set display_name = 'Sensei Moon' where id = '00000000-0000-0000-0000-0000000000b1';
update public.user_private_info set birth_date = '1990-01-01' where user_id = '00000000-0000-0000-0000-0000000000c1';

insert into public.series (id, uploader_id, slug, title, visibility, age_rating, status, published_at, last_episode_at)
overriding system value values
  (1001, '00000000-0000-0000-0000-0000000000b1', 'free-hero', 'Free Hero',   'published', 'all',    'ongoing',   now() - interval '3 day', now() - interval '1 hour'),
  (1002, '00000000-0000-0000-0000-0000000000b1', 'paid-hero', 'Paid 100%_x', 'published', 'all',    'completed', now() - interval '1 day', now() - interval '2 day'),
  (1003, '00000000-0000-0000-0000-0000000000b1', 'adult',     'Adult Hero',  'published', 'mature', 'ongoing',   now() - interval '2 day', null),
  (1004, '00000000-0000-0000-0000-0000000000b1', 'draft',     'Draft Hero',  'draft',     'all',    'ongoing',   null, null);

insert into public.series_genres (series_id, genre_id)
select s, (select id from public.genres where slug = g)
  from (values (1001, 'action'), (1002, 'romance'), (1003, 'action')) v(s, g);

insert into public.episodes (id, series_id, number, price, publish_at, released_at)
overriding system value values
  (2001, 1001, 1, 0,  now() - interval '1 day', now() - interval '1 day'),
  (2002, 1001, 2, 0,  now() - interval '1 hour', now() - interval '1 hour'),
  (2003, 1001, 3, 10, now() + interval '1 day', null),                      -- scheduled: ignored
  (2004, 1002, 1, 0,  now() - interval '3 day', now() - interval '3 day'),
  (2005, 1002, 2, 5,  now() - interval '2 day', now() - interval '2 day');
insert into public.episode_view_daily (episode_id, series_id, view_date, views) values
  (2004, 1002, current_date, 50),
  (2001, 1001, current_date, 10);
refresh materialized view private.series_rank_stats;

select ok(has_function_privilege('anon',
  'public.search_series(text, smallint, public.series_status, text, text, integer, integer)', 'execute'),
  'anon can search');

set local role anon;
select results_eq($$select series_id from public.search_series() s where s.series_id between 1001 and 1004$$,
  $$values (1002::bigint), (1001::bigint)$$, 'anon: public all-ages only, most popular first');
select results_eq($$select total_count from public.search_series(p_query => 'moon', p_limit => 1)$$,
  $$values (2::bigint)$$, 'total_count ignores the limit');
select results_eq($$select series_id from public.search_series(p_query => 'free') s where s.series_id between 1001 and 1004$$,
  $$values (1001::bigint)$$, 'title match (case-insensitive)');
select results_eq($$select series_id from public.search_series(p_query => 'moon', p_sort => 'title') s where s.series_id between 1001 and 1004$$,
  $$values (1001::bigint), (1002::bigint)$$, 'author match');
select results_eq($$select series_id from public.search_series(p_query => 'โรแมนซ์') s where s.series_id between 1001 and 1004$$,
  $$values (1002::bigint)$$, 'genre name match');
select results_eq($$select series_id from public.search_series(p_query => '%_') s where s.series_id between 1001 and 1004$$,
  $$values (1002::bigint)$$, 'wildcards in the query are literal');
select results_eq($$select series_id from public.search_series(p_price => 'free') s where s.series_id between 1001 and 1004$$,
  $$values (1001::bigint)$$, 'free: no released paid episode (scheduled paid episode ignored)');
select results_eq($$select series_id from public.search_series(p_price => 'paid') s where s.series_id between 1001 and 1004$$,
  $$values (1002::bigint)$$, 'paid: has a paid episode');
select results_eq($$select series_id from public.search_series(p_status => 'completed') s where s.series_id between 1001 and 1004$$,
  $$values (1002::bigint)$$, 'status filter');
select results_eq($$select series_id from public.search_series(p_genre_id => (select id from public.genres where slug = 'action')) s where s.series_id between 1001 and 1004$$,
  $$values (1001::bigint)$$, 'genre filter (mature series hidden from anon)');
select results_eq($$select series_id from public.search_series(p_sort => 'updated') s where s.series_id between 1001 and 1004$$,
  $$values (1001::bigint), (1002::bigint)$$, 'sort by last episode');
select results_eq($$select series_id from public.search_series(p_sort => 'new') s where s.series_id between 1001 and 1004$$,
  $$values (1002::bigint), (1001::bigint)$$, 'sort by first published');
select results_eq($$select latest_episode_number, latest_episode_price from public.search_series(p_query => 'free')$$,
  $$values (2, 0)$$, 'latest released episode (not the scheduled one)');
select results_eq($$select series_id from public.search_series(p_sort => 'bogus') s where s.series_id between 1001 and 1004$$,
  $$values (1002::bigint), (1001::bigint)$$, 'unknown sort falls back to popular');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select results_eq($$select series_id from public.search_series(p_query => 'hero', p_sort => 'title') s where s.series_id between 1001 and 1004$$,
  $$values (1003::bigint), (1001::bigint)$$, 'adult sees mature series; drafts never listed');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
select is_empty($$select * from public.search_series(p_query => 'draft')$$, 'own draft is not searchable');
reset role;

select * from finish();
rollback;
