-- Online beta (2026-10-08): the private Storage bucket for account project bundles.
-- Tables diamond_p4u_heads / diamond_p4u_versions (RLS on, service_role only) come from
-- 20260929124642_spec0015_phase4_account_projects.sql; apply that first on a fresh project.
-- On the old project this bucket was created through the Storage API with the same settings.
--
-- How it is used: the browser uploads gzipped bundle parts (each <= 5 MiB) with a signed
-- upload URL the server creates after checking the owner, and downloads with signed
-- download URLs. The server re-downloads and verifies every part before committing.
--
-- No storage.objects policies on purpose: with RLS on and no policy, anon/authenticated
-- keys cannot list, read or write this bucket; only the service role (server) and
-- per-object signed URLs can.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('diamond-p4u-content', 'diamond-p4u-content', false, 5242880, array['application/octet-stream'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
