-- pgTAP tests for the R2 key checks (20261102120000_r2_storage_keys.sql).
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- e1 uploader, e2 other uploader
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'r2-up@test',    now(), '{}'),
  ('00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'r2-other@test', now(), '{}');
insert into public.series (id, uploader_id, slug, title, visibility, moderation_status) overriding system value values
  (9001, '00000000-0000-0000-0000-0000000000e1', 'r2-one', 'One', 'published', 'active'),
  (9002, '00000000-0000-0000-0000-0000000000e2', 'r2-other', 'Other', 'published', 'active');
insert into public.episodes (id, series_id, number, price, publish_at) overriding system value values
  (9101, 9001, 1, 0, now() - interval '1 day'),
  (9201, 9002, 1, 10, now() - interval '1 day');
insert into public.episode_pages (episode_id, page_number, storage_key) values
  (9201, 1, 'episodes/9002/9201/paid0001/001.jpg');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

-- ---- episode_pages.storage_key ------------------------------------------------------
select lives_ok(
  $$insert into public.episode_pages (episode_id, page_number, storage_key)
    values (9101, 1, 'episodes/9001/9101/a1b2c3d4/001.webp')$$,
  'key inside own episode prefix is accepted');
select throws_ok(
  $$insert into public.episode_pages (episode_id, page_number, storage_key)
    values (9101, 2, 'episodes/9002/9201/paid0001/001.jpg')$$,
  'P0001', 'invalid_storage_key', 'another series'' page key is rejected');
select throws_ok(
  $$insert into public.episode_pages (episode_id, page_number, storage_key)
    values (9101, 2, 'episodes/9001/9101/../../9002/001.jpg')$$,
  'P0001', 'invalid_storage_key', 'path tricks are rejected');
select throws_ok(
  $$update public.episode_pages set storage_key = 'episodes/9002/9201/paid0001/001.jpg' where episode_id = 9101$$,
  'P0001', 'invalid_storage_key', 'updating to a foreign key is rejected');

-- ---- series.cover_key ----------------------------------------------------------------
select lives_ok(
  $$update public.series set cover_key = 'covers/9001/0f8fad5b-d9cb-469f-a165-70867728950e.webp' where id = 9001$$,
  'own cover key is accepted');
select throws_ok(
  $$update public.series set cover_key = 'covers/9002/0f8fad5b-d9cb-469f-a165-70867728950e.webp' where id = 9001$$,
  'P0001', 'invalid_storage_key', 'another series'' cover key is rejected');
select lives_ok($$update public.series set cover_key = null where id = 9001$$, 'cover can be cleared');

reset role;
-- service_role / migrations are not checked
select lives_ok(
  $$insert into public.episode_pages (episode_id, page_number, storage_key) values (9101, 3, 'legacy/key.jpg')$$,
  'trusted roles skip the check');

select * from finish();
rollback;
