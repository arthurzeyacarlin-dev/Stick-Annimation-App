import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createNativeUnifiedProjectV2 } from "../../../src/lib/animation/unifiedWorkspaceFactoryV2.ts";
import { packAccountProject, unpackAccountProject } from "../../../src/lib/account/projectBundle.ts";

const migration = fs.readFileSync("supabase/migrations/20260929124642_spec0015_phase4_account_projects.sql", "utf8");
for (const table of ["diamond_p4u_heads", "diamond_p4u_versions"]) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security;`));
  assert.match(migration, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated;`));
}
assert.match(migration, /stored_byte_length between 0 and 140000000/);
assert.doesNotMatch(migration, /storage\.(?:buckets|objects)/);

const project = createNativeUnifiedProjectV2();
const { body } = await packAccountProject(project);
const original = new Uint8Array(await body.arrayBuffer());
const shortened = original.subarray(0, original.byteLength - 1);
await assert.rejects(unpackAccountProject(shortened));
const tampered = original.slice();
tampered[tampered.byteLength - 1] ^= 1;
await assert.rejects(unpackAccountProject(tampered));

for (const route of ["app/api/account/projects/route.ts", "app/api/account/projects/[projectId]/route.ts"]) {
  const source = fs.readFileSync(route, "utf8");
  assert.match(source, /requireAccountRequest\(request\)/);
  assert.match(source, /x-account-owner/);
  assert.match(source, /access\.session\.user\.id/);
}

// Online beta: logic lives in projectStorageCore.ts (projectServer.ts only wires the service-role client).
const server = fs.readFileSync("src/lib/account/projectStorageCore.ts", "utf8");
assert.match(fs.readFileSync("src/lib/account/projectServer.ts", "utf8"), /^import "server-only";/);
assert.match(server, /\.eq\("owner_id", ownerId\)/);
assert.match(server, /ACCOUNT_PROJECT_PART_BYTES = 5 \* 1024 \* 1024/);
assert.match(server, /await readVerifiedBundle\(ownerId, stored\)/);
assert.match(server, /await readVerifiedBundle\(ownerId, stored, "account_project_upload_invalid"\)/);
assert.match(server, /accountProjectHeadReceipt\(ownerId, project\.projectId\)/);

let projectServerCalls = 0;
const projectServer = {
  listAccountProjectHeads: async () => { projectServerCalls++; return []; },
  prepareAccountProjectUpload: async () => { projectServerCalls++; return { status: "stored" }; },
  commitAccountProjectUpload: async ownerId => { projectServerCalls++; return { ownerId, projectId: "test", revision: 1, projectDigest: "a".repeat(64), storedByteLength: 1 }; },
  accountProjectHeadReceipt: async ownerId => { projectServerCalls++; return { ownerId, projectId: "test", revision: 1, projectDigest: "a".repeat(64), storedByteLength: 1 }; },
  accountProjectDownload: async () => { projectServerCalls++; return { receipt: null, download: null }; },
  parseAccountProjectUploadBody: body => ({ action: body.action, input: body }),
  accountProjectErrorStatus: () => 503,
  deleteAccountProject: async () => { projectServerCalls++; return { projectId: "test", deletedAssetIds: [] }; },
};
const loadRoute = file => {
  const source = fs.readFileSync(file, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandboxModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: sandboxModule, exports: sandboxModule.exports, Request, Response, URL, Uint8Array,
    require: id => {
      if (id === "next/server") return { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } };
      if (id === "@/src/lib/account/access") return { requireAccountRequest: async () => ({ session: { user: { id: "owner-B" } } }) };
      if (id === "@/src/lib/account/projectServer") return projectServer;
      throw new Error(`Unexpected route import: ${id}`);
    },
  }, { filename: file });
  return sandboxModule.exports;
};
const collectionRoute = loadRoute("app/api/account/projects/route.ts");
const projectRoute = loadRoute("app/api/account/projects/[projectId]/route.ts");
const makeRequest = (path, method, owner) => new Request(`http://127.0.0.1:58584${path}`, {
  method,
  headers: {
    ...(owner ? { "X-Account-Owner": owner } : {}),
    ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    ...(method === "DELETE" ? { "Content-Type": "application/json" } : {}),
  },
  ...(method === "POST" ? { body: JSON.stringify({ action: "prepare" }) } : {}),
  ...(method === "DELETE" ? { body: JSON.stringify({ expectedRevision: 1, expectedDigest: "a".repeat(64) }) } : {}),
  ...(method === "POST" ? { duplex: "half" } : {}),
});
const context = { params: Promise.resolve({ projectId: "test" }) };
for (const owner of [undefined, "owner-A"]) {
  const before = projectServerCalls;
  assert.equal((await collectionRoute.GET(makeRequest("/api/account/projects", "GET", owner))).status, 403);
  assert.equal((await collectionRoute.POST(makeRequest("/api/account/projects", "POST", owner))).status, 403);
  assert.equal((await projectRoute.GET(makeRequest("/api/account/projects/test?head=1", "GET", owner), context)).status, 403);
  assert.equal((await projectRoute.DELETE(makeRequest("/api/account/projects/test", "DELETE", owner), context)).status, 403);
  assert.equal(projectServerCalls, before, "A stale or absent owner header must not reach storage");
}
assert.equal((await collectionRoute.GET(makeRequest("/api/account/projects", "GET", "owner-B"))).status, 200);
assert.equal((await collectionRoute.POST(makeRequest("/api/account/projects", "POST", "owner-B"))).status, 200);
assert.equal((await projectRoute.GET(makeRequest("/api/account/projects/test?head=1", "GET", "owner-B"), context)).status, 200);
assert.equal((await projectRoute.DELETE(makeRequest("/api/account/projects/test", "DELETE", "owner-B"), context)).status, 200);
assert.equal(projectServerCalls, 4);
// Online beta: the bundle never comes through the app server; a raw bundle POST is refused.
const rawPost = new Request("http://127.0.0.1:58584/api/account/projects", {
  method: "POST", headers: { "X-Account-Owner": "owner-B", "Content-Type": "application/octet-stream" },
  body: new Uint8Array([1, 2, 3, 4, 5]), duplex: "half",
});
assert.equal((await collectionRoute.POST(rawPost)).status, 400);
assert.equal(projectServerCalls, 4);

if (process.argv.includes("--create-private-bucket")) {
  const { loadEnvConfig } = (await import("@next/env")).default;
  const { createClient } = await import("@supabase/supabase-js");
  loadEnvConfig("/Users/arthurcarlin/Projects/stick-animation-app");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && key && new URL(url).hostname.split(".")[0] === "mmdahcvzklypntddbmmh", "Supabase target mismatch.");
  const client = createClient(url, key, { auth: { persistSession: false } });
  const before = await client.storage.listBuckets();
  if (before.error) throw before.error;
  assert.ok(!before.data.some(bucket => bucket.id === "diamond-p4u-content"), "Candidate bucket is no longer absent.");
  const created = await client.storage.createBucket("diamond-p4u-content", {
    public: false,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["application/octet-stream"],
  });
  if (created.error) throw created.error;
  const after = await client.storage.getBucket("diamond-p4u-content");
  if (after.error) throw after.error;
  assert.equal(after.data.public, false);
  assert.equal(after.data.file_size_limit, 5 * 1024 * 1024);
  process.stdout.write(JSON.stringify({ createdPrivateBucket: after.data.id, public: after.data.public, fileSizeLimit: after.data.file_size_limit }) + "\n");
}

if (process.argv.includes("--cleanup-synthetic")) {
  const marker = process.argv.indexOf("--cleanup-synthetic");
  const owners = process.argv.slice(marker + 1);
  const approvedEmails = new Set([
    "phase4-alpha-20260929@example.invalid",
    "phase4-beta-20260929@example.invalid",
    "phase4-twelve-20260930@example.invalid",
  ]);
  assert.ok(owners.length >= 1 && owners.length <= 2 && owners.every(owner => /^[a-zA-Z0-9_-]{1,256}$/.test(owner)), "Exact synthetic owner IDs required.");
  assert.equal(new Set(owners).size, owners.length);
  const { loadEnvConfig } = (await import("@next/env")).default;
  const { createClient } = await import("@supabase/supabase-js");
  const { default: Database } = await import("better-sqlite3");
  loadEnvConfig("/Users/arthurcarlin/Projects/stick-animation-app");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && key && new URL(url).hostname.split(".")[0] === "mmdahcvzklypntddbmmh", "Supabase target mismatch.");
  const local = new Database(".local/spec0015-phase3/auth.sqlite");
  local.pragma("foreign_keys = ON");
  const emails = owners.map(ownerId => {
    const row = local.prepare('select id, email from "user" where id = ?').get(ownerId);
    assert.ok(row && row.id === ownerId && approvedEmails.has(row.email), "Synthetic local account identity mismatch; cleanup stopped.");
    return row.email;
  });
  assert.equal(new Set(emails).size, emails.length);
  const client = createClient(url, key, { auth: { persistSession: false } });
  const bucket = client.storage.from("diamond-p4u-content");
  const allPaths = [];
  const collect = async (prefix, depth = 0) => {
    assert.ok(depth <= 6 && allPaths.length <= 1000, "Synthetic object inventory exceeds bound.");
    for (let offset = 0; ; offset += 100) {
      const result = await bucket.list(prefix, { limit: 100, offset });
      if (result.error) throw result.error;
      for (const item of result.data) {
        assert.ok(/^[a-zA-Z0-9_.-]+$/.test(item.name), "Unexpected Storage path component.");
        const path = `${prefix}/${item.name}`;
        if (item.name.endsWith(".gzpart")) allPaths.push(path);
        else await collect(path, depth + 1);
      }
      if (result.data.length < 100) break;
    }
  };
  const counts = [];
  for (const ownerId of owners) {
    const heads = await client.from("diamond_p4u_heads").select("project_id").eq("owner_id", ownerId);
    const versions = await client.from("diamond_p4u_versions").select("project_id,part_paths").eq("owner_id", ownerId);
    if (heads.error || versions.error) throw heads.error ?? versions.error;
    await collect(ownerId);
    const ownedPaths = allPaths.filter(path => path.startsWith(`${ownerId}/`));
    for (const path of ownedPaths) {
      const pieces = path.split("/");
      assert.ok(pieces.length === 5 && /^[0-9a-f-]{36}$/.test(pieces[1]) && /^[1-9][0-9]*$/.test(pieces[2]) &&
        /^[0-9a-f-]{36}$/.test(pieces[3]) && /^[0-9]+\.gzpart$/.test(pieces[4]), "Unexpected synthetic object path.");
    }
    for (const version of versions.data) {
      assert.ok(Array.isArray(version.part_paths) && version.part_paths.every(path => typeof path === "string" && path.startsWith(`${ownerId}/`)));
    }
    for (let start = 0; start < ownedPaths.length; start += 100) {
      const removal = await bucket.remove(ownedPaths.slice(start, start + 100));
      if (removal.error) throw removal.error;
    }
    const beforeVerify = allPaths.length;
    allPaths.length = 0;
    await collect(ownerId);
    assert.equal(allPaths.length, 0, "Synthetic Storage objects remain after removal.");
    const deletedVersions = await client.from("diamond_p4u_versions").delete().eq("owner_id", ownerId).select("project_id");
    const deletedHeads = await client.from("diamond_p4u_heads").delete().eq("owner_id", ownerId).select("project_id");
    if (deletedVersions.error || deletedHeads.error) throw deletedVersions.error ?? deletedHeads.error;
    const remainingVersions = await client.from("diamond_p4u_versions").select("project_id", { count: "exact", head: true }).eq("owner_id", ownerId);
    const remainingHeads = await client.from("diamond_p4u_heads").select("project_id", { count: "exact", head: true }).eq("owner_id", ownerId);
    if (remainingVersions.error || remainingHeads.error) throw remainingVersions.error ?? remainingHeads.error;
    assert.equal(remainingVersions.count, 0);
    assert.equal(remainingHeads.count, 0);
    counts.push({ heads: heads.data.length, versions: versions.data.length, objects: beforeVerify });
  }
  const removeLocal = local.transaction(() => {
    for (const [index, ownerId] of owners.entries()) {
      local.prepare('delete from "session" where "userId" = ?').run(ownerId);
      local.prepare('delete from "account" where "userId" = ?').run(ownerId);
      local.prepare('delete from "verification" where "identifier" = ?').run(emails[index]);
      assert.equal(local.prepare('delete from "user" where id = ? and email = ?').run(ownerId, emails[index]).changes, 1);
    }
  });
  removeLocal();
  for (const [index, ownerId] of owners.entries()) {
    assert.equal(local.prepare('select count(*) as n from "user" where id = ? or email = ?').get(ownerId, emails[index]).n, 0);
    assert.equal(local.prepare('select count(*) as n from "session" where "userId" = ?').get(ownerId).n, 0);
    assert.equal(local.prepare('select count(*) as n from "account" where "userId" = ?').get(ownerId).n, 0);
  }
  local.close();
  process.stdout.write(JSON.stringify({ syntheticCleanupVerifiedZero: true, accounts: owners.length, removed: counts }) + "\n");
}

process.stdout.write(JSON.stringify({
  migrationPrivacyStatic: true, routeOwnerBindingStatic: true, boundedPartStatic: true,
  truncatedBundleRejected: true, tamperedBundleRejected: true,
  staleAtoBReadsAndWritesDenied: true,
  limitation: "Mocked route boundary and bundle faults only; remote RLS/advisors and two-account browser denial require the authorized isolated service test.",
}) + "\n");
