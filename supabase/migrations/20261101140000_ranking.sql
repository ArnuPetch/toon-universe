-- Ranking & recommendation.
--
--   * View counting      public.record_episode_view (service_role) — 1 view per
--                         viewer per episode per day (Asia/Bangkok date)
--   * Ranking            private.series_rank_stats (materialized, refreshed every 10 min)
--                         + public.get_series_ranking (anon/authenticated)
--   * "Also read"        private.series_also_read (materialized, refreshed hourly)
--                         + public.get_series_recommendations (anon/authenticated)
--   * series.published_at is now set the first time a series is published.
--
-- The materialized views live in `private` (not exposed by the Data API, and
-- materialized views can't have RLS). The public functions are security
-- invoker: they join public.series, so series RLS + an explicit visibility
-- filter + the caller's age rating are applied at read time — a series that
-- is removed/held after the last refresh disappears immediately.
--
-- Day boundaries use the Thai calendar day (Asia/Bangkok). Windows:
--   day   = today + yesterday (2 daily buckets, so it is never empty at midnight)
--   week  = last 7 days incl. today
--   month = last 30 days incl. today
--   all   = everything
-- "trending" compares the window with the window right before it.

create type public.ranking_kind   as enum ('views', 'rating', 'trending', 'new', 'updated');
create type public.ranking_period as enum ('day', 'week', 'month', 'all');

-- =============================================================================
-- 0) Helpers + series.published_at
-- =============================================================================

create function private.bkk_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Bangkok')::date;
$$;

-- Number of daily buckets in a window (null = all time).
create function private.ranking_window_days(p_period public.ranking_period)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_period when 'day' then 2 when 'week' then 7 when 'month' then 30 end;
$$;

-- Start of the window as a timestamp (Bangkok midnight), null = all time.
create function private.ranking_since(p_period public.ranking_period)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((private.bkk_today() - (private.ranking_window_days(p_period) - 1))::timestamp)
           at time zone 'Asia/Bangkok';
$$;

-- published_at = first time the series became public (for the "new" ranking).
create function private.set_series_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visibility = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger set_published_at before insert or update of visibility on public.series
  for each row execute function private.set_series_published_at();

update public.series set published_at = created_at
 where visibility = 'published' and published_at is null;

create index series_public_published_idx on public.series (published_at desc)
  where visibility = 'published' and moderation_status = 'active' and deleted_at is null;

-- =============================================================================
-- 1) View counting
-- =============================================================================

-- Who already counted a view today. Only today/yesterday are needed; older
-- rows are purged daily.
create table private.episode_view_seen (
  episode_id  bigint not null,
  viewer_key  text   not null check (char_length(viewer_key) between 1 and 64),
  view_date   date   not null,
  primary key (episode_id, viewer_key, view_date)
);
create index episode_view_seen_date_idx on private.episode_view_seen (view_date);
alter table private.episode_view_seen enable row level security;  -- no policies: service_role only
revoke all on private.episode_view_seen from public, anon, authenticated;
grant select, insert, delete on private.episode_view_seen to service_role;

-- Count one view of a released, publicly visible episode.
-- p_viewer_key: the verified user id (signed in) or an anonymous cookie id —
-- the server builds it, never the client. The uploader's own views don't count.
-- Returns true if the view was counted.
create function public.record_episode_view(p_episode_id bigint, p_viewer_key text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_series_id   bigint;
  v_uploader_id uuid;
  v_today       date := private.bkk_today();
begin
  select e.series_id, s.uploader_id into v_series_id, v_uploader_id
    from public.episodes e
    join public.series s on s.id = e.series_id
   where e.id = p_episode_id
     and e.publish_at <= now() and e.deleted_at is null
     and s.visibility = 'published' and s.moderation_status = 'active' and s.deleted_at is null;

  if v_series_id is null or p_viewer_key = v_uploader_id::text then
    return false;
  end if;

  insert into private.episode_view_seen (episode_id, viewer_key, view_date)
  values (p_episode_id, p_viewer_key, v_today)
  on conflict do nothing;
  if not found then
    return false;
  end if;

  insert into public.episode_view_daily (episode_id, series_id, view_date, views)
  values (p_episode_id, v_series_id, v_today, 1)
  on conflict (episode_id, view_date)
  do update set views = public.episode_view_daily.views + 1;

  return true;
end;
$$;

-- =============================================================================
-- 2) Ranking stats (one row per public series per period)
-- =============================================================================

create materialized view private.series_rank_stats as
with periods as (
  select p.period,
         private.bkk_today() - (d.days - 1)     as cur_from,    -- null = all time
         private.bkk_today() - (2 * d.days - 1) as prev_from,
         private.ranking_since(p.period)        as cur_ts,
         private.ranking_since(p.period) - make_interval(days => d.days) as prev_ts
    from unnest(enum_range(null::public.ranking_period)) as p(period)
   cross join lateral (select private.ranking_window_days(p.period) as days) d
),
public_series as (
  select s.id from public.series s
   where s.visibility = 'published' and s.moderation_status = 'active' and s.deleted_at is null
),
views as (
  select w.period, v.series_id,
         sum(v.views) filter (where w.cur_from is null or v.view_date >= w.cur_from) as cur,
         sum(v.views) filter (where v.view_date < w.cur_from)                       as prev
    from periods w
    join public.episode_view_daily v on w.prev_from is null or v.view_date >= w.prev_from
    join public_series ps on ps.id = v.series_id
   group by w.period, v.series_id
),
follows as (
  select w.period, f.series_id,
         count(*) filter (where w.cur_ts is null or f.created_at >= w.cur_ts) as cur,
         count(*) filter (where f.created_at < w.cur_ts)                     as prev
    from periods w
    join public.series_follows f on w.prev_ts is null or f.created_at >= w.prev_ts
    join public_series ps on ps.id = f.series_id
   group by w.period, f.series_id
),
-- Series-level reviews written in the window.
ratings as (
  select w.period, r.series_id, count(*) as n, sum(r.rating) as total
    from periods w
    join public.reviews r
      on r.episode_id is null and r.hidden_at is null
     and (w.cur_ts is null or r.created_at >= w.cur_ts)
    join public_series ps on ps.id = r.series_id
   group by w.period, r.series_id
),
rating_prior as (
  select period, sum(total)::numeric / sum(n) as mean from ratings group by period
),
joined as (
  select ps.id as series_id, w.period,
         coalesce(v.cur, 0)  as views,      coalesce(v.prev, 0) as prev_views,
         coalesce(f.cur, 0)  as follows,    coalesce(f.prev, 0) as prev_follows,
         coalesce(r.n, 0)    as rating_count,
         r.total             as rating_total,
         rp.mean             as rating_mean
    from public_series ps
   cross join periods w
    left join views   v on v.series_id = ps.id and v.period = w.period
    left join follows f on f.series_id = ps.id and f.period = w.period
    left join ratings r on r.series_id = ps.id and r.period = w.period
    left join rating_prior rp on rp.period = w.period
)
select series_id, period,
       views::bigint, prev_views::bigint, follows::bigint, prev_follows::bigint,
       rating_count::integer,
       round(rating_total::numeric / nullif(rating_count, 0), 2) as rating_avg,
       -- Bayesian average: 5 virtual reviews at the window's mean rating, so a
       -- single 5-star review doesn't beat 200 reviews averaging 4.8.
       case when rating_count > 0
            then round((5 * rating_mean + rating_total) / (5 + rating_count), 4) end as rating_score,
       -- Activity = views + 10 per new follower. Score = growth ratio vs the
       -- previous window (smoothed by +20) weighted by volume; only growing series.
       case when period <> 'all'
             and views + 10 * follows > prev_views + 10 * prev_follows
            then round((views + 10 * follows)
                       * ln((views + 10 * follows + 20.0) / (prev_views + 10 * prev_follows + 20.0)), 4)
            else 0 end as trending_score,
       now() as refreshed_at
  from joined;

create unique index series_rank_stats_pk       on private.series_rank_stats (series_id, period);
create index series_rank_stats_views_idx       on private.series_rank_stats (period, views desc);
create index series_rank_stats_rating_idx      on private.series_rank_stats (period, rating_score desc nulls last);
create index series_rank_stats_trending_idx    on private.series_rank_stats (period, trending_score desc);

-- =============================================================================
-- 3) "Readers of this series also read" (item-item co-occurrence)
-- =============================================================================

-- A reader "engaged" with a series = has reading progress, follows it, or has
-- it on the bookshelf as reading/completed. Each reader's 50 most recent
-- series are used (bounds the pair count). A pair needs >= 3 shared readers so
-- a recommendation never exposes one person's reading list. Score = cosine
-- similarity. Top 30 per series.
create materialized view private.series_also_read as
with public_series as (
  select s.id from public.series s
   where s.visibility = 'published' and s.moderation_status = 'active' and s.deleted_at is null
),
engaged as (
  select x.user_id, x.series_id, max(x.at) as at
    from (
      select user_id, series_id, updated_at as at from public.reading_progress
      union all
      select user_id, series_id, created_at from public.series_follows
      union all
      select user_id, series_id, updated_at from public.bookshelf_entries where status <> 'plan_to_read'
    ) x
    join public_series ps on ps.id = x.series_id
   group by x.user_id, x.series_id
),
recent as (
  select user_id, series_id
    from (select user_id, series_id,
                 row_number() over (partition by user_id order by at desc, series_id) as rn
            from engaged) t
   where rn <= 50
),
readers as (
  select series_id, count(*) as n from recent group by series_id
),
pairs as (
  select a.series_id, b.series_id as other_series_id, count(*) as co
    from recent a
    join recent b on b.user_id = a.user_id and b.series_id <> a.series_id
   group by a.series_id, b.series_id
  having count(*) >= 3
),
scored as (
  select p.series_id, p.other_series_id, p.co,
         p.co / sqrt(ra.n::numeric * rb.n) as score
    from pairs p
    join readers ra on ra.series_id = p.series_id
    join readers rb on rb.series_id = p.other_series_id
),
ranked as (
  select *, row_number() over (partition by series_id
                               order by score desc, co desc, other_series_id) as rank
    from scored
)
select series_id, other_series_id, co::integer as co_readers,
       round(score, 6) as score, rank::integer as rank, now() as refreshed_at
  from ranked
 where rank <= 30;

create unique index series_also_read_pk   on private.series_also_read (series_id, other_series_id);
create index series_also_read_rank_idx    on private.series_also_read (series_id, rank);

-- Read by the security-invoker functions below (private isn't exposed by the API).
revoke all on private.series_rank_stats, private.series_also_read from public;
grant select on private.series_rank_stats, private.series_also_read to anon, authenticated, service_role;

-- =============================================================================
-- 4) Public read functions
-- =============================================================================

-- Ranked public series. Applies the caller's age rating (signed out → 'all'
-- only). p_genre_id filters by genre. Ranks are global (stable across pages).
--   views     most views in the window
--   rating    best Bayesian rating from series reviews written in the window
--   trending  fastest-growing activity vs the previous window ('all' → month)
--   new       first published in the window, newest first
--   updated   new episode in the window, latest first
-- views / rating / trending come from the materialized stats (≤ 10 min old);
-- new / updated read public.series directly.
create function public.get_series_ranking(
  p_kind     public.ranking_kind,
  p_period   public.ranking_period default 'week',
  p_genre_id smallint default null,
  p_limit    integer default 50,
  p_offset   integer default 0
)
returns table (
  rank            integer,
  series_id       bigint,
  slug            text,
  title           text,
  cover_key       text,
  age_rating      public.age_rating,
  status          public.series_status,
  score           numeric,
  views           bigint,
  follows         bigint,
  rating_avg      numeric,
  rating_count    integer,
  published_at    timestamptz,
  last_episode_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  with prm as (
    select case when p_kind = 'trending' and p_period = 'all' then 'month'::public.ranking_period
                else p_period end as period,
           coalesce(private.ranking_since(p_period), '-infinity'::timestamptz) as since
  ),
  candidates as (
    select s.id, s.slug, s.title, s.cover_key, s.age_rating, s.status,
           s.published_at, s.last_episode_at,
           coalesce(st.views, 0) as views, coalesce(st.follows, 0) as follows,
           st.rating_avg, coalesce(st.rating_count, 0) as rating_count,
           case p_kind
             when 'views'    then st.views::numeric
             when 'rating'   then st.rating_score
             when 'trending' then st.trending_score
             when 'new'      then extract(epoch from s.published_at)::numeric
             when 'updated'  then extract(epoch from s.last_episode_at)::numeric
           end as score
      from public.series s
     cross join prm
      left join private.series_rank_stats st on st.series_id = s.id and st.period = prm.period
     where s.visibility = 'published' and s.moderation_status = 'active' and s.deleted_at is null
       and private.meets_age_rating(s.age_rating)
       and (p_genre_id is null
            or exists (select 1 from public.series_genres g
                        where g.series_id = s.id and g.genre_id = p_genre_id))
       and case p_kind
             when 'views'    then st.views > 0
             when 'rating'   then st.rating_count > 0
             when 'trending' then st.trending_score > 0
             when 'new'      then s.published_at >= prm.since
             when 'updated'  then s.last_episode_at >= prm.since
           end
  ),
  ranked as (
    select row_number() over (order by c.score desc, c.views desc, c.id)::integer as rank, c.*
      from candidates c
  )
  select r.rank, r.id, r.slug, r.title, r.cover_key, r.age_rating, r.status,
         r.score, r.views, r.follows, r.rating_avg, r.rating_count,
         r.published_at, r.last_episode_at
    from ranked r
   order by r.rank
   limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- "Readers of this series also read …", topped up with series sharing the most
-- genres (then most viewed this month) when there aren't enough co-readers.
-- Returns nothing if the caller can't see the source series.
create function public.get_series_recommendations(p_series_id bigint, p_limit integer default 12)
returns table (
  series_id  bigint,
  slug       text,
  title      text,
  cover_key  text,
  age_rating public.age_rating,
  status     public.series_status,
  reason     text          -- 'also_read' | 'same_genre'
)
language sql
stable
set search_path = ''
as $$
  with candidates as (
    select a.other_series_id as id, 1 as tier, a.score as k1, a.co_readers::numeric as k2
      from private.series_also_read a
     where a.series_id = p_series_id
    union all
    select g.series_id, 2, count(*)::numeric, max(coalesce(st.views, 0))::numeric
      from public.series_genres g
      left join private.series_rank_stats st on st.series_id = g.series_id and st.period = 'month'
     where g.genre_id in (select genre_id from public.series_genres where series_id = p_series_id)
       and g.series_id <> p_series_id
     group by g.series_id
  ),
  best as (
    select distinct on (id) id, tier, k1, k2 from candidates order by id, tier
  )
  select s.id, s.slug, s.title, s.cover_key, s.age_rating, s.status,
         case b.tier when 1 then 'also_read' else 'same_genre' end
    from best b
    join public.series s on s.id = b.id
   where s.visibility = 'published' and s.moderation_status = 'active' and s.deleted_at is null
     and private.meets_age_rating(s.age_rating)
     and exists (select 1 from public.series src where src.id = p_series_id)   -- series RLS
   order by b.tier, b.k1 desc, b.k2 desc, s.id
   limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;

-- =============================================================================
-- Privileges + schedules
-- =============================================================================
revoke execute on function
  private.bkk_today(),
  private.ranking_window_days(public.ranking_period),
  private.ranking_since(public.ranking_period),
  private.set_series_published_at(),
  public.record_episode_view(bigint, text),
  public.get_series_ranking(public.ranking_kind, public.ranking_period, smallint, integer, integer),
  public.get_series_recommendations(bigint, integer)
from public, anon, authenticated;

grant execute on function
  private.bkk_today(),
  private.ranking_window_days(public.ranking_period),
  private.ranking_since(public.ranking_period)
to anon, authenticated, service_role;

grant execute on function public.record_episode_view(bigint, text) to service_role;

grant execute on function
  public.get_series_ranking(public.ranking_kind, public.ranking_period, smallint, integer, integer),
  public.get_series_recommendations(bigint, integer)
to anon, authenticated, service_role;

-- CONCURRENTLY: readers are never blocked during a refresh (needs the unique indexes).
select cron.schedule('refresh-rank-stats', '*/10 * * * *',
  'refresh materialized view concurrently private.series_rank_stats');
select cron.schedule('refresh-also-read',  '17 * * * *',
  'refresh materialized view concurrently private.series_also_read');
select cron.schedule('purge-view-seen',    '10 3 * * *',
  $$delete from private.episode_view_seen where view_date < private.bkk_today() - 1$$);
