-- =============================================================================
-- Comments + reviews (series page / reader)
--
-- Tables, grants and basic RLS exist since init_schema. This adds the business
-- rules the client can't be trusted with (it writes these tables directly
-- through RLS):
--
--   comments  insert: episode released, viewer meets the age rating, reply only
--                     to a visible top-level comment of the same target,
--                     ≤ 5 comments per minute
--             update: deleting is one-way (deleted_at := now()); a deleted
--                     comment can't be edited or restored
--             reply → notification 'comment_reply' to the parent's author
--   reviews   insert: not on own series, age rating, and the reviewer must have
--                     read it (series: any reading progress / unlock in the
--                     series; episode: free or unlocked at some point)
--   both      authors who are banned disappear from public reads
--   reports   one report per reporter per comment / review
--   get_review_summary(series, episode)  live average + 1–5 star histogram
--
-- service_role (admin/support) skips the checks.
-- =============================================================================

-- ---- Indexes -------------------------------------------------------------------
-- Rate limit + "my comments" lookups.
drop index public.comments_user_id_idx;
create index comments_user_created_idx on public.comments (user_id, created_at desc);
-- Review lists are newest first per target.
drop index public.reviews_series_episode_idx;
create index reviews_series_episode_created_idx on public.reviews (series_id, episode_id, created_at desc);

create unique index reports_reporter_comment_uniq on public.reports (reporter_id, comment_id) where comment_id is not null;
create unique index reports_reporter_review_uniq  on public.reports (reporter_id, review_id)  where review_id  is not null;

-- ---- Comments: write rules ------------------------------------------------------
create function private.check_comment_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_rating public.age_rating;
  v_owner  uuid;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  select s.age_rating, s.uploader_id into v_rating, v_owner
    from public.series s where s.id = new.series_id;      -- series RLS applies
  if not found then
    raise exception 'series_not_available' using errcode = 'P0001';
  end if;
  if v_owner is distinct from (select auth.uid()) and not private.meets_age_rating(v_rating) then
    raise exception 'age_restricted' using errcode = 'P0001';
  end if;

  if new.episode_id is not null and not exists (
       select 1 from public.episodes e
        where e.id = new.episode_id and e.series_id = new.series_id
          and e.deleted_at is null and e.publish_at <= now()) then
    raise exception 'episode_not_available' using errcode = 'P0001';
  end if;

  if new.parent_id is not null and not exists (
       select 1 from public.comments p
        where p.id = new.parent_id
          and p.series_id = new.series_id
          and p.episode_id is not distinct from new.episode_id
          and p.parent_id is null
          and p.deleted_at is null and p.hidden_at is null) then
    raise exception 'comment_parent_invalid' using errcode = 'P0001';
  end if;

  if (select count(*) from public.comments c
       where c.user_id = new.user_id and c.created_at > now() - interval '1 minute') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  new.hidden_at  := null;
  new.deleted_at := null;
  return new;
end;
$$;

create function private.check_comment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if old.deleted_at is not null then
    raise exception 'comment_not_found' using errcode = 'P0001';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();      -- server time, and one-way
  end if;
  return new;
end;
$$;

create trigger check_comment_insert before insert on public.comments
  for each row execute function private.check_comment_insert();
create trigger check_comment_update before update on public.comments
  for each row execute function private.check_comment_update();

-- ---- Comments: reply notification ----------------------------------------------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('new_episode', 'withdrawal_update', 'refund', 'moderation', 'system', 'comment_reply'));

-- Security definer: the replier can't insert notifications for other users.
create function private.notify_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, type, series_id, episode_id, payload)
  select p.user_id, 'comment_reply', new.series_id, new.episode_id,
         jsonb_build_object(
           'series_title', s.title,
           'episode_number', e.number,
           'comment_id', p.id,
           'reply_id', new.id,
           'replier_name', coalesce(nullif(pr.display_name, ''), pr.username),
           'snippet', left(new.body, 100))
    from public.comments p
    join public.series s on s.id = new.series_id
    left join public.episodes e on e.id = new.episode_id
    left join public.profiles pr on pr.id = new.user_id
   where p.id = new.parent_id
     and p.user_id <> new.user_id
     and p.deleted_at is null;
  return null;
end;
$$;

create trigger notify_comment_reply after insert on public.comments
  for each row when (new.parent_id is not null)
  execute function private.notify_comment_reply();

-- ---- Reviews: write rules -------------------------------------------------------
create function private.check_review_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_rating public.age_rating;
  v_owner  uuid;
  v_uid    uuid := (select auth.uid());
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  select s.age_rating, s.uploader_id into v_rating, v_owner
    from public.series s where s.id = new.series_id;      -- series RLS applies
  if not found then
    raise exception 'series_not_available' using errcode = 'P0001';
  end if;
  if v_owner = v_uid then
    raise exception 'cannot_review_own_series' using errcode = 'P0001';
  end if;
  if not private.meets_age_rating(v_rating) then
    raise exception 'age_restricted' using errcode = 'P0001';
  end if;

  if new.episode_id is null then
    if not exists (select 1 from public.reading_progress rp
                    where rp.user_id = v_uid and rp.series_id = new.series_id)
       and not exists (select 1 from public.episode_unlocks u
                        where u.user_id = v_uid and u.series_id = new.series_id and u.refunded_at is null) then
      raise exception 'review_requires_reading' using errcode = 'P0001';
    end if;
  else
    if not exists (select 1 from public.episodes e
                    where e.id = new.episode_id and e.series_id = new.series_id
                      and e.deleted_at is null and e.publish_at <= now()) then
      raise exception 'episode_not_available' using errcode = 'P0001';
    end if;
    -- Free, or unlocked at some point (an expired unlock still counts as read).
    if not exists (select 1 from public.episodes e where e.id = new.episode_id and e.price = 0)
       and not exists (select 1 from public.episode_unlocks u
                        where u.user_id = v_uid and u.episode_id = new.episode_id and u.refunded_at is null) then
      raise exception 'review_requires_reading' using errcode = 'P0001';
    end if;
  end if;

  new.hidden_at := null;
  return new;
end;
$$;

create trigger check_review_insert before insert on public.reviews
  for each row execute function private.check_review_insert();

revoke execute on function
  private.check_comment_insert(),
  private.check_comment_update(),
  private.notify_comment_reply(),
  private.check_review_insert()
from public, anon, authenticated;

-- ---- Read policies: also hide banned authors -------------------------------------
-- profiles RLS hides banned users (except to themselves), so the exists() is
-- false for their rows.
drop policy "comments: public read visible" on public.comments;
create policy "comments: public read visible" on public.comments
  for select to anon, authenticated
  using (
    (hidden_at is null and deleted_at is null
      and exists (select 1 from public.series s where s.id = comments.series_id)
      and exists (select 1 from public.profiles p where p.id = comments.user_id))
    or user_id = (select auth.uid())
  );

drop policy "reviews: public read visible" on public.reviews;
create policy "reviews: public read visible" on public.reviews
  for select to anon, authenticated
  using (
    (hidden_at is null
      and exists (select 1 from public.series s where s.id = reviews.series_id)
      and exists (select 1 from public.profiles p where p.id = reviews.user_id))
    or user_id = (select auth.uid())
  );

-- ---- Rating summary ---------------------------------------------------------------
-- Live (not the ranking MV) so a new review shows up right away. Security
-- invoker → RLS on series/reviews applies; own hidden reviews are excluded.
create function public.get_review_summary(p_series_id bigint, p_episode_id bigint default null)
returns table (
  rating_avg   numeric,
  rating_count integer,
  star_counts  integer[]          -- [1★, 2★, 3★, 4★, 5★]
)
language sql
stable
set search_path = ''
as $$
  select round(avg(r.rating), 2),
         count(*)::integer,
         array[
           count(*) filter (where r.rating = 1)::integer,
           count(*) filter (where r.rating = 2)::integer,
           count(*) filter (where r.rating = 3)::integer,
           count(*) filter (where r.rating = 4)::integer,
           count(*) filter (where r.rating = 5)::integer]
    from public.reviews r
   where r.series_id = p_series_id
     and (r.episode_id = p_episode_id or (p_episode_id is null and r.episode_id is null))
     and r.hidden_at is null;
$$;

revoke execute on function public.get_review_summary(bigint, bigint) from public;
grant execute on function public.get_review_summary(bigint, bigint) to anon, authenticated, service_role;
