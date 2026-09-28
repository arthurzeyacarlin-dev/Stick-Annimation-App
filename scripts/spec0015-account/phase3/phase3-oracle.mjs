import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const baseUrl = "http://127.0.0.1:58580";
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const requestStatus = (headers) => new Promise((resolve, reject) => {
  const request = http.request(`${baseUrl}/api/usage-journal`, { headers }, (response) => {
    response.resume();
    response.on("end", () => resolve(response.statusCode));
  });
  request.on("error", reject);
  request.end();
});

const entry = read("src/components/account/AccountEntry.tsx");
const config = read("src/lib/account/accountConfig.ts");
const access = read("src/lib/account/access.ts");
const chrome = read("src/components/chrome/AIcreditspage.tsx");
const packageJson = JSON.parse(read("package.json"));

check(entry.includes(">Sign in</button>"), "Entry must show Sign in.");
check(entry.includes(">Log in</button>"), "Entry must show Log in.");
check(!entry.includes("Continue privately"), "Entry must not expose a private shortcut.");
check(entry.includes("LOCAL TEST PREVIEW — no real charge, subscription, allowance, or provider limit is created."), "Signup disclosure is missing.");
for (const label of ["Starter Preview", "Creator Preview", "Studio Preview"]) check(config.includes(label), `${label} is missing.`);
check(config.includes('"starter_preview"') && config.includes('"creator_preview"') && config.includes('"studio_preview"'), "Closed preview enum is incomplete.");
check(config.includes('accountPort !== "3000" && accountPort !== "58580"'), "The local port allowlist is missing.");
check(config.includes('host === ACCOUNT_LOCAL_HOST'), "Exact configured host guard is missing.");
check(config.includes('origin === ACCOUNT_LOCAL_ORIGIN'), "Exact configured origin guard is missing.");
check(access.includes('export { isTrustedAccountRequest } from "./accountConfig"'), "The route guard export is missing.");
check(chrome.includes('body: "{}"') && chrome.includes("Log out"), "Verified one-click logout request is missing.");
check(!chrome.includes("Sign out"), "Legacy Sign out label remains.");
check(packageJson.dependencies["better-auth"] === "1.7.6", "better-auth is not exactly pinned.");
check(packageJson.dependencies["better-sqlite3"] === "13.0.3", "better-sqlite3 is not exactly pinned.");
check(packageJson.devDependencies.auth === "1.7.6", "auth CLI is not exactly pinned.");

const canonicalHome = execFileSync("git", ["show", "HEAD:app/page.tsx"], { cwd: root });
const extractedHome = fs.readFileSync(path.join(root, "src/components/account/ExistingHome.tsx"));
check(canonicalHome.equals(extractedHome), "Extracted Home differs from the canonical Home bytes.");

const dirty = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root, encoding: "utf8" })
  .trimEnd().split("\n").filter(Boolean).map((line) => line.slice(3));
const allowed = [
  /^package(?:-lock)?\.json$/,
  /^app\/(?:layout|page)\.tsx$/,
  /^app\/(?:assistant|credits)\/page\.tsx$/,
  /^app\/api\/(?:ai-animator|diamond-assistant|diamond-assistant-transcription|usage-journal|ai|drawing-project-ai-memory)\/route\.ts$/,
  /^app\/api\/auth\/\[\.\.\.all\]\/route\.ts$/,
  /^app\/dev\/ai-costs\/(?:layout\.tsx|baseline\/route\.ts)$/,
  /^src\/components\/chrome\/AIcreditspage\.tsx$/,
  /^src\/components\/account\//,
  /^src\/lib\/account\//,
  /^scripts\/spec0015-account\/phase3\//,
];
for (const file of dirty) check(allowed.some((pattern) => pattern.test(file)), `Dirty path is outside the phase ceiling: ${file}`);
check(execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: root, encoding: "utf8" }).trim() === "", "Index must stay empty.");

const routeCases = [
  ["GET", "/api/ai-animator?jobId=x&projectId=y"],
  ["POST", "/api/ai-animator"], ["DELETE", "/api/ai-animator"],
  ["GET", "/api/diamond-assistant?jobId=x&sessionId=y"],
  ["POST", "/api/diamond-assistant"], ["DELETE", "/api/diamond-assistant"],
  ["POST", "/api/diamond-assistant-transcription"], ["DELETE", "/api/diamond-assistant-transcription"],
  ["GET", "/api/usage-journal"], ["GET", "/api/ai"], ["POST", "/api/ai"],
  ["GET", "/api/drawing-project-ai-memory?projectId=x"],
  ["POST", "/api/drawing-project-ai-memory"], ["DELETE", "/api/drawing-project-ai-memory?projectId=x"],
  ["POST", "/dev/ai-costs/baseline"],
];

for (const [method, route] of routeCases) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : "{}",
    redirect: "manual",
  });
  check(response.status === 401, `${method} ${route} did not reject an unauthenticated request.`);
}

for (const origin of ["http://evil.test", "http://localhost:58580"]) {
  const response = await fetch(`${baseUrl}/api/usage-journal`, { headers: { Origin: origin } });
  check(response.status === 403, `Forged origin was not rejected: ${origin}`);
}

check(await requestStatus({ Host: "evil.test" }) === 403, "Forged Host was not rejected.");
const forgedForwardedHost = await fetch(`${baseUrl}/api/usage-journal`, { headers: { "X-Forwarded-Host": "evil.test" } });
check(forgedForwardedHost.status === 403, "Forged forwarded Host was not rejected.");
const forgedAuthOrigin = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "http://evil.test" }, body: "{}",
});
check(forgedAuthOrigin.status === 403, "Auth route accepted a forged origin.");

const databaseName = process.env.SPEC0015_ACCOUNT_DB_NAME || "auth.sqlite";
const database = new Database(path.join(root, ".local/spec0015-phase3", databaseName), { readonly: true });
const rows = database.prepare("select previewPlan, count(*) as count from user group by previewPlan order by previewPlan").all();
database.close();
check(rows.reduce((sum, row) => sum + Number(row.count), 0) >= 2, "Expected the two persisted review accounts.");
check(rows.every((row) => ["starter_preview", "creator_preview", "studio_preview"].includes(row.previewPlan)), "Persisted account has an invalid preview choice.");

process.stdout.write(`SPEC-0015 Phase 3 oracle passed ${checks} checks; zero provider requests were issued.\n`);
