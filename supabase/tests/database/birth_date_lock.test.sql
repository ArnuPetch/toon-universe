-- pgTAP tests for the birth date lock (20261101170000_birth_date_lock.sql).
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'bd-new@test', now(), '{}'),
  ('00000000-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'bd-set@test', now(), '{}');
update public.user_private_info set birth_date = '2012-05-05' where user_id = '00000000-0000-0000-0000-0000000000d2';

set local role authenticated;

-- Not set yet → the user may fill it in.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
select lives_ok($$update public.user_private_info set birth_date = '2000-01-01'
                   where user_id = '00000000-0000-0000-0000-0000000000d1'$$, 'first set is allowed');
select throws_ok($$update public.user_private_info set birth_date = '1990-01-01'
                    where user_id = '00000000-0000-0000-0000-0000000000d1'$$,
  'P0001', 'birth_date_locked', 'changing it afterwards is blocked');

-- Already set → can't change or clear it; same value / other columns are fine.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
select throws_ok($$update public.user_private_info set birth_date = '1990-01-01'
                    where user_id = '00000000-0000-0000-0000-0000000000d2'$$,
  'P0001', 'birth_date_locked', 'a minor cannot age themselves up');
select throws_ok($$update public.user_private_info set birth_date = null
                    where user_id = '00000000-0000-0000-0000-0000000000d2'$$,
  'P0001', 'birth_date_locked', 'cannot clear it to set it again');
select lives_ok($$update public.user_private_info set birth_date = '2012-05-05'
                   where user_id = '00000000-0000-0000-0000-0000000000d2'$$, 'same value is a no-op');
reset role;

-- Support/admin path (service_role) can still correct it.
set local role service_role;
select lives_ok($$update public.user_private_info set birth_date = '2011-05-05'
                   where user_id = '00000000-0000-0000-0000-0000000000d2'$$, 'service_role may change it');
reset role;
select is((select birth_date from public.user_private_info where user_id = '00000000-0000-0000-0000-0000000000d2'),
  '2011-05-05'::date, 'service_role change applied');

select * from finish();
rollback;
