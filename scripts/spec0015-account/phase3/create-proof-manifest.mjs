import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const outputRoot = path.join(root, "output/spec0015/phase3");
const manifestPath = path.join(outputRoot, "proof-manifest.json");
const hashFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const describe = (relativePath) => {
  const absolutePath = path.join(root, relativePath);
  return { path: relativePath, bytes: fs.statSync(absolutePath).size, sha256: hashFile(absolutePath) };
};
const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const target = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(target) : [target];
});

const status = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root, encoding: "utf8" });
const implementationPaths = status.trimEnd().split("\n").filter(Boolean).map((line) => line.slice(3)).sort();
const proofPaths = walk(outputRoot)
  .map((absolutePath) => path.relative(root, absolutePath))
  .filter((relativePath) => relativePath !== "output/spec0015/phase3/proof-manifest.json")
  .sort();
const sentinelPaths = [
  "src/components/ai-dashboard/AiDashboardScreen.tsx",
  "src/components/assistant/DiamondAssistantScreen.tsx",
  "src/components/export/AnimationExportFlow.tsx",
  "src/components/notifications/NotificationCenterProvider.tsx",
  "src/components/workspace/AnimationWorkspace.tsx",
  "src/lib/animation/unifiedProjectStorageV2.ts",
  "src/lib/assistant/assistantStorage.ts",
];
const sentinels = sentinelPaths.map((relativePath) => {
  const currentSha256 = hashFile(path.join(root, relativePath));
  const baseBytes = execFileSync("git", ["show", `HEAD:${relativePath}`], { cwd: root });
  const baseSha256 = crypto.createHash("sha256").update(baseBytes).digest("hex");
  if (currentSha256 !== baseSha256) throw new Error(`Protected sentinel changed: ${relativePath}`);
  return { path: relativePath, sha256: currentSha256 };
});

const countDatabase = (filename) => {
  const database = new Database(path.join(root, ".local/spec0015-phase3", filename), { readonly: true, fileMustExist: true });
  const result = {
    users: Number(database.prepare("select count(*) as count from user").get().count),
    sessions: Number(database.prepare("select count(*) as count from session").get().count),
  };
  database.close();
  return result;
};

const manifest = {
  schema: "spec0015-phase3-proof-manifest-v1",
  generatedAt: new Date().toISOString(),
  baseAndHeadSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  expectedBaseSha: "c53ed494d55f8314ed9d07783fbb1765615c01e6",
  indexEmpty: execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: root, encoding: "utf8" }).trim() === "",
  implementation: implementationPaths.map(describe),
  proofArtifacts: proofPaths.map(describe),
  protectedSentinels: sentinels,
  accountDatabases: {
    automatedFixture: { filename: "auth-test.sqlite", ...countDatabase("auth-test.sqlite") },
    ordinaryReview: { filename: "auth.sqlite", ...countDatabase("auth.sqlite"), accountData: "user-maintained; no identifiers included" },
  },
  reviewServer: {
    origin: "http://127.0.0.1:58580",
    database: "auth.sqlite",
    launchMode: "ordinary production build",
    providerDoubles: false,
    paidProviderCallsDuringProof: 0,
  },
  checks: {
    phaseOracle: "69 passed against the existing review server; zero provider requests",
    localOriginOracle: "27 passed for configured 3000/58580, wrong Host/Origin and disallowed port",
    typescript: "passed with --incremental false",
    focusedLint: "passed with 12 inherited warnings in app/api/ai/route.ts and zero errors",
    productionBuild: "passed",
    gitDiffCheck: "passed",
    browser: "passed signed-out entry, signup A/B, login, logout, two-tab revocation, restart persistence, Home, Dashboard, Assistant, editor/tools, Export, compact layout",
    sqliteBackupRestore: "prior isolated fixture backup/restore passed; current user-maintained review store must be separately preserved before retirement",
    mainStoreProvisioning: "fresh isolated main-style migrate/check passed with zero users/sessions and final 0700/0600 permissions",
  },
  limitations: [
    "Browser projects, chats, notifications, Dashboard usage, and guided-setup preferences remain shared browser-local data; Phase 4/5 ownership is not implemented.",
    "A same-browser second account does not receive a new guided overlay after the existing browser-local seen flag is set; a fresh browser profile does.",
    "Live provider response quality was not exercised because that may incur cost; ordinary provider wiring was left unchanged and visible controls were inspected.",
    "Canonical main port 3000 was tested in isolated config/guard execution only; its store must be provisioned after publication before its account server starts.",
  ],
};

fs.mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
fs.chmodSync(manifestPath, 0o600);
process.stdout.write("Phase 3 proof manifest created.\n");
