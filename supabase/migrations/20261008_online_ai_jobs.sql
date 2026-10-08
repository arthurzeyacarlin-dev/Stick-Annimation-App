-- Online beta: shared AI job state (AI Animator, Assistant, dictation cancellation).
-- On Vercel a status check or Cancel can reach a different server copy than the one doing the work,
-- so every copy reads and writes the job here. Server only: the app connects with DATABASE_URL;
-- browsers (anon / authenticated roles) get no access at all.
--
-- Stored per job: who owns it, which project / chat / dictation it belongs to, whether it is still
-- running, a "please stop" flag, and the same status snapshot the browser already receives
-- (stages, final reply, error). The request text itself is NOT stored (only a sha-256 hash of it).
-- Rows older than a day are removed by the app.

create table if not exists public.diamond_ai_jobs (
  kind text not null check (kind in ('ai-animator', 'assistant', 'dictation')),
  job_id text not null check (char_length(job_id) between 1 and 200),
  owner_id text not null check (char_length(owner_id) between 1 and 200),
  scope_id text not null check (char_length(scope_id) between 1 and 200),
  fingerprint text check (fingerprint is null or fingerprint ~ '^[0-9a-f]{64}$'),
  active boolean not null,
  cancel_requested boolean not null default false,
  snapshot jsonb check (snapshot is null or pg_column_size(snapshot) <= 1048576),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (kind, job_id)
);

create index if not exists diamond_ai_jobs_owner_active_idx
  on public.diamond_ai_jobs (kind, owner_id, created_at) where active;
create index if not exists diamond_ai_jobs_created_idx
  on public.diamond_ai_jobs (created_at);

alter table public.diamond_ai_jobs enable row level security;
-- No policies on purpose: the browser roles can do nothing. The server connects as the table owner
-- (DATABASE_URL), which row level security does not limit (it is not FORCEd).
revoke all on table public.diamond_ai_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.diamond_ai_jobs to service_role;

comment on table public.diamond_ai_jobs is
  'Diamond Animator online: shared AI job status across serverless instances. Server-only (RLS on, no policies).';
