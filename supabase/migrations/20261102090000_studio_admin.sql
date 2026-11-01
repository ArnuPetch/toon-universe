-- =============================================================================
-- Uploader studio + admin pages
--
--   episodes.page_count       kept in sync with episode_pages by a trigger
--                             (uploaders can't write the column themselves)
--   get_uploader_stats        per-series views / followers / unlocks / revenue of
--                             one uploader (live, includes drafts & held series)
--   get_uploader_episode_stats  per-episode views / unlocks of one own series
--   get_uploader_balance      earnings split: waiting (< 30 days or series held),
--                             withdrawable, in a withdrawal being processed, paid
--   set_content_hidden        admin hides/unhides a comment or review; hiding also
--                             resolves the open reports on it
--   resolve_report            admin closes a report (resolved / dismissed)
--   set_user_verified         admin grants/revokes the verified badge
--   admin_find_users          admin user search (email / username / display name)
--
-- All RPCs follow server_functions: EXECUTE for service_role only, the acting
-- uploader/admin id comes from the verified session, admin RPCs re-check the
-- role in the DB (private.assert_admin).
-- =============================================================================

-- ---- episodes.page_count --------------------------------------------------------
create function private.sync_episode_page_count()
returns trigger
language plpgsql
security definer          -- authenticated has no UPDATE grant on page_count
set search_path = ''
as $$
declare
  v_episode_id bigint := coalesce(new.episode_id, old.episode_id);
begin
  update public.episodes e
     set page_count = (select count(*) from public.episode_pages p where p.episode_id = v_episode_id)
   where e.id = v_episode_id;
  if tg_op = 'UPDATE' and new.episode_id is distinct from old.episode_id then
    update public.episodes e
       set page_count = (select count(*) from public.episode_pages p where p.episode_id = old.episode_id)
     where e.id = old.episode_id;
  end if;
  return null;
end;
$$;

create trigger sync_page_count after insert or delete or update of episode_id on public.episode_pages
  for each row execute function private.sync_episode_page_count();

revoke execute on function private.sync_episode_page_count() from public, anon, authenticated;

-- Backfill (test data inserted pages without touching page_count).
update public.episodes e
   set page_count = c.n
  from (select episode_id, count(*)::integer as n from public.episode_pages group by episode_id) c
 where c.episode_id = e.id and e.page_count <> c.n;

-- ---- Indexes for the admin queues --------------------------------------------------
create index withdrawals_status_requested_idx on public.withdrawals (status, requested_at);

-- =============================================================================
-- Uploader stats
-- =============================================================================

-- One row per (not deleted) series of the uploader. Unlocks count every unlock
-- that wasn't refunded (welcome coins included); revenue counts earnings that
-- weren't reversed (purchased coins only, unlocks + donations).
create function public.get_uploader_stats(p_uploader_id uuid)
returns table (
  series_id      bigint,
  views          bigint,
  views_30d      bigint,
  followers      bigint,
  unlocks        bigint,
  unlocks_30d    bigint,
  revenue        bigint,
  revenue_30d    bigint
)
language sql
stable
set search_path = ''
as $$
  with mine as (
    select s.id from public.series s
     where s.uploader_id = p_uploader_id and s.deleted_at is null
  ),
  v as (
    select d.series_id,
           sum(d.views) as total,
           sum(d.views) filter (where d.view_date >= private.bkk_today() - 29) as recent
      from public.episode_view_daily d
     where d.series_id in (select id from mine)
     group by d.series_id
  ),
  f as (
    select sf.series_id, count(*) as total
      from public.series_follows sf
     where sf.series_id in (select id from mine)
     group by sf.series_id
  ),
  u as (
    select eu.series_id, count(*) as total,
           count(*) filter (where eu.unlocked_at >= now() - interval '30 days') as recent
      from public.episode_unlocks eu
     where eu.series_id in (select id from mine) and eu.refunded_at is null
     group by eu.series_id
  ),
  r as (
    select ue.series_id, sum(ue.amount) as total,
           sum(ue.amount) filter (where ue.created_at >= now() - interval '30 days') as recent
      from public.uploader_earnings ue
     where ue.uploader_id = p_uploader_id and ue.status <> 'reversed'
       and ue.series_id in (select id from mine)
     group by ue.series_id
  )
  select m.id,
         coalesce(v.total, 0)::bigint, coalesce(v.recent, 0)::bigint,
         coalesce(f.total, 0)::bigint,
         coalesce(u.total, 0)::bigint, coalesce(u.recent, 0)::bigint,
         coalesce(r.total, 0)::bigint, coalesce(r.recent, 0)::bigint
    from mine m
    left join v on v.series_id = m.id
    left join f on f.series_id = m.id
    left join u on u.series_id = m.id
    left join r on r.series_id = m.id;
$$;

-- Per-episode views / unlocks of one series, only if it belongs to the uploader.
create function public.get_uploader_episode_stats(p_uploader_id uuid, p_series_id bigint)
returns table (episode_id bigint, views bigint, unlocks bigint)
language sql
stable
set search_path = ''
as $$
  select e.id,
         coalesce((select sum(d.views) from public.episode_view_daily d where d.episode_id = e.id), 0)::bigint,
         (select count(*) from public.episode_unlocks u where u.episode_id = e.id and u.refunded_at is null)
    from public.episodes e
    join public.series s on s.id = e.series_id
   where e.series_id = p_series_id and s.uploader_id = p_uploader_id and e.deleted_at is null;
$$;

-- Same withdrawable rule as request_withdrawal.
create function public.get_uploader_balance(p_uploader_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with e as (
    select ue.amount, ue.status, ue.available_at, w.status as withdrawal_status,
           exists (select 1 from public.series s
                    where s.id = ue.series_id and s.moderation_status = 'under_review') as held
      from public.uploader_earnings ue
      left join public.withdrawals w on w.id = ue.withdrawal_id
     where ue.uploader_id = p_uploader_id
  )
  select jsonb_build_object(
    'withdrawable', coalesce(sum(amount) filter (where status = 'pending' and available_at <= now() and not held), 0),
    'waiting',      coalesce(sum(amount) filter (where status = 'pending' and (available_at > now() or held)), 0),
    'next_available_at', min(available_at) filter (where status = 'pending' and available_at > now() and not held),
    'processing',   coalesce(sum(amount) filter (where status = 'withdrawn' and withdrawal_status in ('pending', 'approved')), 0),
    'paid',         coalesce(sum(amount) filter (where status = 'withdrawn' and withdrawal_status = 'paid'), 0)
  )
  from e;
$$;

-- =============================================================================
-- Admin moderation
-- =============================================================================

-- Hide (p_hidden) or unhide a comment / review. Hiding resolves every open
-- report on it with p_note. Returns the number of reports resolved.
create function public.set_content_hidden(
  p_admin_id    uuid,
  p_target_type public.report_target,
  p_target_id   bigint,
  p_hidden      boolean,
  p_note        text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_resolved integer := 0;
begin
  perform private.assert_admin(p_admin_id);

  if p_target_type = 'comment' then
    update public.comments
       set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end
     where id = p_target_id;
    if not found then
      raise exception 'comment_not_found' using errcode = 'P0001';
    end if;
  elsif p_target_type = 'review' then
    update public.reviews
       set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end
     where id = p_target_id;
    if not found then
      raise exception 'review_not_found' using errcode = 'P0001';
    end if;
  else
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  if p_hidden then
    update public.reports
       set status = 'resolved', resolved_by = p_admin_id, resolved_at = now(),
           resolution_note = coalesce(nullif(btrim(p_note), ''), 'hidden')
     where status = 'open'
       and ((p_target_type = 'comment' and comment_id = p_target_id)
         or (p_target_type = 'review'  and review_id  = p_target_id));
    get diagnostics v_resolved = row_count;
  end if;

  return jsonb_build_object('hidden', p_hidden, 'reports_resolved', v_resolved);
end;
$$;

create function public.resolve_report(
  p_report_id bigint,
  p_admin_id  uuid,
  p_status    public.report_status,
  p_note      text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_report public.reports;
begin
  perform private.assert_admin(p_admin_id);

  if p_status not in ('resolved', 'dismissed') then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  update public.reports
     set status = p_status, resolved_by = p_admin_id, resolved_at = now(),
         resolution_note = nullif(btrim(p_note), '')
   where id = p_report_id and status = 'open'
  returning * into v_report;
  if not found then
    raise exception 'report_not_open' using errcode = 'P0001';
  end if;

  return jsonb_build_object('report_id', v_report.id, 'status', v_report.status);
end;
$$;

create function public.set_user_verified(p_user_id uuid, p_admin_id uuid, p_verified boolean)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  perform private.assert_admin(p_admin_id);

  update public.profiles set is_verified = p_verified where id = p_user_id;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;

  return jsonb_build_object('user_id', p_user_id, 'is_verified', p_verified);
end;
$$;

-- Search users by email / username / display name (or exact id). Email lives in
-- auth.users, so this is SECURITY DEFINER — callable by service_role only, and
-- it re-checks the admin.
create function public.admin_find_users(p_admin_id uuid, p_query text, p_limit integer default 20)
returns table (
  id            uuid,
  email         text,
  username      text,
  display_name  text,
  status        public.account_status,
  is_verified   boolean,
  is_admin      boolean,
  created_at    timestamptz,
  series_count  bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q    text := btrim(coalesce(p_query, ''));
  v_like text;
begin
  perform private.assert_admin(p_admin_id);

  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select p.id, u.email::text, p.username, p.display_name, p.status, p.is_verified,
         coalesce(u.raw_app_meta_data ->> 'role' = 'admin', false),
         p.created_at,
         (select count(*) from public.series s where s.uploader_id = p.id and s.deleted_at is null)
    from public.profiles p
    join auth.users u on u.id = p.id
   where v_q = ''
      or p.id::text = v_q
      or u.email ilike v_like
      or p.username ilike v_like
      or p.display_name ilike v_like
   order by p.created_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

-- ---- Privileges ------------------------------------------------------------------
revoke execute on function
  public.get_uploader_stats(uuid),
  public.get_uploader_balance(uuid),
  public.get_uploader_episode_stats(uuid, bigint),
  public.set_content_hidden(uuid, public.report_target, bigint, boolean, text),
  public.resolve_report(bigint, uuid, public.report_status, text),
  public.set_user_verified(uuid, uuid, boolean),
  public.admin_find_users(uuid, text, integer)
from public, anon, authenticated;

grant execute on function
  public.get_uploader_stats(uuid),
  public.get_uploader_balance(uuid),
  public.get_uploader_episode_stats(uuid, bigint),
  public.set_content_hidden(uuid, public.report_target, bigint, boolean, text),
  public.resolve_report(bigint, uuid, public.report_status, text),
  public.set_user_verified(uuid, uuid, boolean),
  public.admin_find_users(uuid, text, integer)
to service_role;
