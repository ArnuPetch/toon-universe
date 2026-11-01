-- R2 object keys written by uploaders.
--
-- Uploaders write episode_pages / series straight through RLS, so without a
-- check they could point storage_key at another series' (paid) pages and get
-- signed URLs for them through their own free episode. Writes made as
-- `authenticated` must use keys inside their own series/episode prefix:
--
--   episode_pages.storage_key  episodes/<series_id>/<episode_id>/<batch>/<NNN>.<ext>
--   series.cover_key           covers/<series_id>/<uuid>.<ext>
--
-- service_role / migrations are trusted and skip the check.

create function private.check_episode_page_key()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_series_id bigint;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  select e.series_id into v_series_id from public.episodes e where e.id = new.episode_id;
  if v_series_id is null or new.storage_key !~ ('^episodes/' || v_series_id || '/' || new.episode_id
                         || '/[a-z0-9]{8,36}/[0-9]{3}\.(jpg|png|webp|gif|avif)$') then
    raise exception 'invalid_storage_key' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger check_storage_key before insert or update of storage_key, episode_id on public.episode_pages
  for each row execute function private.check_episode_page_key();

create function private.check_series_cover_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' or new.cover_key is null then
    return new;
  end if;
  if new.cover_key !~ ('^covers/' || new.id || '/[0-9a-f-]{36}\.(webp|jpg)$') then
    raise exception 'invalid_storage_key' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger check_cover_key before insert or update of cover_key on public.series
  for each row execute function private.check_series_cover_key();

revoke execute on function private.check_episode_page_key() from public, anon, authenticated;
revoke execute on function private.check_series_cover_key() from public, anon, authenticated;
