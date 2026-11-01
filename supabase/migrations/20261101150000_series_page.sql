-- =============================================================================
-- Series page helpers (src/lib/server/series.ts)
--
--   get_series_stats(series_id)       all-time views / followers / rating of one
--                                     series (from private.series_rank_stats,
--                                     ≤ 10 min old) — series_follows is owner-only,
--                                     so clients can't count followers themselves.
--   viewer_meets_age_rating(rating)   does the CALLER satisfy an age rating?
--                                     (same rule as RLS / unlock_episode)
-- Both are security invoker and callable by anon / authenticated.
-- =============================================================================

create function public.get_series_stats(p_series_id bigint)
returns table (
  views        bigint,
  follows      bigint,
  rating_avg   numeric,
  rating_count integer
)
language sql
stable
set search_path = ''
as $$
  select coalesce(st.views, 0), coalesce(st.follows, 0), st.rating_avg, coalesce(st.rating_count, 0)
    from public.series s                                     -- series RLS applies
    left join private.series_rank_stats st on st.series_id = s.id and st.period = 'all'
   where s.id = p_series_id;
$$;

create function public.viewer_meets_age_rating(p_rating public.age_rating)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.meets_age_rating(p_rating);
$$;

revoke execute on function
  public.get_series_stats(bigint),
  public.viewer_meets_age_rating(public.age_rating)
from public;

grant execute on function
  public.get_series_stats(bigint),
  public.viewer_meets_age_rating(public.age_rating)
to anon, authenticated, service_role;
