import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const outputRoot = path.join(root, "output/spec0015/phase45/backup");
fs.mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
fs.chmodSync(outputRoot, 0o700);
const sha = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const databases = [
  {
    label: "auth",
    source: path.join(root, ".local/spec0015-phase3/phase45-review-58645.sqlite"),
    tables: ["user", "session"],
  },
  {
    label: "account-data",
    source: path.join(root, ".local/spec0015-phase3/phase45-account-data-58645.sqlite"),
    tables: ["account_state_v1"],
  },
];

const report = { schema: "spec0015-phase45-backup-restore-v1", databases: [] };
for (const item of databases) {
  const backup = path.join(outputRoot, `${item.label}-backup.sqlite`);
  if (fs.existsSync(backup)) fs.unlinkSync(backup);
  const source = new Database(item.source, { readonly: true, fileMustExist: true });
  const sourceCounts = Object.fromEntries(item.tables.map(table => [table, Number(source.prepare(`select count(*) as count from ${table}`).get().count)]));
  await source.backup(backup);
  source.close();
  fs.chmodSync(backup, 0o600);
  const restored = new Database(backup, { readonly: true, fileMustExist: true });
  const integrity = restored.pragma("integrity_check", { simple: true });
  const restoredCounts = Object.fromEntries(item.tables.map(table => [table, Number(restored.prepare(`select count(*) as count from ${table}`).get().count)]));
  restored.close();
  assert.equal(integrity, "ok", `${item.label} restored backup failed integrity_check`);
  assert.deepEqual(restoredCounts, sourceCounts, `${item.label} restored backup counts differ from source`);
  report.databases.push({ label: item.label, integrity, counts: restoredCounts, bytes: fs.statSync(backup).size, sha256: sha(backup) });
}

const reportPath = path.join(outputRoot, "restore-proof.json");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
fs.chmodSync(reportPath, 0o600);
process.stdout.write(JSON.stringify({ status: "PASS", databases: report.databases.map(item => ({ label: item.label, integrity: item.integrity, counts: item.counts })) }) + "\n");
