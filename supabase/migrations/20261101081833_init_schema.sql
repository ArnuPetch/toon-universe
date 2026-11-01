-- =============================================================================
-- Toon Universe — initial schema (prototype)
--
-- Structure: Series → Season (optional) → Episode → Page
-- Coins:     purchased coin (never expires) + welcome coin (5, expires in 7 days)
-- Revenue:   1 purchased coin spent = 1 THB for the uploader, withdrawable 30 days later
--
-- Security model
--   * RLS is enabled on every table in `public`.
--   * Default Data API grants are revoked; each table gets explicit, minimal grants.
--   * Anything that moves coins/money (unlock, donate, refund, withdrawal, ban,
--     content hold compensation) is written ONLY by the server using the
--     service_role key — clients have read-only access to their own rows.
--   * Admin actions also go through the server (service_role) after checking
--     `app_metadata.role = 'admin'`.
--   * Helper functions live in the unexposed `private` schema.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.account_status    as enum ('active', 'suspended', 'banned');
create type public.age_rating        as enum ('all', 'teen', 'mature');       -- all ages / 13+ / 18+
create type public.series_status     as enum ('ongoing', 'completed', 'hiatus');
create type public.series_visibility as enum ('draft', 'published');
create type public.moderation_status as enum ('active', 'under_review', 'removed');
create type public.reading_mode      as enum ('vertical', 'paged');
create type public.reading_direction as enum ('ltr', 'rtl');
create type public.bookshelf_status  as enum ('reading', 'completed', 'plan_to_read');
create type public.coin_kind         as enum ('purchased', 'welcome');
create type public.coin_ledger_reason as enum (
  'purchase', 'welcome_grant', 'welcome_expire', 'unlock', 'donation',
  'refund', 'ban_forfeit', 'admin_adjust'
);
create type public.payment_status    as enum ('pending', 'succeeded', 'failed', 'canceled');
create type public.earning_source    as enum ('unlock', 'donation');
create type public.earning_status    as enum ('pending', 'withdrawn', 'reversed');
create type public.withdrawal_status as enum ('pending', 'approved', 'paid', 'rejected');
create type public.report_target     as enum ('series', 'comment', 'review', 'user');
create type public.report_reason     as enum (
  'copyright', 'inappropriate', 'wrong_age_rating', 'spam',      -- series
  'abusive', 'unhidden_spoiler',                                 -- comment / review (+ spam)
  'fake_account', 'impersonation'                                -- user
);
create type public.report_status     as enum ('open', 'resolved', 'dismissed');
create type public.sanction_kind     as enum ('suspend', 'ban');

-- -----------------------------------------------------------------------------
-- Generic trigger: updated_at
-- -----------------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================================
-- Users
-- =============================================================================

-- Public profile (one per auth user). Status/verified are server-managed.
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text unique check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name  text check (char_length(display_name) <= 50),
  avatar_key    text,                                   -- R2 object key
  bio           text check (char_length(bio) <= 500),
  is_verified   boolean not null default false,         -- verified badge (granted by admin)
  status        public.account_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Private personal data (PDPA) — only the owner can see it.
create table public.user_private_info (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  birth_date  date check (birth_date > '1900-01-01' and birth_date <= current_date),
  updated_at  timestamptz not null default now()
);

-- Uploader payout destination (PromptPay). Owner-only.
create table public.payout_accounts (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  promptpay_id  text not null check (promptpay_id ~ '^[0-9]{10,15}$'),  -- phone (10) / citizen id (13) / e-wallet (15)
  account_name  text not null check (char_length(account_name) between 1 and 100),
  updated_at    timestamptz not null default now()
);

-- Suspend / ban history. profiles.status is the current effective state.
create table public.user_sanctions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        public.sanction_kind not null,
  reason      text not null,
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,                               -- null = indefinite
  lifted_at   timestamptz,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index user_sanctions_user_id_idx    on public.user_sanctions (user_id);
create index user_sanctions_created_by_idx on public.user_sanctions (created_by);

-- =============================================================================
-- Content: Series → Season → Episode → Page
-- =============================================================================

create table public.genres (
  id       smallint generated always as identity primary key,
  slug     text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name_th  text not null,
  name_en  text not null
);

create table public.series (
  id                         bigint generated always as identity primary key,
  uploader_id                uuid not null references public.profiles (id) on delete restrict,
  slug                       text not null unique check (slug ~ '^[a-z0-9-]{1,100}$'),
  title                      text not null check (char_length(title) between 1 and 200),
  synopsis                   text check (char_length(synopsis) <= 5000),
  cover_key                  text,                                   -- R2 object key
  age_rating                 public.age_rating not null default 'all',
  status                     public.series_status not null default 'ongoing',
  visibility                 public.series_visibility not null default 'draft',
  moderation_status          public.moderation_status not null default 'active',  -- server-managed
  default_reading_mode       public.reading_mode not null default 'vertical',
  default_reading_direction  public.reading_direction not null default 'ltr',
  published_at               timestamptz,                            -- first time made public
  last_episode_at            timestamptz,                            -- for "recently updated"
  deleted_at                 timestamptz,                            -- soft delete (triggers refunds server-side)
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create index series_uploader_id_idx on public.series (uploader_id);
create index series_public_latest_idx on public.series (last_episode_at desc)
  where visibility = 'published' and moderation_status = 'active' and deleted_at is null;
create index series_title_trgm_idx on public.series using gin (title extensions.gin_trgm_ops);

create table public.series_genres (
  series_id  bigint   not null references public.series (id) on delete cascade,
  genre_id   smallint not null references public.genres (id) on delete cascade,
  primary key (series_id, genre_id)
);
create index series_genres_genre_id_idx on public.series_genres (genre_id);

create table public.seasons (
  id          bigint generated always as identity primary key,
  series_id   bigint not null references public.series (id) on delete cascade,
  number      integer not null check (number > 0),
  title       text check (char_length(title) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (series_id, number),
  unique (id, series_id)               -- target for composite FK from episodes
);

create table public.episodes (
  id                bigint generated always as identity primary key,
  series_id         bigint not null references public.series (id) on delete cascade,
  season_id         bigint,
  number            integer not null check (number > 0),     -- order within the series
  title             text check (char_length(title) <= 200),
  price             integer not null default 0 check (price >= 0),   -- coins; 0 = free
  price_changed_at  timestamptz,                             -- price can change once per month after release
  publish_at        timestamptz,                             -- null = draft; future = scheduled
  page_count        integer not null default 0 check (page_count >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (series_id, number),
  unique (id, series_id),              -- target for composite FKs
  -- season must belong to the same series
  foreign key (season_id, series_id) references public.seasons (id, series_id) on delete set null (season_id)
);
create index episodes_season_id_idx on public.episodes (season_id, series_id);
create index episodes_publish_at_idx on public.episodes (publish_at) where publish_at is not null;

create table public.episode_pages (
  id           bigint generated always as identity primary key,
  episode_id   bigint not null references public.episodes (id) on delete cascade,
  page_number  integer not null check (page_number > 0),
  storage_key  text not null,          -- R2 object key; images are served via signed URLs
  width        integer check (width > 0),
  height       integer check (height > 0),
  created_at   timestamptz not null default now(),
  unique (episode_id, page_number)
);

-- Period where a series was closed for review. On close, the server extends
-- episode_unlocks.expires_at and uploader_earnings.available_at by the duration.
create table public.content_holds (
  id            bigint generated always as identity primary key,
  series_id     bigint not null references public.series (id) on delete cascade,
  reason        text not null,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  compensated_at timestamptz,          -- set when extensions were applied
  created_by    uuid references public.profiles (id) on delete set null,
  check (ended_at is null or ended_at >= started_at)
);
create index content_holds_series_id_idx  on public.content_holds (series_id);
create index content_holds_created_by_idx on public.content_holds (created_by);

-- =============================================================================
-- Reader features
-- =============================================================================

create table public.reading_preferences (
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  series_id  bigint not null references public.series (id) on delete cascade,
  mode       public.reading_mode not null,
  direction  public.reading_direction not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, series_id)
);
create index reading_preferences_series_id_idx on public.reading_preferences (series_id);

-- Last position per series ("continue reading"), synced across devices.
create table public.reading_progress (
  user_id      uuid   not null references public.profiles (id) on delete cascade,
  series_id    bigint not null references public.series (id) on delete cascade,
  episode_id   bigint not null,
  page_number  integer not null default 1 check (page_number > 0),
  updated_at   timestamptz not null default now(),
  primary key (user_id, series_id),
  foreign key (episode_id, series_id) references public.episodes (id, series_id) on delete cascade
);
create index reading_progress_user_recent_idx on public.reading_progress (user_id, updated_at desc);
create index reading_progress_episode_idx on public.reading_progress (episode_id, series_id);
create index reading_progress_series_id_idx on public.reading_progress (series_id);

create table public.bookshelf_entries (
  user_id     uuid   not null references public.profiles (id) on delete cascade,
  series_id   bigint not null references public.series (id) on delete cascade,
  status      public.bookshelf_status not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, series_id)
);
create index bookshelf_entries_user_status_idx on public.bookshelf_entries (user_id, status);
create index bookshelf_entries_series_id_idx   on public.bookshelf_entries (series_id);

-- Following = receive new-episode notifications; also the "followers" stat.
create table public.series_follows (
  user_id     uuid   not null references public.profiles (id) on delete cascade,
  series_id   bigint not null references public.series (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, series_id)
);
create index series_follows_series_id_idx on public.series_follows (series_id);

create table public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null check (type in ('new_episode', 'withdrawal_update', 'refund', 'moderation', 'system')),
  series_id   bigint references public.series (id) on delete cascade,
  episode_id  bigint references public.episodes (id) on delete cascade,
  payload     jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx  on public.notifications (user_id) where read_at is null;
create index notifications_series_id_idx    on public.notifications (series_id);
create index notifications_episode_id_idx   on public.notifications (episode_id);

-- Comments on a series (episode_id null) or an episode.
create table public.comments (
  id          bigint generated always as identity primary key,
  user_id     uuid   not null references public.profiles (id) on delete cascade,
  series_id   bigint not null references public.series (id) on delete cascade,
  episode_id  bigint,
  parent_id   bigint references public.comments (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  is_spoiler  boolean not null default false,
  hidden_at   timestamptz,                 -- hidden by admin (server-managed)
  deleted_at  timestamptz,                 -- soft-deleted by author
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (episode_id, series_id) references public.episodes (id, series_id) on delete cascade
);
create index comments_series_episode_created_idx on public.comments (series_id, episode_id, created_at desc);
create index comments_episode_idx   on public.comments (episode_id, series_id);
create index comments_user_id_idx   on public.comments (user_id);
create index comments_parent_id_idx on public.comments (parent_id);

-- Rating & review on a series (episode_id null) or an episode. One per user per target.
create table public.reviews (
  id          bigint generated always as identity primary key,
  user_id     uuid   not null references public.profiles (id) on delete cascade,
  series_id   bigint not null references public.series (id) on delete cascade,
  episode_id  bigint,
  rating      smallint not null check (rating between 1 and 5),
  body        text check (char_length(body) <= 5000),
  is_spoiler  boolean not null default false,
  hidden_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (episode_id, series_id) references public.episodes (id, series_id) on delete cascade,
  unique nulls not distinct (user_id, series_id, episode_id)
);
create index reviews_series_episode_idx on public.reviews (series_id, episode_id);
create index reviews_episode_idx on public.reviews (episode_id, series_id);

-- Daily view counters for stats & ranking (written by the server).
create table public.episode_view_daily (
  episode_id  bigint  not null,
  series_id   bigint  not null,
  view_date   date    not null,
  views       integer not null default 0 check (views >= 0),
  primary key (episode_id, view_date),
  foreign key (episode_id, series_id) references public.episodes (id, series_id) on delete cascade
);
create index episode_view_daily_date_series_idx on public.episode_view_daily (view_date, series_id);
create index episode_view_daily_episode_idx on public.episode_view_daily (episode_id, series_id);

-- =============================================================================
-- Coins & revenue (all writes by server / service_role only)
-- =============================================================================

create table public.coin_wallets (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  purchased_balance   integer not null default 0 check (purchased_balance >= 0),
  welcome_balance     integer not null default 0 check (welcome_balance >= 0),
  welcome_expires_at  timestamptz,
  welcome_granted_at  timestamptz,          -- guards against granting twice
  updated_at          timestamptz not null default now()
);

create table public.coin_packs (
  id            smallint generated always as identity primary key,
  coins         integer not null check (coins > 0),
  price_satang  integer not null check (price_satang > 0),   -- 1 THB = 100 satang
  is_active     boolean not null default true,
  sort_order    smallint not null default 0
);

create table public.coin_purchases (
  id                          bigint generated always as identity primary key,
  user_id                     uuid not null references public.profiles (id) on delete restrict,
  pack_id                     smallint not null references public.coin_packs (id) on delete restrict,
  coins                       integer not null check (coins > 0),          -- snapshot of the pack
  amount_satang               integer not null check (amount_satang > 0),  -- snapshot of the price
  status                      public.payment_status not null default 'pending',
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text unique,
  created_at                  timestamptz not null default now(),
  paid_at                     timestamptz
);
create index coin_purchases_user_created_idx on public.coin_purchases (user_id, created_at desc);
create index coin_purchases_pack_id_idx on public.coin_purchases (pack_id);

-- Unlocking an episode = 30 days of access. Price is a snapshot (later price
-- changes don't affect it). Purchased coins are spent before welcome coins.
create table public.episode_unlocks (
  id                    bigint generated always as identity primary key,
  user_id               uuid   not null references public.profiles (id) on delete restrict,
  episode_id            bigint not null,
  series_id             bigint not null,
  price                 integer not null check (price > 0),
  purchased_coins_used  integer not null check (purchased_coins_used >= 0),
  welcome_coins_used    integer not null check (welcome_coins_used >= 0),
  unlocked_at           timestamptz not null default now(),
  expires_at            timestamptz not null,
  refunded_at           timestamptz,
  check (purchased_coins_used + welcome_coins_used = price),
  check (expires_at > unlocked_at),
  foreign key (episode_id, series_id) references public.episodes (id, series_id) on delete restrict
);
create index episode_unlocks_access_idx on public.episode_unlocks (user_id, episode_id, expires_at desc);
create index episode_unlocks_episode_idx on public.episode_unlocks (episode_id, series_id);
create index episode_unlocks_series_active_idx on public.episode_unlocks (series_id, expires_at)
  where refunded_at is null;

-- Tip an uploader. Minimum 10, purchased coins only.
create table public.donations (
  id            bigint generated always as identity primary key,
  from_user_id  uuid not null references public.profiles (id) on delete restrict,
  to_user_id    uuid not null references public.profiles (id) on delete restrict,
  series_id     bigint references public.series (id) on delete set null,
  amount        integer not null check (amount >= 10),
  message       text check (char_length(message) <= 500),
  created_at    timestamptz not null default now(),
  refunded_at   timestamptz,
  check (from_user_id <> to_user_id)
);
create index donations_from_user_idx on public.donations (from_user_id, created_at desc);
create index donations_to_user_idx   on public.donations (to_user_id, created_at desc);
create index donations_series_id_idx on public.donations (series_id);

create table public.withdrawals (
  id             bigint generated always as identity primary key,
  uploader_id    uuid not null references public.profiles (id) on delete restrict,
  amount         integer not null check (amount >= 100),   -- coins = THB
  promptpay_id   text not null,                            -- snapshot at request time
  account_name   text not null,                            -- snapshot at request time
  status         public.withdrawal_status not null default 'pending',
  requested_at   timestamptz not null default now(),
  reviewed_by    uuid references public.profiles (id) on delete set null,
  reviewed_at    timestamptz,
  paid_at        timestamptz,
  transfer_ref   text,
  reject_reason  text
);
create index withdrawals_uploader_idx on public.withdrawals (uploader_id, requested_at desc);
create index withdrawals_pending_idx  on public.withdrawals (requested_at) where status = 'pending';
create index withdrawals_reviewed_by_idx on public.withdrawals (reviewed_by);

-- Uploader revenue, one row per unlock / donation (purchased coins only).
-- Withdrawable when status = 'pending' and available_at <= now().
create table public.uploader_earnings (
  id             bigint generated always as identity primary key,
  uploader_id    uuid not null references public.profiles (id) on delete restrict,
  source         public.earning_source not null,
  unlock_id      bigint unique references public.episode_unlocks (id) on delete restrict,
  donation_id    bigint unique references public.donations (id) on delete restrict,
  series_id      bigint references public.series (id) on delete set null,
  amount         integer not null check (amount > 0),
  created_at     timestamptz not null default now(),
  available_at   timestamptz not null,                     -- created_at + 30 days (+ hold extensions)
  status         public.earning_status not null default 'pending',
  withdrawal_id  bigint references public.withdrawals (id) on delete restrict,
  reversed_at    timestamptz,
  check (
    (source = 'unlock'   and unlock_id is not null and donation_id is null) or
    (source = 'donation' and donation_id is not null and unlock_id is null)
  ),
  check ((status = 'withdrawn') = (withdrawal_id is not null))
);
create index uploader_earnings_balance_idx on public.uploader_earnings (uploader_id, status, available_at);
create index uploader_earnings_series_id_idx on public.uploader_earnings (series_id);
create index uploader_earnings_withdrawal_id_idx on public.uploader_earnings (withdrawal_id);

-- Append-only coin movements, for auditing every balance change.
create table public.coin_ledger (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  kind         public.coin_kind not null,
  delta        integer not null check (delta <> 0),
  reason       public.coin_ledger_reason not null,
  purchase_id  bigint references public.coin_purchases (id) on delete restrict,
  unlock_id    bigint references public.episode_unlocks (id) on delete restrict,
  donation_id  bigint references public.donations (id) on delete restrict,
  note         text,
  created_at   timestamptz not null default now()
);
create index coin_ledger_user_created_idx on public.coin_ledger (user_id, created_at desc);
create index coin_ledger_purchase_id_idx  on public.coin_ledger (purchase_id);
create index coin_ledger_unlock_id_idx    on public.coin_ledger (unlock_id);
create index coin_ledger_donation_id_idx  on public.coin_ledger (donation_id);

-- =============================================================================
-- Reports
-- =============================================================================

create table public.reports (
  id               bigint generated always as identity primary key,
  reporter_id      uuid not null references public.profiles (id) on delete cascade,
  target_type      public.report_target not null,
  series_id        bigint references public.series (id) on delete cascade,
  comment_id       bigint references public.comments (id) on delete cascade,
  review_id        bigint references public.reviews (id) on delete cascade,
  target_user_id   uuid references public.profiles (id) on delete cascade,
  reason           public.report_reason not null,
  details          text check (char_length(details) <= 2000),
  status           public.report_status not null default 'open',
  resolved_by      uuid references public.profiles (id) on delete set null,
  resolved_at      timestamptz,
  resolution_note  text,
  created_at       timestamptz not null default now(),
  check (num_nonnulls(series_id, comment_id, review_id, target_user_id) = 1),
  check (
    (target_type = 'series'  and series_id is not null
       and reason in ('copyright', 'inappropriate', 'wrong_age_rating', 'spam')) or
    (target_type = 'comment' and comment_id is not null
       and reason in ('spam', 'abusive', 'unhidden_spoiler')) or
    (target_type = 'review'  and review_id is not null
       and reason in ('spam', 'abusive', 'unhidden_spoiler')) or
    (target_type = 'user'    and target_user_id is not null
       and reason in ('fake_account', 'impersonation'))
  )
);
create index reports_open_idx         on public.reports (created_at) where status = 'open';
create index reports_reporter_id_idx  on public.reports (reporter_id);
create index reports_series_id_idx    on public.reports (series_id);
create index reports_comment_id_idx   on public.reports (comment_id);
create index reports_review_id_idx    on public.reports (review_id);
create index reports_target_user_idx  on public.reports (target_user_id);
create index reports_resolved_by_idx  on public.reports (resolved_by);

-- =============================================================================
-- updated_at triggers
-- =============================================================================
create trigger set_updated_at before update on public.profiles            for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.user_private_info   for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.payout_accounts     for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.series              for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.seasons             for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.episodes            for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.reading_preferences for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.reading_progress    for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.bookshelf_entries   for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.comments            for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.reviews             for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.coin_wallets        for each row execute function private.set_updated_at();

-- =============================================================================
-- Business-rule triggers
-- =============================================================================

-- Episode price may change at most once per month after the episode is released.
create function private.enforce_episode_price_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.price is distinct from old.price
     and old.publish_at is not null and old.publish_at <= now() then
    if old.price_changed_at is not null and old.price_changed_at > now() - interval '1 month' then
      raise exception 'Episode price can only be changed once per month (last change: %)', old.price_changed_at
        using errcode = 'check_violation';
    end if;
    new.price_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger enforce_price_change before update of price on public.episodes
  for each row execute function private.enforce_episode_price_change();

-- New auth user → profile + empty wallet (+ welcome coins if email already confirmed).
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.user_private_info (user_id) values (new.id);
  insert into public.coin_wallets (user_id) values (new.id);
  if new.email_confirmed_at is not null then
    perform private.grant_welcome_coins(new.id);
  end if;
  return new;
end;
$$;

-- Welcome coins: 5 coins on email confirmation, valid for 7 days, granted once.
create function private.grant_welcome_coins(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_granted boolean;
begin
  update public.coin_wallets
     set welcome_balance    = 5,
         welcome_expires_at = now() + interval '7 days',
         welcome_granted_at = now()
   where user_id = p_user_id
     and welcome_granted_at is null
  returning true into v_granted;

  if v_granted then
    insert into public.coin_ledger (user_id, kind, delta, reason)
    values (p_user_id, 'welcome', 5, 'welcome_grant');
  end if;
end;
$$;

create function private.handle_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform private.grant_welcome_coins(new.id);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger on_auth_user_email_confirmed after update of email_confirmed_at on auth.users
  for each row execute function private.handle_email_confirmed();

-- Internal-only functions: nobody calls these directly.
revoke execute on function private.set_updated_at()                  from public, anon, authenticated;
revoke execute on function private.enforce_episode_price_change()    from public, anon, authenticated;
revoke execute on function private.handle_new_user()                 from public, anon, authenticated;
revoke execute on function private.handle_email_confirmed()          from public, anon, authenticated;
revoke execute on function private.grant_welcome_coins(uuid)         from public, anon, authenticated;

-- =============================================================================
-- RLS helper functions (security invoker; used inside policies)
-- =============================================================================

-- Current user is signed in and not suspended/banned.
create function private.is_active_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and status = 'active'
  );
$$;

-- Current user owns the series.
create function private.owns_series(p_series_id bigint)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.series
    where id = p_series_id and uploader_id = (select auth.uid())
  );
$$;

-- Current user's age (from their own private info) satisfies the rating.
create function private.meets_age_rating(p_rating public.age_rating)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case p_rating
    when 'all' then true
    else coalesce((
      select age(current_date, birth_date) >= case p_rating when 'teen' then interval '13 years'
                                                            else interval '18 years' end
      from public.user_private_info
      where user_id = (select auth.uid())
    ), false)
  end;
$$;

-- Current user may read the pages of an episode:
-- owner, or (released + public + age ok + (free or active unlock)).
create function private.can_read_episode(p_episode_id bigint)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.episodes e
    join public.series s on s.id = e.series_id
    where e.id = p_episode_id
      and (
        s.uploader_id = (select auth.uid())
        or (
          e.publish_at <= now()
          and s.visibility = 'published'
          and s.moderation_status = 'active'
          and s.deleted_at is null
          and private.meets_age_rating(s.age_rating)
          and (
            e.price = 0
            or exists (
              select 1 from public.episode_unlocks u
              where u.episode_id = e.id
                and u.user_id = (select auth.uid())
                and u.refunded_at is null
                and u.expires_at > now()
            )
          )
        )
      )
  );
$$;

revoke execute on function private.is_active_user()                    from public;
revoke execute on function private.owns_series(bigint)                 from public;
revoke execute on function private.meets_age_rating(public.age_rating) from public;
revoke execute on function private.can_read_episode(bigint)            from public;
grant execute on function private.is_active_user()                    to authenticated, service_role;
grant execute on function private.owns_series(bigint)                 to anon, authenticated, service_role;
grant execute on function private.meets_age_rating(public.age_rating) to anon, authenticated, service_role;
grant execute on function private.can_read_episode(bigint)            to anon, authenticated, service_role;

-- =============================================================================
-- Grants: start from nothing, then grant the minimum per table.
-- service_role bypasses RLS and keeps full access for server-side logic.
-- =============================================================================
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Public catalog (read-only for everyone)
grant select on public.genres, public.coin_packs, public.series_genres, public.seasons,
                public.episodes, public.series, public.profiles, public.comments,
                public.reviews, public.episode_view_daily, public.episode_pages
  to anon, authenticated;

-- Profiles: users edit only their own presentational fields
grant update (username, display_name, avatar_key, bio) on public.profiles to authenticated;

-- Owner-only personal data
grant select, insert, update on public.user_private_info to authenticated;
grant select, insert, update, delete on public.payout_accounts to authenticated;

-- Uploader content management
grant insert (uploader_id, slug, title, synopsis, cover_key, age_rating, status, visibility,
              default_reading_mode, default_reading_direction)
  on public.series to authenticated;
grant update (slug, title, synopsis, cover_key, age_rating, status, visibility,
              default_reading_mode, default_reading_direction)
  on public.series to authenticated;
grant insert, delete on public.series_genres to authenticated;
grant insert, update (number, title), delete on public.seasons to authenticated;
grant insert (series_id, season_id, number, title, price, publish_at) on public.episodes to authenticated;
grant update (season_id, number, title, price, publish_at)            on public.episodes to authenticated;
grant delete on public.episodes to authenticated;
grant insert, update (page_number, storage_key, width, height), delete on public.episode_pages to authenticated;
grant select on public.content_holds to authenticated;

-- Reader personal data
grant select, insert, update, delete on public.reading_preferences to authenticated;
grant select, insert, update, delete on public.reading_progress    to authenticated;
grant select, insert, update, delete on public.bookshelf_entries   to authenticated;
grant select, insert, delete         on public.series_follows      to authenticated;
grant update (read_at), delete       on public.notifications       to authenticated;
grant select                         on public.notifications       to authenticated;

-- Social
grant insert (user_id, series_id, episode_id, parent_id, body, is_spoiler) on public.comments to authenticated;
grant update (body, is_spoiler, deleted_at)                                on public.comments to authenticated;
grant insert (user_id, series_id, episode_id, rating, body, is_spoiler)    on public.reviews  to authenticated;
grant update (rating, body, is_spoiler)                                    on public.reviews  to authenticated;
grant delete on public.reviews to authenticated;
grant select, insert (reporter_id, target_type, series_id, comment_id, review_id, target_user_id, reason, details)
  on public.reports to authenticated;

-- Money: read-only, own rows
grant select on public.coin_wallets, public.coin_ledger, public.coin_purchases,
                public.episode_unlocks, public.donations, public.uploader_earnings,
                public.withdrawals, public.user_sanctions
  to authenticated;

-- private.can_read_episode() / meets_age_rating() read these tables while
-- evaluating policies for anon too. anon has no RLS policy on them, so it
-- still sees zero rows — the grant only avoids "permission denied".
grant select on public.episode_unlocks, public.user_private_info to anon;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles            enable row level security;
alter table public.user_private_info   enable row level security;
alter table public.payout_accounts     enable row level security;
alter table public.user_sanctions      enable row level security;
alter table public.genres              enable row level security;
alter table public.series              enable row level security;
alter table public.series_genres       enable row level security;
alter table public.seasons             enable row level security;
alter table public.episodes            enable row level security;
alter table public.episode_pages       enable row level security;
alter table public.content_holds       enable row level security;
alter table public.reading_preferences enable row level security;
alter table public.reading_progress    enable row level security;
alter table public.bookshelf_entries   enable row level security;
alter table public.series_follows      enable row level security;
alter table public.notifications       enable row level security;
alter table public.comments            enable row level security;
alter table public.reviews             enable row level security;
alter table public.episode_view_daily  enable row level security;
alter table public.coin_wallets        enable row level security;
alter table public.coin_packs          enable row level security;
alter table public.coin_purchases      enable row level security;
alter table public.episode_unlocks     enable row level security;
alter table public.donations           enable row level security;
alter table public.withdrawals         enable row level security;
alter table public.uploader_earnings   enable row level security;
alter table public.coin_ledger         enable row level security;
alter table public.reports             enable row level security;

-- ---- profiles ---------------------------------------------------------------
create policy "profiles: public read" on public.profiles
  for select to anon, authenticated using (status <> 'banned' or id = (select auth.uid()));
create policy "profiles: owner update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---- user_private_info / payout_accounts (owner only) ------------------------
create policy "user_private_info: owner select" on public.user_private_info
  for select to authenticated using (user_id = (select auth.uid()));
create policy "user_private_info: owner insert" on public.user_private_info
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "user_private_info: owner update" on public.user_private_info
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "payout_accounts: owner select" on public.payout_accounts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "payout_accounts: owner insert" on public.payout_accounts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "payout_accounts: owner update" on public.payout_accounts
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "payout_accounts: owner delete" on public.payout_accounts
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---- user_sanctions (own history) ------------------------------------------
create policy "user_sanctions: owner select" on public.user_sanctions
  for select to authenticated using (user_id = (select auth.uid()));

-- ---- catalog -----------------------------------------------------------------
create policy "genres: public read" on public.genres
  for select to anon, authenticated using (true);
create policy "coin_packs: public read active" on public.coin_packs
  for select to anon, authenticated using (is_active);

-- ---- series ------------------------------------------------------------------
create policy "series: public read" on public.series
  for select to anon, authenticated
  using (
    (visibility = 'published' and moderation_status = 'active' and deleted_at is null)
    or uploader_id = (select auth.uid())
  );
create policy "series: uploader insert" on public.series
  for insert to authenticated
  with check (uploader_id = (select auth.uid()) and (select private.is_active_user()));
create policy "series: uploader update" on public.series
  for update to authenticated
  using (uploader_id = (select auth.uid()) and deleted_at is null)
  with check (uploader_id = (select auth.uid()) and (select private.is_active_user()));

-- ---- series_genres -------------------------------------------------------------
create policy "series_genres: public read" on public.series_genres
  for select to anon, authenticated using (true);   -- series row itself is still RLS-filtered
create policy "series_genres: uploader insert" on public.series_genres
  for insert to authenticated with check (private.owns_series(series_id));
create policy "series_genres: uploader delete" on public.series_genres
  for delete to authenticated using (private.owns_series(series_id));

-- ---- seasons -------------------------------------------------------------------
create policy "seasons: read if series visible" on public.seasons
  for select to anon, authenticated
  using (exists (select 1 from public.series s where s.id = series_id));  -- series RLS applies
create policy "seasons: uploader insert" on public.seasons
  for insert to authenticated with check (private.owns_series(series_id));
create policy "seasons: uploader update" on public.seasons
  for update to authenticated
  using (private.owns_series(series_id)) with check (private.owns_series(series_id));
create policy "seasons: uploader delete" on public.seasons
  for delete to authenticated using (private.owns_series(series_id));

-- ---- episodes ------------------------------------------------------------------
create policy "episodes: read released or own" on public.episodes
  for select to anon, authenticated
  using (
    (publish_at <= now() and exists (select 1 from public.series s where s.id = series_id))
    or private.owns_series(series_id)
  );
create policy "episodes: uploader insert" on public.episodes
  for insert to authenticated
  with check (private.owns_series(series_id) and (select private.is_active_user()));
create policy "episodes: uploader update" on public.episodes
  for update to authenticated
  using (private.owns_series(series_id))
  with check (private.owns_series(series_id) and (select private.is_active_user()));
-- Released episodes are removed by the server (refund flow); drafts can be deleted directly.
create policy "episodes: uploader delete unreleased" on public.episodes
  for delete to authenticated
  using (private.owns_series(series_id) and (publish_at is null or publish_at > now()));

-- ---- episode_pages -------------------------------------------------------------
create policy "episode_pages: read with access" on public.episode_pages
  for select to anon, authenticated using (private.can_read_episode(episode_id));
create policy "episode_pages: uploader insert" on public.episode_pages
  for insert to authenticated
  with check (exists (select 1 from public.episodes e where e.id = episode_id and private.owns_series(e.series_id)));
create policy "episode_pages: uploader update" on public.episode_pages
  for update to authenticated
  using (exists (select 1 from public.episodes e where e.id = episode_id and private.owns_series(e.series_id)))
  with check (exists (select 1 from public.episodes e where e.id = episode_id and private.owns_series(e.series_id)));
create policy "episode_pages: uploader delete" on public.episode_pages
  for delete to authenticated
  using (exists (select 1 from public.episodes e where e.id = episode_id and private.owns_series(e.series_id)));

-- ---- content_holds (uploader sees holds on own series) ----------------------
create policy "content_holds: uploader select" on public.content_holds
  for select to authenticated using (private.owns_series(series_id));

-- ---- reader personal tables -----------------------------------------------------
create policy "reading_preferences: owner all" on public.reading_preferences
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "reading_progress: owner all" on public.reading_progress
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "bookshelf_entries: owner all" on public.bookshelf_entries
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "series_follows: owner select" on public.series_follows
  for select to authenticated using (user_id = (select auth.uid()));
create policy "series_follows: owner insert" on public.series_follows
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "series_follows: owner delete" on public.series_follows
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "notifications: owner select" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications: owner update" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notifications: owner delete" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---- comments ------------------------------------------------------------------
create policy "comments: public read visible" on public.comments
  for select to anon, authenticated
  using (
    (hidden_at is null and deleted_at is null
      and exists (select 1 from public.series s where s.id = series_id))
    or user_id = (select auth.uid())
  );
create policy "comments: author insert" on public.comments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_active_user())
    and exists (select 1 from public.series s where s.id = series_id)
  );
create policy "comments: author update" on public.comments
  for update to authenticated
  using (user_id = (select auth.uid()) and hidden_at is null)
  with check (user_id = (select auth.uid()) and (select private.is_active_user()));

-- ---- reviews -------------------------------------------------------------------
create policy "reviews: public read visible" on public.reviews
  for select to anon, authenticated
  using (
    (hidden_at is null and exists (select 1 from public.series s where s.id = series_id))
    or user_id = (select auth.uid())
  );
create policy "reviews: author insert" on public.reviews
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_active_user())
    and exists (select 1 from public.series s where s.id = series_id)
  );
create policy "reviews: author update" on public.reviews
  for update to authenticated
  using (user_id = (select auth.uid()) and hidden_at is null)
  with check (user_id = (select auth.uid()) and (select private.is_active_user()));
create policy "reviews: author delete" on public.reviews
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---- reports -------------------------------------------------------------------
create policy "reports: reporter select" on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()));
create policy "reports: reporter insert" on public.reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()) and (select private.is_active_user()));

-- ---- stats -------------------------------------------------------------------
create policy "episode_view_daily: public read" on public.episode_view_daily
  for select to anon, authenticated using (true);

-- ---- money (read own) ------------------------------------------------------------
create policy "coin_wallets: owner select" on public.coin_wallets
  for select to authenticated using (user_id = (select auth.uid()));
create policy "coin_ledger: owner select" on public.coin_ledger
  for select to authenticated using (user_id = (select auth.uid()));
create policy "coin_purchases: owner select" on public.coin_purchases
  for select to authenticated using (user_id = (select auth.uid()));
create policy "episode_unlocks: owner select" on public.episode_unlocks
  for select to authenticated using (user_id = (select auth.uid()));
create policy "donations: sender or recipient select" on public.donations
  for select to authenticated
  using (from_user_id = (select auth.uid()) or to_user_id = (select auth.uid()));
create policy "uploader_earnings: owner select" on public.uploader_earnings
  for select to authenticated using (uploader_id = (select auth.uid()));
create policy "withdrawals: owner select" on public.withdrawals
  for select to authenticated using (uploader_id = (select auth.uid()));

-- =============================================================================
-- Seed: coin packs & genres
-- =============================================================================
insert into public.coin_packs (coins, price_satang, sort_order) values
  (50,  6400,  1),
  (100, 12100, 2),
  (200, 22700, 3);

insert into public.genres (slug, name_th, name_en) values
  ('action',        'แอ็กชัน',        'Action'),
  ('adventure',     'ผจญภัย',         'Adventure'),
  ('comedy',        'ตลก',            'Comedy'),
  ('drama',         'ดราม่า',          'Drama'),
  ('fantasy',       'แฟนตาซี',        'Fantasy'),
  ('horror',        'สยองขวัญ',       'Horror'),
  ('mystery',       'ลึกลับ',          'Mystery'),
  ('romance',       'โรแมนซ์',        'Romance'),
  ('sci-fi',        'ไซไฟ',           'Sci-Fi'),
  ('slice-of-life', 'ชีวิตประจำวัน',   'Slice of Life'),
  ('sports',        'กีฬา',           'Sports'),
  ('thriller',      'ระทึกขวัญ',       'Thriller'),
  ('isekai',        'ต่างโลก',         'Isekai'),
  ('boys-love',     'วาย (BL)',       'Boys'' Love'),
  ('girls-love',    'ยูริ (GL)',       'Girls'' Love');
