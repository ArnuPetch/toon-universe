-- =============================================================================
-- Birth date: set once by the user, then locked
--
-- birth_date decides who may read 13+ / 18+ series, so a reader must not be
-- able to change it once set (RLS "owner update" would otherwise allow it via
-- the API). Users (anon / authenticated) may only fill it in while it is null;
-- changing or clearing it afterwards needs service_role (support/admin).
-- =============================================================================

create function private.lock_birth_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Security invoker: current_user is the API role of the request.
  if old.birth_date is not null
     and new.birth_date is distinct from old.birth_date
     and current_user in ('anon', 'authenticated') then
    raise exception 'birth_date_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.lock_birth_date() from public, anon, authenticated;

create trigger lock_birth_date before update of birth_date on public.user_private_info
  for each row execute function private.lock_birth_date();
