// THE PROJECT STORE (Nov 25, going online; Arthur's rule: no paid Supabase until the app earns).
// Where every customer's projects are saved on the server: a small private program next to the app, on the server's own disk.
// It answers exactly the calls the app's saving code (src/lib/account/projectServer.ts) already makes to Supabase, with the
// same answers as the stand-in Arthur saved with every day from Nov 16 to Nov 25 - so the app's saving code is not changed.
// What is new against that stand-in (which was a test tool):
//   - tables live in SQLite (one safe write per save, survives a crash or power cut: WAL + synchronous FULL), not whole files;
//   - every file is written to a temporary name, flushed to disk, then renamed (a cut-off write never leaves half a picture);
//   - a key: only the app (which holds STORE_KEY) can use it; it listens only inside the server, never on the internet;
//   - only the two project tables and the one project folder exist; no test-only modes; names are checked, nothing outside
//     its folder can ever be read or written.
// Usage: STORE_KEY=<secret> node deploy/project-store.mjs <port> <dataDir> [host]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID, timingSafeEqual, createHash } from "node:crypto";
import Database from "better-sqlite3";

const PORT = Number(process.argv[2] || 58700);
const DIR = path.resolve(process.argv[3] || "./project-store");
const HOST = process.argv[4] || "127.0.0.1";
const KEY = process.env.STORE_KEY?.trim() ?? "";
if (KEY.length < 32) { console.error("STORE_KEY must be set (at least 32 characters)."); process.exit(1); }

const TABLES = new Set(["diamond_p4u_heads", "diamond_p4u_versions"]);
const BUCKETS = new Set(["diamond-p4u-content"]);
const MAX_BODY = 64 * 1024 * 1024;          // the app sends at most one 45 MB picture or one 5 MB part at a time
const FILES = path.join(DIR, "files");
fs.mkdirSync(FILES, { recursive: true, mode: 0o700 });

// ---- tables: one row = one JSON object, like the stand-in; owner_id / project_id kept as columns for fast, exact lookups ----
const db = new Database(path.join(DIR, "projects.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("synchronous = FULL");
db.pragma("busy_timeout = 5000");
db.exec(`
  CREATE TABLE IF NOT EXISTS rows (id INTEGER PRIMARY KEY, tbl TEXT NOT NULL, owner_id TEXT NOT NULL, project_id TEXT, data TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS rows_owner ON rows (tbl, owner_id, project_id);
  CREATE UNIQUE INDEX IF NOT EXISTS heads_one_per_project ON rows (owner_id, project_id) WHERE tbl = 'diamond_p4u_heads';
`);
const q = {
  byOwner: db.prepare("SELECT id, data FROM rows WHERE tbl = ? AND owner_id = ? ORDER BY id"),
  byProject: db.prepare("SELECT id, data FROM rows WHERE tbl = ? AND owner_id = ? AND project_id = ? ORDER BY id"),
  insert: db.prepare("INSERT INTO rows (tbl, owner_id, project_id, data) VALUES (?, ?, ?, ?)"),
  update: db.prepare("UPDATE rows SET data = ? WHERE id = ?"),
};

const send = (res, status, body, headers = {}) => {
  const bytes = body === undefined ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "content-type": Buffer.isBuffer(body) ? "application/octet-stream" : "application/json", "content-length": bytes.length, ...headers });
  res.end(bytes);
};
const bodyOf = req => new Promise((resolve, reject) => {
  const parts = []; let size = 0;
  req.on("data", part => { size += part.length; if (size > MAX_BODY) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else parts.push(part); });
  req.on("end", () => resolve(Buffer.concat(parts)));
  req.on("error", reject);
});
const jsonOf = async req => { const text = (await bodyOf(req)).toString("utf8"); return text ? JSON.parse(text) : null; };

// The same filter rules as the stand-in (eq / is.null / not.is.null), on checked column names.
const COLUMN = /^[a-z_]{1,64}$/;
const matches = (row, filters) => filters.every(([column, rule]) => {
  const value = row[column];
  if (rule === "is.null") return value === null || value === undefined;
  if (rule === "not.is.null") return value !== null && value !== undefined;
  if (rule.startsWith("eq.")) return String(value) === rule.slice(3);
  throw Object.assign(new Error(`filter ${column}`), { status: 400 });
});
const pick = (row, select) => !select || select === "*" ? row : Object.fromEntries(select.split(",").map(column => [column, row[column] ?? null]));
const eqValue = (filters, column) => { const hit = filters.find(([c, rule]) => c === column && rule.startsWith("eq.")); return hit ? hit[1].slice(3) : null; };

const rest = async (req, res, table, query) => {
  if (!TABLES.has(table)) return send(res, 404, { message: "no such table" });
  const filters = [...query].filter(([key]) => !["select", "order", "limit", "offset", "columns", "on_conflict"].includes(key));
  for (const [column] of filters) if (!COLUMN.test(column)) return send(res, 400, { message: "bad column" });
  const select = query.get("select"), single = (req.headers.accept || "").includes("vnd.pgrst.object");
  if (select && select !== "*" && !select.split(",").every(c => COLUMN.test(c))) return send(res, 400, { message: "bad select" });
  const answer = rows => {
    const out = rows.map(row => pick(row, select));
    if (!single) return send(res, 200, out);
    if (out.length === 1) return send(res, 200, out[0]);
    return send(res, 406, { code: "PGRST116", details: `The result contains ${out.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" });
  };
  // Every call the app makes names one owner: nothing is ever read or changed across accounts.
  const candidates = () => {
    const owner = eqValue(filters, "owner_id");
    if (!owner) throw Object.assign(new Error("owner_id required"), { status: 400 });
    const project = eqValue(filters, "project_id");
    const found = project ? q.byProject.all(table, owner, project) : q.byOwner.all(table, owner);
    return found.map(r => ({ id: r.id, row: JSON.parse(r.data) })).filter(({ row }) => matches(row, filters));
  };
  if (req.method === "GET" || req.method === "HEAD") {
    let found = candidates().map(({ row }) => row);
    const order = query.get("order");
    if (order) { const [column, way] = order.split("."); if (!COLUMN.test(column)) return send(res, 400, { message: "bad order" }); found.sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (way === "desc" ? -1 : 1)); }
    if (query.get("limit")) found = found.slice(0, Math.max(0, Number(query.get("limit")) || 0));
    return answer(found);
  }
  if (req.method === "POST") {
    const body = await jsonOf(req);
    const added = Array.isArray(body) ? body : [body];
    if (!added.length || added.some(row => !row || typeof row !== "object" || typeof row.owner_id !== "string" || !row.owner_id)) return send(res, 400, { message: "bad row" });
    try {
      db.transaction(() => { for (const row of added) q.insert.run(table, row.owner_id, typeof row.project_id === "string" ? row.project_id : null, JSON.stringify(row)); })();
    } catch (error) {
      if (String(error?.code).startsWith("SQLITE_CONSTRAINT")) return send(res, 409, { code: "23505", message: "duplicate key value violates unique constraint" });
      throw error;
    }
    return (req.headers.prefer || "").includes("return=representation") ? answer(added) : send(res, 201);
  }
  if (req.method === "PATCH") {
    const body = await jsonOf(req);
    if (!body || typeof body !== "object" || Array.isArray(body) || "owner_id" in body && body.owner_id !== eqValue(filters, "owner_id")) return send(res, 400, { message: "bad change" });
    const changed = db.transaction(() => {
      const hits = candidates();
      for (const hit of hits) { Object.assign(hit.row, body); q.update.run(JSON.stringify(hit.row), hit.id); }
      return hits.map(hit => hit.row);
    })();
    return (req.headers.prefer || "").includes("return=representation") ? answer(changed) : send(res, 204);
  }
  return send(res, 405, { message: "not supported" });
};

// ---- files: <dataDir>/files/<bucket>/<owner>/<project>/... ----
const NAME = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*(\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$/;
const filePath = (bucket, name) => {
  if (!BUCKETS.has(bucket) || typeof name !== "string" || !NAME.test(name) || name.split("/").some(part => part === "." || part === "..")) throw Object.assign(new Error("bad name"), { status: 400 });
  const root = path.join(FILES, bucket), full = path.resolve(root, name);
  if (!full.startsWith(root + path.sep)) throw Object.assign(new Error("bad name"), { status: 400 });
  return full;
};
const writeSafely = (full, bytes) => {
  fs.mkdirSync(path.dirname(full), { recursive: true, mode: 0o700 });
  const tmp = `${full}.${randomUUID()}.tmp`;
  const fd = fs.openSync(tmp, "wx", 0o600);
  try { fs.writeSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, full);
  const dir = fs.openSync(path.dirname(full), "r"); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
};
const storage = async (req, res, parts) => {
  if (parts[0] !== "object") return send(res, 404, { message: "not supported" });
  if (parts[1] === "list" && req.method === "POST") {
    const bucket = parts[2], { prefix = "", limit = 100, offset = 0 } = (await jsonOf(req)) ?? {};
    const folder = prefix ? filePath(bucket, prefix.replace(/\/+$/, "")) : (BUCKETS.has(bucket) ? path.join(FILES, bucket) : filePath(bucket, ""));
    const names = fs.existsSync(folder) && fs.statSync(folder).isDirectory() ? fs.readdirSync(folder).filter(n => !n.endsWith(".tmp")).sort() : [];
    const from = Math.max(0, Number(offset) || 0), count = Math.min(10_000, Math.max(0, Number(limit) || 0));
    return send(res, 200, names.slice(from, from + count).map(name => {
      const stat = fs.statSync(path.join(folder, name));
      if (stat.isDirectory()) return { name, id: null, updated_at: null, created_at: null, last_accessed_at: null, metadata: null };
      const at = stat.mtime.toISOString();
      return { name, id: createHash("sha1").update(`${folder}/${name}`).digest("hex"), updated_at: at, created_at: at, last_accessed_at: at, metadata: { size: stat.size, mimetype: "application/octet-stream" } };
    }));
  }
  if (req.method === "DELETE") {
    const bucket = parts[1], { prefixes = [] } = (await jsonOf(req)) ?? {};
    if (!Array.isArray(prefixes) || prefixes.length > 1000) return send(res, 400, { message: "bad list" });
    const removed = [];
    for (const name of prefixes) { const full = filePath(bucket, name); if (fs.existsSync(full) && fs.statSync(full).isFile()) { fs.unlinkSync(full); removed.push({ name, bucket_id: bucket }); } }
    return send(res, 200, removed);
  }
  if (req.method === "POST" || req.method === "PUT") {
    const bucket = parts[1], name = decodeURIComponent(parts.slice(2).join("/"));
    const full = filePath(bucket, name);
    const bytes = await bodyOf(req);
    if (fs.existsSync(full) && req.headers["x-upsert"] !== "true" && req.method === "POST") return send(res, 400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
    writeSafely(full, bytes);
    return send(res, 200, { Id: randomUUID(), Key: `${bucket}/${name}` });
  }
  if (req.method === "GET") {
    const start = ["authenticated", "public"].includes(parts[1]) ? 2 : 1;
    const bucket = parts[start], full = filePath(bucket, decodeURIComponent(parts.slice(start + 1).join("/")));
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return send(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
    return send(res, 200, fs.readFileSync(full));
  }
  return send(res, 405, { message: "not supported" });
};

const keyOk = req => {
  const given = String(req.headers.apikey ?? "").trim() || String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  const a = Buffer.from(given), b = Buffer.from(KEY);
  return a.length === b.length && timingSafeEqual(a, b);
};

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let status = 500;
  const realSend = res.writeHead.bind(res);
  res.writeHead = (code, ...rest_) => { status = code; return realSend(code, ...rest_); };
  try {
    const url = new URL(req.url, "http://store"), parts = url.pathname.split("/").filter(Boolean);
    if (url.pathname === "/__health") return send(res, 200, { ok: true });
    if (!keyOk(req)) return send(res, 401, { message: "key required" });
    if (parts[0] === "rest" && parts[1] === "v1" && parts[2]) return await rest(req, res, parts[2], url.searchParams);
    if (parts[0] === "storage" && parts[1] === "v1") return await storage(req, res, parts.slice(2));
    return send(res, 404, { message: "not supported" });
  } catch (error) {
    if (!res.headersSent) send(res, error?.status ?? 500, { message: error?.status ? String(error.message) : "store error" });
    if (!error?.status) console.error(`[project store] ${req.method} ${req.url?.split("?")[0]} failed: ${error?.stack || error}`);
  } finally {
    res.on("finish", () => { if (status >= 500) console.error(`[project store] ${req.method} ${req.url?.split("?")[0]} -> ${status} in ${Date.now() - started} ms`); });
  }
});
server.requestTimeout = 10 * 60 * 1000;
server.listen(PORT, HOST, () => console.log(`[project store] ready on http://${HOST}:${PORT} -> ${DIR}`));
const stop = () => server.close(() => { db.close(); process.exit(0); });
process.on("SIGTERM", stop); process.on("SIGINT", stop);
