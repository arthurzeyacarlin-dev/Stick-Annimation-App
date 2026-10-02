import assert from "node:assert/strict";
import Database from "better-sqlite3";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const owners = [
  { id: "lxQo27KzCXoPeRjsJVk6s7i6kdC6hSnN", email: "phase5-baseline-58666@example.test", heads: 2 },
  { id: "H37VYY69V4E4hHHOgTbVyaOJr8q5Jy7S", email: "phase5-b-58666@example.test", heads: 1 },
];
const auth = new Database(".local/spec0015-phase3/auth.sqlite", { fileMustExist: true });
const data = new Database(".local/spec0015-phase3/account-data.sqlite", { fileMustExist: true });
const usage = new Database(".local/spec0015-phase3/account-usage.sqlite", { fileMustExist: true });
for (const db of [auth, data, usage]) db.pragma("foreign_keys = ON");
assert.equal(auth.prepare('SELECT count(*) count FROM "user"').get().count, 2, "unexpected review account exists");
for (const owner of owners) {
  assert.deepEqual(auth.prepare('SELECT id,email FROM "user" WHERE id=?').get(owner.id),
    { id: owner.id, email: owner.email }, "synthetic account identity changed");
}

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(url && key && new URL(url).hostname.split(".")[0] === "mmdahcvzklypntddbmmh", "unexpected backend project");
const client = createClient(url, key, { auth: { persistSession: false } });
const bucket = client.storage.from("diamond-p4u-content");
const filesUnder = async (prefix, depth = 0) => {
  assert.ok(depth <= 6, "object hierarchy too deep");
  const files = [];
  for (let offset = 0; ; offset += 100) {
    const result = await bucket.list(prefix, { limit: 100, offset });
    if (result.error) throw result.error;
    for (const item of result.data) {
      assert.match(item.name, /^[a-zA-Z0-9_.-]+$/, "unexpected object path component");
      const child = `${prefix}/${item.name}`;
      if (item.name.endsWith(".gzpart")) files.push(child);
      else files.push(...await filesUnder(child, depth + 1));
    }
    if (result.data.length < 100) break;
  }
  return files;
};

const inventory = [];
for (const owner of owners) {
  const heads = await client.from("diamond_p4u_heads").select("project_id").eq("owner_id", owner.id);
  const versions = await client.from("diamond_p4u_versions").select("project_id").eq("owner_id", owner.id);
  if (heads.error || versions.error) throw heads.error ?? versions.error;
  const projectIds = [...new Set(heads.data.map(row => row.project_id))].sort();
  assert.equal(projectIds.length, owner.heads, `unexpected project count for ${owner.email}`);
  assert.ok(versions.data.length > 0, "expected saved versions missing");
  assert.ok(versions.data.every(row => projectIds.includes(row.project_id)), "unexpected project version owner path");
  const objects = await filesUnder(owner.id);
  assert.ok(objects.every(object => projectIds.some(id => object.startsWith(`${owner.id}/${id}/`))),
    `unexpected object for ${owner.email}`);
  inventory.push({ ...owner, projectIds, versionCount: versions.data.length, objects });
}
assert.ok(inventory[0].projectIds.includes("a6fdbf81-aca0-4908-8966-c0ea6d890649"), "first A test project missing");
assert.ok(inventory[1].projectIds.includes("50894ff3-3435-447e-813b-2d38b0223d08"), "B smoke project missing");

if (process.argv.includes("--cleanup-exact")) {
  for (const owner of inventory) {
    for (let offset = 0; offset < owner.objects.length; offset += 100) {
      const removed = await bucket.remove(owner.objects.slice(offset, offset + 100));
      if (removed.error) throw removed.error;
    }
    for (const projectId of owner.projectIds) {
      const versions = await client.from("diamond_p4u_versions").delete().eq("owner_id", owner.id).eq("project_id", projectId);
      const heads = await client.from("diamond_p4u_heads").delete().eq("owner_id", owner.id).eq("project_id", projectId);
      if (versions.error || heads.error) throw versions.error ?? heads.error;
    }
  }
  for (const owner of owners) {
    data.prepare("DELETE FROM account_state_v1 WHERE owner_id=?").run(owner.id);
    usage.prepare("DELETE FROM account_usage_events_v1 WHERE owner_id=?").run(owner.id);
    auth.prepare('DELETE FROM "session" WHERE userId=?').run(owner.id);
    auth.prepare('DELETE FROM "account" WHERE userId=?').run(owner.id);
    auth.prepare('DELETE FROM "user" WHERE id=?').run(owner.id);
  }
}

if (process.argv.includes("--cleanup-exact")) {
  for (const owner of owners) {
    const heads = await client.from("diamond_p4u_heads").select("project_id", { count: "exact", head: true }).eq("owner_id", owner.id);
    const versions = await client.from("diamond_p4u_versions").select("project_id", { count: "exact", head: true }).eq("owner_id", owner.id);
    if (heads.error || versions.error) throw heads.error ?? versions.error;
    assert.equal(heads.count, 0); assert.equal(versions.count, 0);
    assert.equal((await filesUnder(owner.id)).length, 0);
    assert.equal(auth.prepare('SELECT count(*) count FROM "user" WHERE id=?').get(owner.id).count, 0);
    assert.equal(data.prepare('SELECT count(*) count FROM account_state_v1 WHERE owner_id=?').get(owner.id).count, 0);
    assert.equal(usage.prepare('SELECT count(*) count FROM account_usage_events_v1 WHERE owner_id=?').get(owner.id).count, 0);
  }
}
for (const db of [auth, data, usage]) db.close();
process.stdout.write(JSON.stringify({ status: "PASS", mode: process.argv.includes("--cleanup-exact") ? "cleaned" : "inventory",
  owners: inventory.map(({ email, projectIds, versionCount, objects }) =>
    ({ email, projectIds, versionCount, objectCount: objects.length })) }) + "\n");
