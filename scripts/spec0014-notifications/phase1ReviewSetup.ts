import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const repositoryRoot = process.cwd();
const outputRoot = resolve("output/spec0014/phase1/review");
const reviewPort = 58420;
const fixturePort = 58421;
const reviewUrl = `http://127.0.0.1:${reviewPort}`;
const nextBinary = resolve("node_modules/next/dist/bin/next");
const chromeExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function listeners(port: number) {
  const result = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" });
  if (result.status === 1) return [];
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split("\n").filter(Boolean).map(Number);
}
async function waitForHttp(url: string) {
  const deadline = Date.now() + 120_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (response.ok) return; lastError = new Error(`HTTP ${response.status}`); }
    catch (error) { lastError = error; }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
  }
  throw lastError ?? new Error("review-server-not-ready");
}

function canonicalMainWorktree() {
  const lines = execFileSync("git", ["worktree", "list", "--porcelain"], { encoding: "utf8" }).split("\n");
  let worktree = "";
  for (const line of lines) {
    if (line.startsWith("worktree ")) worktree = line.slice("worktree ".length);
    if (line === "branch refs/heads/main" && worktree) return worktree;
  }
  throw new Error("canonical-main-worktree-not-found");
}

let server: ChildProcess | null = null;
async function main() {
  mkdirSync(outputRoot, { recursive: true });
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), "a5ca805b220357b5e8128bb6b76ea408e30fa790");
  assert.equal(listeners(fixturePort).length, 0, "fixture proof server must be stopped before review startup");
  assert.equal(listeners(reviewPort).length, 0, "ordinary review port must be free before startup");
  assert.ok(!existsSync("/private/tmp/spec0014-phase1-fixture-host"), "ignored fixture-host copy must be removed");

  const canonicalEnvPath = resolve(canonicalMainWorktree(), ".env.local");
  const keyLines = readFileSync(canonicalEnvPath, "utf8").split(/\r?\n/).filter(line => /^OPENAI_API_KEY=/.test(line));
  assert.equal(keyLines.length, 1, "canonical ignored environment must contain exactly one OPENAI_API_KEY assignment");
  const keyValue = keyLines[0].slice("OPENAI_API_KEY=".length).trim().replace(/^(['"])(.*)\1$/, "$2");
  assert.ok(keyValue.length > 0, "canonical OPENAI_API_KEY must be non-empty");
  writeFileSync(resolve(repositoryRoot, ".env.local"), `${keyLines[0]}\n`, { mode: 0o600 });
  assert.equal(readFileSync(resolve(repositoryRoot, ".env.local"), "utf8").split(/\r?\n/).filter(Boolean).length, 1, "review environment may contain only OPENAI_API_KEY");
  const cleanEnvironment = { ...process.env };
  for (const name of ["OPENAI_API_KEY", "NODE_OPTIONS", "NEXT_FONT_GOOGLE_MOCKED_RESPONSES", "SPEC0001_NETWORK_LEDGER", "SPEC0001_REPOSITORY_ROOT", "NODE_ENV"]) delete cleanEnvironment[name];
  cleanEnvironment.NEXT_TELEMETRY_DISABLED = "1";
  const serverLogPath = resolve(outputRoot, "server.log");
  const logFd = openSync(serverLogPath, "w");
  server = spawn(process.execPath, [nextBinary, "dev", "--webpack", "-p", String(reviewPort)], { cwd: repositoryRoot, env: cleanEnvironment, detached: true, stdio: ["ignore", logFd, logFd] });
  closeSync(logFd);
  assert.ok(server.pid, "review server PID must be available");
  server.unref();
  await waitForHttp(reviewUrl);
  const pid = server.pid;
  const command = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" }).trim();
  const cwdRecord = execFileSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { encoding: "utf8" });
  assert.ok(command.includes("next") && command.includes("dev") && command.includes("--webpack") && command.includes(String(reviewPort)), "review process must be the canonical normal Next Webpack development server");
  assert.ok(cwdRecord.split("\n").includes(`n${repositoryRoot}`), "review process cwd must be this worktree");
  const listenerPids = listeners(reviewPort);
  assert.ok(listenerPids.length > 0, "review process group must own the requested port");
  const processGroupId = Number(execFileSync("ps", ["-p", String(pid), "-o", "pgid="], { encoding: "utf8" }).trim());
  for (const listenerPid of listenerPids) {
    const listenerGroupId = Number(execFileSync("ps", ["-p", String(listenerPid), "-o", "pgid="], { encoding: "utf8" }).trim());
    const listenerCwd = execFileSync("lsof", ["-a", "-p", String(listenerPid), "-d", "cwd", "-Fn"], { encoding: "utf8" });
    assert.equal(listenerGroupId, processGroupId, "review listener must belong to the spawned review process group");
    assert.ok(listenerCwd.split("\n").includes(`n${repositoryRoot}`), "review listener cwd must be this worktree");
  }

  const browser = await chromium.launch({ executablePath: chromeExecutable, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const browserRequests: Array<{ url: string; allowed: boolean; provider: boolean }> = [];
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    const allowed = (url.hostname === "127.0.0.1" || url.hostname === "localhost") && url.port === String(reviewPort);
    browserRequests.push({ url: route.request().url(), allowed, provider: url.pathname.startsWith("/api/") });
    if (allowed) await route.continue(); else await route.abort("blockedbyclient");
  });
  await context.addInitScript(() => { localStorage.setItem("da_welcome_never_show", "1"); localStorage.setItem("da_welcome_seen", "1"); });
  const page = await context.newPage();
  await page.goto(reviewUrl); await page.getByRole("button", { name: "New Project" }).waitFor();
  const homeLabel = await page.locator('[data-notification-trigger="home"]').getAttribute("aria-label");
  await page.goto(`${reviewUrl}/assistant`); await page.locator("[data-assistant-screen]").waitFor();
  const assistantLabel = await page.locator('[data-notification-trigger="assistant"]').getAttribute("aria-label");
  const fixtureResponse = await page.request.get(`${reviewUrl}/spec0014-proof`);
  assert.ok(homeLabel?.includes("0 unread") && assistantLabel?.includes("0 unread"), "ordinary fresh browser state must contain zero notifications");
  assert.equal(fixtureResponse.status(), 404, "ignored proof route must not exist in the ordinary review server");
  assert.deepEqual(browserRequests.filter(entry => !entry.allowed), [], "ordinary review verification attempted external network access");
  assert.deepEqual(browserRequests.filter(entry => entry.provider), [], "ordinary review verification made a provider/API call");
  await browser.close();

  const proof = {
    schema: "spec0014-phase1-review-setup/v1",
    status: "PASS",
    reviewUrl,
    pid,
    process: { command, cwd: repositoryRoot, port: reviewPort, pid, listenerPids, processGroupId, mode: "NORMAL_NEXT_DEV_WEBPACK", httpReady: true, productionReadyClaim: false },
    fixtureLifecycle: { fixtureServerClosed: true, fixturePortClosed: listeners(fixturePort).length === 0, fixtureHostRemoved: true, fixtureRouteAbsent: true },
    environment: { copiedOnlyOpenAiApiKey: true, keyPresent: true, keyDisplayed: false, keyHashed: false, fixtureProfile: false, mocks: false, testFlags: false },
    ordinaryState: { homeUnread: 0, assistantUnread: 0 },
    network: { totalRequests: browserRequests.length, externalRequests: 0, providerRequests: 0 },
  };
  writeFileSync(resolve(outputRoot, "review-setup.json"), `${JSON.stringify(proof, null, 2)}\n`);
  process.stdout.write(`SPEC-0014 Phase 1 ordinary review server READY ${reviewUrl} PID ${pid}\n`);
}

try { await main(); }
catch (error) {
  const activeServer = server as ChildProcess | null;
  if (activeServer?.pid) { try { process.kill(-activeServer.pid, "SIGTERM"); } catch { /* process group may already be closed */ } }
  throw error;
}
