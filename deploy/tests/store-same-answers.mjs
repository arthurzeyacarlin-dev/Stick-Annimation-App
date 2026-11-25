// SAME ANSWERS CHECK (Nov 25): the saving calls the app makes, sent to the old stand-in AND the new project store; every answer
// must match (only random ids differ). Run: start both (stand-in on A, `STORE_KEY=kkk...(40 k) node deploy/project-store.mjs B <dir>`), then
//   node deploy/tests/store-same-answers.mjs http://127.0.0.1:A http://127.0.0.1:B
import { createClient } from "@supabase/supabase-js";
const KEY = "k".repeat(40);
const OWNER = "ownerA_test", OTHER = "ownerB_test", P1 = "11111111-1111-4111-8111-111111111111", P2 = "22222222-2222-4222-8222-222222222222";
const run = async (url) => {
  const db = createClient(url, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const out = [];
  const log = (label, r) => out.push([label, JSON.stringify({ data: r.data ?? null, error: r.error ? { code: r.error.code ?? null, status: r.error.status ?? r.error.statusCode ?? null } : null })]);
  const head = (p, o = OWNER, rev = 1) => ({ owner_id: o, project_id: p, title: "T " + p.slice(0, 4), created_at: "2026-11-25T00:00:00.000Z", updated_at: `2026-11-25T00:00:0${rev}.000Z`, active_revision: rev, project_digest: "a".repeat(64), stored_byte_length: 10, provenance: null, deleted_at: null });
  log("read missing", await db.from("diamond_p4u_heads").select("*").eq("owner_id", OWNER).eq("project_id", P1).is("deleted_at", null).maybeSingle());
  log("insert P1", await db.from("diamond_p4u_heads").insert(head(P1)));
  log("insert P1 again", await db.from("diamond_p4u_heads").insert(head(P1)));
  log("insert P2", await db.from("diamond_p4u_heads").insert(head(P2)));
  log("insert other owner P1", await db.from("diamond_p4u_heads").insert(head(P1, OTHER)));
  log("read P1", await db.from("diamond_p4u_heads").select("*").eq("owner_id", OWNER).eq("project_id", P1).is("deleted_at", null).maybeSingle());
  log("list", await db.from("diamond_p4u_heads").select("project_id,title,created_at,updated_at,active_revision,project_digest,stored_byte_length,provenance").eq("owner_id", OWNER).is("deleted_at", null).order("updated_at", { ascending: false }).limit(65));
  log("update P1 ok", await db.from("diamond_p4u_heads").update(head(P1, OWNER, 2)).eq("owner_id", OWNER).eq("project_id", P1).eq("active_revision", 1).eq("project_digest", "a".repeat(64)).is("deleted_at", null).select("project_id").maybeSingle());
  log("update P1 stale", await db.from("diamond_p4u_heads").update(head(P1, OWNER, 3)).eq("owner_id", OWNER).eq("project_id", P1).eq("active_revision", 1).eq("project_digest", "a".repeat(64)).is("deleted_at", null).select("project_id").maybeSingle());
  log("version insert", await db.from("diamond_p4u_versions").insert({ project_id: P1, owner_id: OWNER, revision: 2, project_digest: "a".repeat(64), bundle_sha256: "b".repeat(64), raw_byte_length: 5, compressed_byte_length: 5, part_paths: [`${OWNER}/${P1}/2/x/0.gzpart`] }));
  log("version read", await db.from("diamond_p4u_versions").select("*").eq("owner_id", OWNER).eq("project_id", P1).eq("revision", 2).eq("project_digest", "a".repeat(64)).maybeSingle());
  const s = db.storage.from("diamond-p4u-content");
  log("upload part", await s.upload(`${OWNER}/${P1}/2/x/0.gzpart`, Buffer.from("hello"), { contentType: "application/octet-stream", upsert: false }));
  log("upload part again (no upsert)", await s.upload(`${OWNER}/${P1}/2/x/0.gzpart`, Buffer.from("hello"), { contentType: "application/octet-stream", upsert: false }));
  log("upload asset upsert", await s.upload(`${OWNER}/${P1}/assets/${"c".repeat(64)}.raw`, Buffer.alloc(3000, 7), { contentType: "application/octet-stream", upsert: true }));
  log("upload asset upsert again", await s.upload(`${OWNER}/${P1}/assets/${"c".repeat(64)}.raw`, Buffer.alloc(3000, 7), { contentType: "application/octet-stream", upsert: true }));
  const l = await s.list(`${OWNER}/${P1}/assets`, { limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } });
  out.push(["list assets", JSON.stringify((l.data ?? []).map(i => [i.name, i.metadata?.size ?? null, i.id ? "id" : null]))]);
  const d = await s.download(`${OWNER}/${P1}/2/x/0.gzpart`); out.push(["download", d.data ? Buffer.from(await d.data.arrayBuffer()).toString() : "ERR " + (d.error?.message)]);
  const m = await s.download(`${OWNER}/${P1}/nothing`); out.push(["download missing", m.data ? "DATA?!" : "error"]);
  log("bad path", await s.upload(`${OWNER}/../../escape`, Buffer.from("x"), { upsert: true }).then(r => ({ data: r.data ? "WROTE" : null, error: r.error ? { code: "refused" } : null })));
  log("remove", await s.remove([`${OWNER}/${P1}/2/x/0.gzpart`]).then(r => ({ data: (r.data ?? []).map(x => x.name), error: r.error })));
  log("mark deleted", await db.from("diamond_p4u_heads").update({ deleted_at: "2026-11-25T01:00:00.000Z" }).eq("owner_id", OWNER).eq("project_id", P2).eq("active_revision", 1).eq("project_digest", "a".repeat(64)).is("deleted_at", null).select("project_id").maybeSingle());
  log("deleted list", await db.from("diamond_p4u_heads").select("project_id").eq("owner_id", OWNER).not("deleted_at", "is", null).limit(1000));
  log("list after delete", await db.from("diamond_p4u_heads").select("project_id,active_revision").eq("owner_id", OWNER).is("deleted_at", null).order("updated_at", { ascending: false }).limit(65));
  log("other owner sees own only", await db.from("diamond_p4u_heads").select("project_id").eq("owner_id", OTHER).is("deleted_at", null));
  return out;
};
const [a, b] = [await run(process.argv[2]), await run(process.argv[3])];
let same = 0;
for (let i = 0; i < a.length; i++) { if (a[i][1] === b[i][1]) same++; else console.log(`DIFFERENT ${a[i][0]}\n  old: ${a[i][1]}\n  new: ${b[i][1]}`); }
console.log(`${same}/${a.length} answers identical`);
for (const [label, v] of b) console.log(`  ${label}: ${v.slice(0, 150)}`);
