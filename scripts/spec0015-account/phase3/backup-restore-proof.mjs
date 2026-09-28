import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const databaseName = process.env.SPEC0015_ACCOUNT_DB_NAME || "auth.sqlite";
if (!/^[a-z0-9-]+\.sqlite$/.test(databaseName)) throw new Error("Unsafe database filename.");
const sourcePath = path.join(root, ".local/spec0015-phase3", databaseName);
const outputRoot = path.join(root, "output/spec0015/phase3/technical");
const backupPath = path.join(outputRoot, `${path.basename(databaseName, ".sqlite")}-backup.sqlite`);
const reportPath = path.join(outputRoot, `${path.basename(databaseName, ".sqlite")}-restore-proof.json`);

fs.mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
fs.chmodSync(outputRoot, 0o700);
if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);

const source = new Database(sourcePath);
source.pragma("wal_checkpoint(FULL)");
const sourceCounts = {
  users: Number(source.prepare("select count(*) as count from user").get().count),
  sessions: Number(source.prepare("select count(*) as count from session").get().count),
  previewPlans: source.prepare("select previewPlan, count(*) as count from user group by previewPlan order by previewPlan").all(),
};
await source.backup(backupPath);
source.close();
fs.chmodSync(backupPath, 0o600);

const restored = new Database(backupPath, { readonly: true, fileMustExist: true });
const integrity = restored.pragma("integrity_check", { simple: true });
const restoredCounts = {
  users: Number(restored.prepare("select count(*) as count from user").get().count),
  sessions: Number(restored.prepare("select count(*) as count from session").get().count),
  previewPlans: restored.prepare("select previewPlan, count(*) as count from user group by previewPlan order by previewPlan").all(),
};
restored.close();

if (integrity !== "ok" || JSON.stringify(sourceCounts) !== JSON.stringify(restoredCounts)) {
  throw new Error("SQLite backup restore validation failed.");
}
const hash = crypto.createHash("sha256").update(fs.readFileSync(backupPath)).digest("hex");
const report = { database: databaseName, integrity, counts: restoredCounts, backupSha256: hash };
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
fs.chmodSync(reportPath, 0o600);
process.stdout.write(`SQLite backup and separate read-only restore passed for ${restoredCounts.users} accounts.\n`);
