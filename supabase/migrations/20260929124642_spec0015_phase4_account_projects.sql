-- SPEC-0015 Phase 4: isolated account project metadata. The private Storage
-- bucket is created through the Storage API after this migration is reviewed.
create table public.diamond_p4u_heads (
  project_id uuid primary key,
  owner_id text not null check (length(owner_id) between 1 and 256),
  title text not null check (octet_length(title) between 1 and 512),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  active_revision bigint not null check (active_revision >= 1),
  project_digest text not null check (project_digest ~ '^[0-9a-f]{64}$'),
  stored_byte_length bigint not null check (stored_byte_length between 0 and 140000000),
  provenance jsonb,
  deleted_at timestamptz
);

create index diamond_p4u_heads_owner_list_idx
  on public.diamond_p4u_heads (owner_id, updated_at desc)
  where deleted_at is null;

create table public.diamond_p4u_versions (
  project_id uuid not null,
  owner_id text not null check (length(owner_id) between 1 and 256),
  revision bigint not null check (revision >= 1),
  project_digest text not null check (project_digest ~ '^[0-9a-f]{64}$'),
  bundle_sha256 text not null check (bundle_sha256 ~ '^[0-9a-f]{64}$'),
  raw_byte_length bigint not null check (raw_byte_length between 1 and 140000000),
  compressed_byte_length bigint not null check (compressed_byte_length between 1 and 140000000),
  part_paths jsonb not null check (jsonb_typeof(part_paths) = 'array' and jsonb_array_length(part_paths) between 1 and 32),
  created_at timestamptz not null default now(),
  primary key (project_id, revision, project_digest)
);

create index diamond_p4u_versions_owner_read_idx
  on public.diamond_p4u_versions (owner_id, project_id, revision desc);

alter table public.diamond_p4u_heads enable row level security;
alter table public.diamond_p4u_versions enable row level security;

revoke all on public.diamond_p4u_heads from public, anon, authenticated;
revoke all on public.diamond_p4u_versions from public, anon, authenticated;
grant select, insert, update on public.diamond_p4u_heads to service_role;
grant select, insert on public.diamond_p4u_versions to service_role;
