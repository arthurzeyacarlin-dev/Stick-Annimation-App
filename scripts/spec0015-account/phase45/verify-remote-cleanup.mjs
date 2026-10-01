import assert from "node:assert/strict";
import fs from "node:fs";
import Database from "better-sqlite3";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const owners = [
  { id: "3d3dPdEtGb0b19Mhy8tPBhN2tnRiLJZ4", email: "phase45-alice-58645@example.test", projectId: "e94c484d-c370-465a-94d0-45910e9e0ec9" },
  { id: "yakYqz80tecSZtPzAzQhKuYZ06nMHf9Z", email: "phase45-bob-58645@example.test", projectId: null },
];
const local = new Database(".local/spec0015-phase3/phase45-review-58645.sqlite", { readonly: true, fileMustExist: true });
for (const owner of owners) {
  const row = local.prepare('select id, email from "user" where id = ?').get(owner.id);
  assert.deepEqual(row, { id: owner.id, email: owner.email }, "synthetic owner identity changed; remote cleanup verification stopped");
}
local.close();

nextEnv.loadEnvConfig("/Users/arthurcarlin/Projects/stick-animation-app");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(url && key && new URL(url).hostname.split(".")[0] === "mmdahcvzklypntddbmmh", "Supabase target mismatch");
const client = createClient(url, key, { auth: { persistSession: false } });
const bucket = client.storage.from("diamond-p4u-content");
const listFiles = async (prefix, depth = 0) => {
  assert.ok(depth <= 6, "synthetic object hierarchy exceeds cleanup bound");
  const files = [];
  for (let offset = 0; ; offset += 100) {
    const listed = await bucket.list(prefix, { limit: 100, offset });
    if (listed.error) throw listed.error;
    for (const item of listed.data) {
      assert.match(item.name, /^[a-zA-Z0-9_.-]+$/, "unexpected synthetic Storage path component");
      const child = `${prefix}/${item.name}`;
      if (item.name.endsWith(".gzpart")) files.push(child);
      else files.push(...await listFiles(child, depth + 1));
    }
    if (listed.data.length < 100) break;
  }
  return files;
};

if (process.argv.includes("--cleanup-exact")) {
  for (const owner of owners) {
    const heads = await client.from("diamond_p4u_heads").select("project_id").eq("owner_id", owner.id);
    const versions = await client.from("diamond_p4u_versions").select("project_id,part_paths").eq("owner_id", owner.id);
    if (heads.error || versions.error) throw heads.error ?? versions.error;
    const expected = owner.projectId ? [owner.projectId] : [];
    assert.deepEqual([...new Set(heads.data.map(row => row.project_id))].sort(), expected, `unexpected project head for ${owner.email}`);
    assert.deepEqual([...new Set(versions.data.map(row => row.project_id))].sort(), expected, `unexpected project version for ${owner.email}`);
    const files = await listFiles(owner.id);
    assert.ok(files.every(file => owner.projectId && file.startsWith(`${owner.id}/${owner.projectId}/`)), `unexpected Storage object for ${owner.email}`);
    for (let offset = 0; offset < files.length; offset += 100) {
      const removed = await bucket.remove(files.slice(offset, offset + 100));
      if (removed.error) throw removed.error;
    }
    if (owner.projectId) {
      const removedVersions = await client.from("diamond_p4u_versions").delete().eq("owner_id", owner.id).eq("project_id", owner.projectId);
      const removedHead = await client.from("diamond_p4u_heads").delete().eq("owner_id", owner.id).eq("project_id", owner.projectId);
      if (removedVersions.error || removedHead.error) throw removedVersions.error ?? removedHead.error;
    }
  }
}

const report = { schema: "spec0015-phase45-remote-cleanup-v1", owners: [] };
for (const owner of owners) {
  const heads = await client.from("diamond_p4u_heads").select("project_id", { count: "exact", head: true }).eq("owner_id", owner.id);
  const versions = await client.from("diamond_p4u_versions").select("project_id", { count: "exact", head: true }).eq("owner_id", owner.id);
  if (heads.error || versions.error) throw heads.error ?? versions.error;
  const objects = await listFiles(owner.id);
  assert.equal(heads.count, 0, `remote project heads remain for ${owner.email}`);
  assert.equal(versions.count, 0, `remote project versions remain for ${owner.email}`);
  assert.equal(objects.length, 0, `remote project objects remain for ${owner.email}`);
  report.owners.push({ email: owner.email, heads: 0, versions: 0, objects: 0 });
}
fs.mkdirSync("output/spec0015/phase45", { recursive: true, mode: 0o700 });
fs.writeFileSync("output/spec0015/phase45/remote-cleanup.json", `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
fs.chmodSync("output/spec0015/phase45/remote-cleanup.json", 0o600);
process.stdout.write(JSON.stringify({ status: "PASS", owners: report.owners }) + "\n");
