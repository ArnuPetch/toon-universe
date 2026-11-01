-- =============================================================================
-- Reader pages: search / genre / updates (src/lib/server/browse.ts)
--
--   search_series(...)   public series the CALLER may see (series RLS + age
--                        rating), with optional text match (title, author,
--                        genre), genre / status / free-or-paid filters and a
--                        sort order. Returns the latest released episode and a
--                        total row count for paging.
--
-- Security invoker, callable by anon / authenticated. Popularity / rating come
-- from private.series_rank_stats (≤ 10 min old), like get_series_ranking.
-- =============================================================================

create function public.search_series(
  p_query    text default null,
  p_genre_id smallint default null,
  p_status   public.series_status default null,
  p_price    text default null,      -- 'free' (no paid episode) | 'paid' (has a paid episode) | null
  p_sort     text default null,      -- 'relevance' | 'popular' | 'updated' | 'new' | 'rating' | 'title'
  p_limit    integer default 24,
  p_offset   integer default 0
)
returns table (
  series_id             bigint,
  slug                  text,
  title                 text,
  cover_key             text,
  age_rating            public.age_rating,
  status                public.series_status,
  views                 bigint,
  rating_avg            numeric,
  rating_count          integer,
  published_at          timestamptz,
  last_episode_at       timestamptz,
  latest_episode_number integer,
  latest_episode_price  integer,
  latest_episode_at     timestamptz,
  total_count           bigint
)
language sql
stable
set search_path = ''
as $$
  with prm as (
    select q,
           -- ILIKE pattern with the wildcard characters of the query escaped.
           '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
           case
             when p_sort in ('relevance', 'popular', 'updated', 'new', 'rating', 'title')
              and (p_sort <> 'relevance' or q is not null) then p_sort
             when q is not null then 'relevance'
             else 'popular'
           end as sort
      from (select nullif(btrim(left(p_query, 100)), '') as q) x
  ),
  matched as (
    select s.id, s.slug, s.title, s.cover_key, s.age_rating, s.status,
           s.published_at, s.last_episode_at,
           coalesce(sa.views, 0)  as views_all,
           coalesce(sm.views, 0)  as views_month,
           sa.rating_avg, coalesce(sa.rating_count, 0) as rating_count, sa.rating_score,
           case when prm.q is null then 0
                else extensions.similarity(s.title, prm.q)
                     + case when s.title ilike prm.pat then 1 else 0 end end as relevance,
           prm.sort
      from public.series s
     cross join prm
      left join private.series_rank_stats sa on sa.series_id = s.id and sa.period = 'all'
      left join private.series_rank_stats sm on sm.series_id = s.id and sm.period = 'month'
     where s.visibility = 'published' and s.moderation_status = 'active' and s.deleted_at is null
       and private.meets_age_rating(s.age_rating)
       and (p_status is null or s.status = p_status)
       and (p_genre_id is null
            or exists (select 1 from public.series_genres g
                        where g.series_id = s.id and g.genre_id = p_genre_id))
       and (p_price is null
            or (p_price = 'paid') = exists (
                 select 1 from public.episodes e
                  where e.series_id = s.id and e.price > 0
                    and e.released_at is not null and e.deleted_at is null))
       and (prm.q is null
            or s.title ilike prm.pat
            or exists (select 1 from public.profiles p
                        where p.id = s.uploader_id
                          and (p.display_name ilike prm.pat or p.username ilike prm.pat))
            or exists (select 1 from public.series_genres g
                         join public.genres gn on gn.id = g.genre_id
                        where g.series_id = s.id
                          and (gn.name_th ilike prm.pat or gn.name_en ilike prm.pat)))
  ),
  page as (
    select m.*, count(*) over () as total_count
      from matched m
     order by
       case when m.sort = 'relevance' then m.relevance end desc nulls last,
       case when m.sort = 'popular'   then m.views_month end desc nulls last,
       case when m.sort = 'updated'   then m.last_episode_at end desc nulls last,
       case when m.sort = 'new'       then m.published_at end desc nulls last,
       case when m.sort = 'rating'    then m.rating_score end desc nulls last,
       case when m.sort = 'title'     then m.title end asc,
       m.views_all desc, m.id
     limit least(greatest(coalesce(p_limit, 24), 1), 60)
    offset least(greatest(coalesce(p_offset, 0), 0), 10000)
  )
  select pg.id, pg.slug, pg.title, pg.cover_key, pg.age_rating, pg.status,
         pg.views_all, pg.rating_avg, pg.rating_count, pg.published_at, pg.last_episode_at,
         le.number, le.price, le.released_at, pg.total_count
    from page pg
    left join lateral (
      select e.number, e.price, e.released_at
        from public.episodes e
       where e.series_id = pg.id and e.released_at is not null and e.deleted_at is null
       order by e.number desc
       limit 1
    ) le on true
   order by
     case when pg.sort = 'relevance' then pg.relevance end desc nulls last,
     case when pg.sort = 'popular'   then pg.views_month end desc nulls last,
     case when pg.sort = 'updated'   then pg.last_episode_at end desc nulls last,
     case when pg.sort = 'new'       then pg.published_at end desc nulls last,
     case when pg.sort = 'rating'    then pg.rating_score end desc nulls last,
     case when pg.sort = 'title'     then pg.title end asc,
     pg.views_all desc, pg.id;
$$;

revoke execute on function
  public.search_series(text, smallint, public.series_status, text, text, integer, integer)
from public;

grant execute on function
  public.search_series(text, smallint, public.series_status, text, text, integer, integer)
to anon, authenticated, service_role;
