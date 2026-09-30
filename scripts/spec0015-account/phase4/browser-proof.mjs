import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const origin = process.env.SPEC0015_PHASE4_REVIEW_ORIGIN ?? "http://127.0.0.1:58584";
if (origin !== "http://127.0.0.1:58584") throw new Error("Unexpected Phase 4 review origin.");
if (process.argv.includes("--serve")) {
  const { loadEnvConfig } = (await import("@next/env")).default;
  loadEnvConfig("/Users/arthurcarlin/Projects/stick-animation-app");
  assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0], "mmdahcvzklypntddbmmh");
  assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const fullAiReview = process.argv.includes("--full-ai");
  if (fullAiReview) assert.ok(process.env.OPENAI_API_KEY, "Accepted AI review environment is unavailable.");
  const env = { ...process.env, ...(!fullAiReview ? { OPENAI_API_KEY: "" } : {}), PORT: "58584" };
  const mode = process.argv.includes("--production") ? "start" : "dev";
  const child = spawn("npm", ["run", mode, "--", "--port", "58584", "--hostname", "127.0.0.1"], { env, stdio: "inherit" });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  await new Promise((resolve, reject) => {
    child.once("exit", resolve);
    child.once("error", reject);
  });
} else {
const entry = await fetch(origin, { cache: "no-store" });
const html = await entry.text();
assert.equal(entry.status, 200);
assert.match(html, /Diamond Animator/);
assert.match(html, /Sign in/);
assert.match(html, /New editable projects are privately saved to your account/);
assert.match(html, /Existing browser-local projects are not imported automatically/);

const unauthenticatedPaths = ["/api/account/projects", "/api/account/projects/7fc8c25b-40fe-4a36-8163-5bca738fc98f?head=1"];
for (const path of unauthenticatedPaths) {
  const response = await fetch(origin + path, { cache: "no-store" });
  assert.equal(response.status, 401);
  assert.doesNotMatch(await response.text(), /projectDigest|part_paths|bundle_sha256/);
}

process.stdout.write(JSON.stringify({
  origin, unauthenticatedEntry: true, unauthenticatedProjectApiDenied: true,
  limitation: "HTTP shell check only; interactive authored browser flow, account isolation, screenshots and Arthur-visible review remain outstanding.",
}) + "\n");
}
