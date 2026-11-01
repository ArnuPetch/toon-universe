-- pgTAP tests for comments + reviews (20261101180000_comments_reviews.sql).
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- e1 uploader, e2 adult reader, e3 teen, e4 adult who never read, e5 banned
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'cr-up@test',     now(), '{}'),
  ('00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'cr-adult@test',  now(), '{}'),
  ('00000000-0000-0000-0000-0000000000e3', 'authenticated', 'authenticated', 'cr-teen@test',   now(), '{}'),
  ('00000000-0000-0000-0000-0000000000e4', 'authenticated', 'authenticated', 'cr-new@test',    now(), '{}'),
  ('00000000-0000-0000-0000-0000000000e5', 'authenticated', 'authenticated', 'cr-banned@test', now(), '{}');
update public.user_private_info set birth_date = '1990-01-01'
 where user_id in ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e4',
                   '00000000-0000-0000-0000-0000000000e5');
update public.user_private_info set birth_date = current_date - interval '15 years'
 where user_id = '00000000-0000-0000-0000-0000000000e3';
update public.profiles set display_name = 'Adult' where id = '00000000-0000-0000-0000-0000000000e2';

insert into public.series (id, uploader_id, slug, title, visibility, age_rating) overriding system value values
  (7001, '00000000-0000-0000-0000-0000000000e1', 'cr-all',    'All',    'published', 'all'),
  (7002, '00000000-0000-0000-0000-0000000000e1', 'cr-mature', 'Mature', 'published', 'mature'),
  (7003, '00000000-0000-0000-0000-0000000000e1', 'cr-draft',  'Draft',  'draft',     'all');
insert into public.episodes (id, series_id, number, price, publish_at) overriding system value values
  (7101, 7001, 1, 0,  now() - interval '2 days'),   -- free
  (7102, 7001, 2, 10, now() - interval '1 day'),    -- paid, e2 unlocked (expired)
  (7103, 7001, 3, 10, now() + interval '1 day'),    -- scheduled
  (7104, 7001, 4, 10, now() - interval '1 day'),    -- paid, nobody unlocked
  (7201, 7002, 1, 0,  now() - interval '1 day');
insert into public.episode_unlocks (user_id, episode_id, series_id, price, purchased_coins_used, welcome_coins_used,
                                    unlocked_at, expires_at)
values ('00000000-0000-0000-0000-0000000000e2', 7102, 7001, 10, 10, 0, now() - interval '40 days', now() - interval '10 days');
insert into public.reading_progress (user_id, series_id, episode_id, page_number)
values ('00000000-0000-0000-0000-0000000000e2', 7001, 7101, 1),
       ('00000000-0000-0000-0000-0000000000e3', 7001, 7101, 1),
       ('00000000-0000-0000-0000-0000000000e5', 7001, 7101, 1);

-- Banned user's content was written before the ban (as postgres: no checks).
insert into public.comments (id, user_id, series_id, body) overriding system value
values (7901, '00000000-0000-0000-0000-0000000000e5', 7001, 'spam');
insert into public.reviews (user_id, series_id, rating) values ('00000000-0000-0000-0000-0000000000e5', 7001, 1);
update public.profiles set status = 'banned' where id = '00000000-0000-0000-0000-0000000000e5';

set local role authenticated;

-- ---- Comments --------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
select lives_ok($$insert into public.comments (user_id, series_id, body)
                  values ('00000000-0000-0000-0000-0000000000e2', 7001, 'สนุกมาก')$$,
  'series comment');
select lives_ok($$insert into public.comments (user_id, series_id, episode_id, body, is_spoiler)
                  values ('00000000-0000-0000-0000-0000000000e2', 7001, 7101, 'ตอนจบหักมุม', true)$$,
  'episode comment');
select throws_ok($$insert into public.comments (user_id, series_id, episode_id, body)
                   values ('00000000-0000-0000-0000-0000000000e2', 7001, 7103, 'early')$$,
  'P0001', 'episode_not_available', 'cannot comment on a scheduled episode');
select throws_ok($$insert into public.comments (user_id, series_id, body)
                   values ('00000000-0000-0000-0000-0000000000e2', 7003, 'x')$$,
  'P0001', 'series_not_available', 'cannot comment on someone else''s draft');
select throws_ok($$insert into public.comments (user_id, series_id, episode_id, parent_id, body)
                   select '00000000-0000-0000-0000-0000000000e2'::uuid, 7001, 7101, (select id from public.comments where body = 'สนุกมาก' or body = 'สนุกมาก!'), 'x'$$,
  'P0001', 'comment_parent_invalid', 'reply must target the same episode/series');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}', true);
select throws_ok($$insert into public.comments (user_id, series_id, body)
                   values ('00000000-0000-0000-0000-0000000000e3', 7002, 'x')$$,
  'P0001', 'age_restricted', 'teen cannot comment on 18+ series');
select lives_ok($$insert into public.comments (user_id, series_id, parent_id, body)
                  select '00000000-0000-0000-0000-0000000000e3'::uuid, 7001, (select id from public.comments where body = 'สนุกมาก' or body = 'สนุกมาก!'), 'เห็นด้วย'$$,
  'reply to a top-level comment');
select throws_ok($$insert into public.comments (user_id, series_id, parent_id, body)
                   select '00000000-0000-0000-0000-0000000000e3'::uuid, 7001, (select id from public.comments where body = 'เห็นด้วย'), 'x'$$,
  'P0001', 'comment_parent_invalid', 'no reply to a reply (one level)');
select throws_ok($$insert into public.comments (user_id, series_id, body, hidden_at)
                   values ('00000000-0000-0000-0000-0000000000e3', 7001, 'x', now())$$,
  '42501', null, 'cannot set hidden_at (column grant)');

-- Rate limit: e3 has 1 comment this minute → 4 more ok, the 6th fails.
select lives_ok($$insert into public.comments (user_id, series_id, body)
                  select '00000000-0000-0000-0000-0000000000e3', 7001, 'c' || g from generate_series(1, 4) g$$,
  'up to 5 comments per minute');
select throws_ok($$insert into public.comments (user_id, series_id, body)
                   values ('00000000-0000-0000-0000-0000000000e3', 7001, 'too fast')$$,
  'P0001', 'rate_limited', '6th comment within a minute is rejected');

-- Delete is one-way.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
select lives_ok($$update public.comments set body = 'สนุกมาก!' where body = 'สนุกมาก'$$, 'author can edit');
select lives_ok($$update public.comments set deleted_at = '2000-01-01' where id = (select id from public.comments where body = 'ตอนจบหักมุม')$$, 'author can delete');
select ok((select deleted_at > now() - interval '1 minute' from public.comments where id = (select id from public.comments where body = 'ตอนจบหักมุม')),
  'deleted_at is server time, not the client value');
select throws_ok($$update public.comments set deleted_at = null where id = (select id from public.comments where body = 'ตอนจบหักมุม')$$,
  'P0001', 'comment_not_found', 'cannot restore a deleted comment');
select throws_ok($$update public.comments set body = 'x' where id = (select id from public.comments where body = 'ตอนจบหักมุม')$$,
  'P0001', 'comment_not_found', 'cannot edit a deleted comment');
select is((select count(*)::int from public.comments where body = 'เห็นด้วย'), 1, 'can see others'' comments');
reset role;

-- Reply notified the parent's author (not the replier).
select is((select count(*)::int from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000000e2' and type = 'comment_reply'
              and (payload->>'comment_id')::bigint = (select id from public.comments where body = 'สนุกมาก' or body = 'สนุกมาก!')),
  1, 'reply → notification to parent author');

-- Banned author hidden from public reads.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from public.comments where id = 7901), 0, 'banned author''s comment hidden');
select is((select count(*)::int from public.comments where body = 'ตอนจบหักมุม'), 0, 'deleted comment hidden');
select is((select count(*)::int from public.comments where body = 'สนุกมาก!'), 1, 'normal comment visible to anon');
reset role;

-- ---- Reviews ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
select lives_ok($$insert into public.reviews (user_id, series_id, rating, body)
                  values ('00000000-0000-0000-0000-0000000000e2', 7001, 5, 'ดีมาก')$$, 'series review after reading');
select lives_ok($$insert into public.reviews (user_id, series_id, episode_id, rating)
                  values ('00000000-0000-0000-0000-0000000000e2', 7001, 7101, 4)$$, 'review a free episode');
select lives_ok($$insert into public.reviews (user_id, series_id, episode_id, rating)
                  values ('00000000-0000-0000-0000-0000000000e2', 7001, 7102, 3)$$,
  'review a paid episode unlocked earlier (expired)');
select throws_ok($$insert into public.reviews (user_id, series_id, episode_id, rating)
                   values ('00000000-0000-0000-0000-0000000000e2', 7001, 7104, 1)$$,
  'P0001', 'review_requires_reading', 'cannot review a paid episode never unlocked');
select throws_ok($$insert into public.reviews (user_id, series_id, episode_id, rating)
                   values ('00000000-0000-0000-0000-0000000000e2', 7001, 7103, 1)$$,
  'P0001', 'episode_not_available', 'cannot review a scheduled episode');
select throws_ok($$insert into public.reviews (user_id, series_id, rating)
                   values ('00000000-0000-0000-0000-0000000000e2', 7001, 1)$$,
  '23505', null, 'one review per user per target');
select lives_ok($$update public.reviews set rating = 4 where series_id = 7001 and episode_id is null
                    and user_id = '00000000-0000-0000-0000-0000000000e2'$$, 'author can change rating');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e4","role":"authenticated"}', true);
select throws_ok($$insert into public.reviews (user_id, series_id, rating)
                   values ('00000000-0000-0000-0000-0000000000e4', 7001, 1)$$,
  'P0001', 'review_requires_reading', 'must read before reviewing a series');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
select throws_ok($$insert into public.reviews (user_id, series_id, rating)
                   values ('00000000-0000-0000-0000-0000000000e1', 7001, 5)$$,
  'P0001', 'cannot_review_own_series', 'uploader cannot review own series');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}', true);
select throws_ok($$insert into public.reviews (user_id, series_id, episode_id, rating)
                   values ('00000000-0000-0000-0000-0000000000e3', 7002, 7201, 5)$$,
  'P0001', 'age_restricted', 'teen cannot review 18+ episode');
select lives_ok($$insert into public.reviews (user_id, series_id, rating)
                  values ('00000000-0000-0000-0000-0000000000e3', 7001, 2)$$, 'teen reviews an all-ages series');
reset role;

-- Summary: e2 = 4, e3 = 2; banned e5 excluded. Hidden reviews excluded too.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq('select rating_avg, rating_count, star_counts from public.get_review_summary(7001)',
  $$values (3.00::numeric, 2, array[0,1,0,1,0])$$, 'series summary (banned author excluded)');
select results_eq('select rating_avg, rating_count, star_counts from public.get_review_summary(7001, 7101)',
  $$values (4.00::numeric, 1, array[0,0,0,1,0])$$, 'episode summary');
select results_eq('select rating_count from public.get_review_summary(7003)',
  $$values (0)$$, 'draft series: nothing counted');
reset role;
update public.reviews set hidden_at = now()
 where series_id = 7001 and episode_id is null and user_id = '00000000-0000-0000-0000-0000000000e3';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}', true);
select results_eq('select rating_count from public.get_review_summary(7001)',
  $$values (1)$$, 'own hidden review not counted');

-- ---- Reports ---------------------------------------------------------------------
select lives_ok($$insert into public.reports (reporter_id, target_type, comment_id, reason)
                  select '00000000-0000-0000-0000-0000000000e3'::uuid, 'comment', (select id from public.comments where body = 'สนุกมาก' or body = 'สนุกมาก!'), 'spam'$$, 'report a comment');
select throws_ok($$insert into public.reports (reporter_id, target_type, comment_id, reason)
                   select '00000000-0000-0000-0000-0000000000e3'::uuid, 'comment', (select id from public.comments where body = 'สนุกมาก' or body = 'สนุกมาก!'), 'abusive'$$,
  '23505', null, 'one report per comment per reporter');
reset role;

select * from finish();
rollback;
