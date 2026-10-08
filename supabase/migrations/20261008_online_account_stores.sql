-- Online beta (2026-10-08): the small per-account stores that live in local
-- SQLite files when DATABASE_URL is absent.
--   diamond_account_state_v1        <- .local/spec0015-phase3/account-data.sqlite (account_state_v1)
--   diamond_account_usage_events_v1 <- .local/spec0015-phase3/account-usage.sqlite (account_usage_events_v1)
--   diamond_account_usage_gaps_v1   <- .local/spec0015-phase3/account-usage.sqlite.coverage-gaps
-- Server-only: the Next.js server reaches them through DATABASE_URL. Row level
-- security is on with no policies and the browser roles have no grants, so the
-- public anon/authenticated API can never read or write them. Ownership is the
-- better-auth user id that the server takes from the verified session.

-- Account data (assistant sessions, notifications, ledgers, recovery, preferences).
create table public.diamond_account_state_v1 (
  owner_id text not null check (length(owner_id) between 1 and 256),
  namespace text not null check (namespace in (
    'assistant-sessions', 'notifications', 'terra-ledger', 'terra-pending', 'recovery', 'preferences'
  )),
  record_key text not null check (record_key ~ '^[A-Za-z0-9._~%-]{1,512}$'),
  revision integer not null check (revision >= 1),
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null,
  payload bytea not null check (octet_length(payload) <= 146800640),
  primary key (owner_id, namespace, record_key)
);

create index diamond_account_state_v1_owner_updated_idx
  on public.diamond_account_state_v1 (owner_id, updated_at);

-- Per-account AI usage events (written on every AI call; Dashboard reads 8 weeks).
create table public.diamond_account_usage_events_v1 (
  owner_id text not null check (length(owner_id) between 1 and 256),
  event_id text not null check (event_id ~ '^[0-9a-f]{64}$'),
  attempt_id text not null check (attempt_id ~ '^[0-9a-f]{64}$'),
  recorded_at bigint not null check (recorded_at >= 0),
  event_json jsonb not null check (jsonb_typeof(event_json) = 'object'),
  primary key (owner_id, event_id)
);

create index diamond_account_usage_events_v1_owner_time_idx
  on public.diamond_account_usage_events_v1 (owner_id, recorded_at desc);

-- Accounts whose usage record has a known hole (a failed write), so the
-- Dashboard says "partial" instead of claiming zero.
create table public.diamond_account_usage_gaps_v1 (
  owner_id text primary key check (length(owner_id) between 1 and 256),
  first_marked_at timestamptz not null default now(),
  last_marked_at timestamptz not null default now()
);

alter table public.diamond_account_state_v1 enable row level security;
alter table public.diamond_account_usage_events_v1 enable row level security;
alter table public.diamond_account_usage_gaps_v1 enable row level security;

revoke all on public.diamond_account_state_v1 from public, anon, authenticated;
revoke all on public.diamond_account_usage_events_v1 from public, anon, authenticated;
revoke all on public.diamond_account_usage_gaps_v1 from public, anon, authenticated;

grant select, insert, update, delete on public.diamond_account_state_v1 to service_role;
grant select, insert on public.diamond_account_usage_events_v1 to service_role;
grant select, insert, update on public.diamond_account_usage_gaps_v1 to service_role;
