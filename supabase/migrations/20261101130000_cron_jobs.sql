-- Scheduled jobs (pg_cron). Each job calls one function in `private`; the
-- functions are batch-limited and use SKIP LOCKED so a run never waits on (or
-- deadlocks with) a user request — whatever it skips is picked up next run.
--
--   release-episodes      every minute   new-episode notifications + series.last_episode_at
--   refresh-suspensions   every minute   suspended → active once the suspension's ends_at passes
--   expire-welcome-coins  every 10 min   zero expired welcome coins (unlock/donate also do it lazily)
--   purge-cron-history    daily 03:00    drop cron.job_run_details older than 7 days

create extension if not exists pg_cron with schema pg_catalog;

-- =============================================================================
-- 1) Episode release: notify followers once per episode
-- =============================================================================

-- Set when the release job has handled the episode (notified followers, or
-- decided not to). null + publish_at <= now() = waiting for the job.
alter table public.episodes add column released_at timestamptz;

-- Episodes that are already out when this migration runs count as handled,
-- otherwise the first run would notify followers about old episodes.
update public.episodes set released_at = publish_at
 where publish_at <= now() and released_at is null;

create index episodes_release_due_idx on public.episodes (publish_at)
  where released_at is null and publish_at is not null;

-- Handle episodes whose publish_at has passed (scheduled ones, and ones
-- published "now" by the uploader). Followers are notified only if the episode
-- is publicly readable at that moment (series published + active, nothing
-- deleted); otherwise the episode is marked handled without notifying, so a
-- series that comes back from a hold/draft doesn't flood followers with old
-- episodes. Returns the number of episodes handled.
create function private.release_due_episodes(p_limit integer default 200)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_series_ids bigint[];
  v_count      integer;
begin
  -- Lock order: series → episodes. Skip series a request is working on.
  v_series_ids := array(
    select s.id from public.series s
     where s.id in (select e.series_id from public.episodes e
                     where e.released_at is null and e.publish_at <= now())
     order by s.id
     limit p_limit
     for no key update of s skip locked);

  if cardinality(v_series_ids) = 0 then
    return 0;
  end if;

  with due as (
    select e.id, e.series_id, e.number, e.title, e.publish_at, e.deleted_at
      from public.episodes e
     where e.series_id = any (v_series_ids)
       and e.released_at is null and e.publish_at <= now()
     order by e.id
       for update
  ),
  marked as (
    update public.episodes e
       set released_at = now()
      from due
     where e.id = due.id
    returning e.id
  ),
  visible as (
    select due.*, s.title as series_title, s.uploader_id
      from due
      join public.series s on s.id = due.series_id
     where due.deleted_at is null
       and s.visibility = 'published' and s.moderation_status = 'active' and s.deleted_at is null
  ),
  notified as (
    insert into public.notifications (user_id, type, series_id, episode_id, payload)
    select f.user_id, 'new_episode', v.series_id, v.id,
           jsonb_build_object('series_title', v.series_title,
                              'episode_number', v.number,
                              'episode_title', v.title)
      from visible v
      join public.series_follows f on f.series_id = v.series_id
     where f.user_id <> v.uploader_id
    returning id
  ),
  latest as (
    update public.series s
       set last_episode_at = l.latest
      from (select series_id, max(publish_at) as latest
              from due where deleted_at is null group by series_id) l
     where s.id = l.series_id
       and (s.last_episode_at is null or s.last_episode_at < l.latest)
    returning s.id
  )
  select count(*) into v_count from marked;

  return v_count;
end;
$$;

-- =============================================================================
-- 2) Suspension expiry
-- =============================================================================

create index profiles_not_active_idx on public.profiles (id) where status <> 'active';

-- Recompute status for suspended users so a suspension ends at its ends_at.
-- Only 'suspended' is handled: bans have no ends_at, and ending a ban would
-- also need the server to lift the Supabase Auth ban.
-- Returns the number of users whose status changed.
create function private.refresh_expired_suspensions(p_limit integer default 500)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_count   integer := 0;
begin
  for v_user_id in
    select p.id from public.profiles p
     where p.status = 'suspended'
       and not exists (select 1 from public.user_sanctions s
                        where s.user_id = p.id and s.kind = 'suspend'
                          and s.lifted_at is null and s.starts_at <= now()
                          and (s.ends_at is null or s.ends_at > now()))
     order by p.id
     limit p_limit
       for update of p skip locked
  loop
    if private.refresh_user_status(v_user_id) <> 'suspended' then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

-- =============================================================================
-- 3) Welcome coin expiry (same effect as private.lock_wallet's lazy expiry)
-- =============================================================================

create index coin_wallets_welcome_expiry_idx on public.coin_wallets (welcome_expires_at)
  where welcome_balance > 0;

-- Returns the number of wallets swept.
create function private.expire_welcome_coins(p_limit integer default 5000)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    select w.user_id, w.welcome_balance
      from public.coin_wallets w
     where w.welcome_balance > 0 and w.welcome_expires_at <= now()
     order by w.user_id
     limit p_limit
       for update skip locked
  ),
  zeroed as (
    update public.coin_wallets w
       set welcome_balance = 0
      from due
     where w.user_id = due.user_id
    returning w.user_id
  ),
  ledger as (
    insert into public.coin_ledger (user_id, kind, delta, reason)
    select user_id, 'welcome', -welcome_balance, 'welcome_expire'
      from due
    returning id
  )
  select count(*) into v_count from zeroed;

  return v_count;
end;
$$;

-- =============================================================================
-- Privileges + schedules
-- =============================================================================
revoke execute on function
  private.release_due_episodes(integer),
  private.refresh_expired_suspensions(integer),
  private.expire_welcome_coins(integer)
from public, anon, authenticated;

grant execute on function
  private.release_due_episodes(integer),
  private.refresh_expired_suspensions(integer),
  private.expire_welcome_coins(integer)
to service_role;

-- cron.schedule upserts by job name, so re-running is safe.
select cron.schedule('release-episodes',     '* * * * *',    'select private.release_due_episodes()');
select cron.schedule('refresh-suspensions',  '* * * * *',    'select private.refresh_expired_suspensions()');
select cron.schedule('expire-welcome-coins', '*/10 * * * *', 'select private.expire_welcome_coins()');
-- The every-minute jobs add ~4k rows/day to the run log.
select cron.schedule('purge-cron-history',   '0 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);
