import assert from "node:assert/strict";
import { test } from "node:test";
import { isTrustedAccountRequest, resolveAccountSiteConfig, type AccountSiteConfig } from "./accountConfig.ts";

const request = (headers: Record<string, string>) => new Request("http://internal.invalid/api/auth/get-session", { headers });

const local = resolveAccountSiteConfig({});
const live = resolveAccountSiteConfig({
  BETTER_AUTH_URL: "https://app.diamondanimator.com",
  APP_ORIGINS: "https://app.diamondanimator.com, https://beta.diamondanimator.com",
  VERCEL: "1",
});
const liveTriedLocally = resolveAccountSiteConfig({ BETTER_AUTH_URL: "https://app.diamondanimator.com", PORT: "3000" });
const trusted = (site: AccountSiteConfig, headers: Record<string, string>) => isTrustedAccountRequest(request(headers), site);

test("Local (no env vars): same config as before — 127.0.0.1 and localhost on the review port, http", () => {
  assert.equal(local.online, false);
  assert.equal(local.baseURL, "http://127.0.0.1:3000");
  assert.deepEqual(local.trustedOrigins, ["http://127.0.0.1:3000", "http://localhost:3000"]);
  assert.deepEqual(resolveAccountSiteConfig({ PORT: "58666" }).trustedOrigins, ["http://127.0.0.1:58666", "http://localhost:58666"]);
  assert.throws(() => resolveAccountSiteConfig({ PORT: "4000" }), /only for ports/);
});

test("Local requests still work exactly like today", () => {
  for (const host of ["127.0.0.1:3000", "localhost:3000"]) {
    assert.equal(trusted(local, { host }), true);
    assert.equal(trusted(local, { host, origin: `http://${host}`, "sec-fetch-site": "same-origin" }), true);
    assert.equal(trusted(local, { host, "x-forwarded-host": host, "x-forwarded-proto": "http" }), true);
  }
  assert.equal(trusted(local, { host: "127.0.0.1:3000", origin: "http://localhost:3000" }), false, "origin must match host");
  assert.equal(trusted(local, { host: "127.0.0.1:3001" }), false);
  assert.equal(trusted(local, { host: "[::1]:3000" }), false);
  assert.equal(trusted(local, { host: "127.0.0.1:3000", "x-forwarded-proto": "https" }), false);
  assert.equal(trusted(local, { host: "127.0.0.1:3000", "x-forwarded-host": "evil.example" }), false);
  assert.equal(trusted(local, { host: "app.diamondanimator.com", "x-forwarded-proto": "https" }), false, "online host is not trusted locally");
});

test("Online: https://app.diamondanimator.com is accepted", () => {
  assert.equal(live.online, true);
  assert.equal(live.baseURL, "https://app.diamondanimator.com");
  assert.deepEqual(live.trustedOrigins, ["https://app.diamondanimator.com", "https://beta.diamondanimator.com"]);
  const host = "app.diamondanimator.com";
  assert.equal(trusted(live, { host, "x-forwarded-proto": "https" }), true);
  assert.equal(trusted(live, { host, "x-forwarded-host": host, "x-forwarded-proto": "https",
    origin: "https://app.diamondanimator.com", "sec-fetch-site": "same-origin" }), true);
  assert.equal(trusted(live, { host: "beta.diamondanimator.com", "x-forwarded-proto": "https", origin: "https://beta.diamondanimator.com" }), true);
});

test("Online: foreign origins, plain http and other sites are refused", () => {
  const host = "app.diamondanimator.com";
  const base = { host, "x-forwarded-proto": "https" };
  assert.equal(trusted(live, { ...base, origin: "https://evil.example" }), false);
  assert.equal(trusted(live, { ...base, origin: "http://app.diamondanimator.com" }), false);
  assert.equal(trusted(live, { ...base, origin: "https://beta.diamondanimator.com" }), false, "origin must be the same address");
  assert.equal(trusted(live, { ...base, "sec-fetch-site": "cross-site" }), false);
  assert.equal(trusted(live, { ...base, "sec-fetch-site": "same-site" }), false);
  assert.equal(trusted(live, { ...base, "x-forwarded-host": "evil.example" }), false);
  assert.equal(trusted(live, { host }), false, "no https proxy header");
  assert.equal(trusted(live, { host, "x-forwarded-proto": "http" }), false);
  assert.equal(trusted(live, { host: "evil.example", "x-forwarded-proto": "https", origin: "https://evil.example" }), false);
  assert.equal(trusted(live, { host: "diamond-animator.vercel.app", "x-forwarded-proto": "https" }), false, "unlisted preview address");
});

test("Online on Vercel: local addresses are not trusted; off Vercel they still work for trying the live settings", () => {
  assert.equal(trusted(live, { host: "127.0.0.1:3000" }), false);
  assert.equal(trusted(live, { host: "localhost:3000" }), false);
  assert.equal(trusted(liveTriedLocally, { host: "localhost:3000", origin: "http://localhost:3000" }), true);
  assert.equal(trusted(liveTriedLocally, { host: "app.diamondanimator.com", "x-forwarded-proto": "https" }), true);
});

test("Bad online settings fail loudly instead of trusting the wrong thing", () => {
  assert.throws(() => resolveAccountSiteConfig({ VERCEL: "1" }), /BETTER_AUTH_URL must be set/);
  assert.throws(() => resolveAccountSiteConfig({ BETTER_AUTH_URL: "http://app.diamondanimator.com", VERCEL: "1" }), /https/);
  assert.throws(() => resolveAccountSiteConfig({ BETTER_AUTH_URL: "https://app.diamondanimator.com/api", VERCEL: "1" }), /no path/);
  assert.throws(() => resolveAccountSiteConfig({ BETTER_AUTH_URL: "https://app.diamondanimator.com", APP_ORIGINS: "*", VERCEL: "1" }), /https/);
  assert.throws(() => resolveAccountSiteConfig({ APP_ORIGINS: "https://app.diamondanimator.com" }), /BETTER_AUTH_URL/);
});
