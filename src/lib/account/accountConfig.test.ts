// (Nov 25, going online) which addresses the app trusts, on this Mac and online. Run: node --experimental-strip-types --test src/lib/account/accountConfig.test.ts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const here = new URL("./accountConfig.ts", import.meta.url).pathname;

/** Loads accountConfig.ts in a fresh Node with these settings and asks it about the given requests. */
function ask(env: Record<string, string>, requests: Array<Record<string, string>>): { origin: string; hosts: string[]; trusted: boolean[] } | { error: string } {
  const script = `
    const m = await import(${JSON.stringify(here)});
    const reqs = ${JSON.stringify(requests)};
    console.log(JSON.stringify({ origin: m.ACCOUNT_LOCAL_ORIGIN, hosts: m.ACCOUNT_LOCAL_HOSTS,
      trusted: reqs.map((h) => m.isTrustedAccountRequest(new Request("http://x/", { headers: h }))) }));`;
  try {
    const out = execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", script],
      { env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv, encoding: "utf8" as const, stdio: ["ignore", "pipe", "pipe"] as ("ignore" | "pipe")[] });
    return JSON.parse(out.trim().split("\n").pop()!);
  } catch (error) {
    return { error: String((error as { stderr?: string }).stderr ?? error) };
  }
}

test("this Mac (no public address): exactly as before - 127.0.0.1 and localhost on the review port, plain http only", () => {
  const r = ask({ PORT: "58680" }, [
    { host: "127.0.0.1:58680" },
    { host: "localhost:58680", origin: "http://localhost:58680" },
    { host: "127.0.0.1:58680", origin: "https://127.0.0.1:58680" },
    { host: "app.diamondanimator.com", origin: "https://app.diamondanimator.com", "x-forwarded-proto": "https" },
    { host: "127.0.0.1:58680", "sec-fetch-site": "cross-site" },
  ]);
  assert.ok(!("error" in r), JSON.stringify(r));
  assert.equal(r.origin, "http://127.0.0.1:58680");
  assert.deepEqual(r.hosts, ["127.0.0.1:58680", "localhost:58680"]);
  assert.deepEqual(r.trusted, [true, true, false, false, false]);
});

test("this Mac still refuses an unknown port", () => {
  const r = ask({ PORT: "4321" }, []);
  assert.ok("error" in r && /configured only for ports/.test(r.error));
});

test("online: only https://app.diamondanimator.com is trusted, whatever port the app listens on", () => {
  const r = ask({ PORT: "3000", DIAMOND_PUBLIC_ORIGIN: "https://app.diamondanimator.com" }, [
    { host: "app.diamondanimator.com", origin: "https://app.diamondanimator.com", "x-forwarded-proto": "https" },
    { host: "app.diamondanimator.com" },
    { host: "app.diamondanimator.com", origin: "http://app.diamondanimator.com" },
    { host: "app.diamondanimator.com", "x-forwarded-proto": "http" },
    { host: "127.0.0.1:3000" },
    { host: "evil.example", origin: "https://evil.example" },
    { host: "app.diamondanimator.com", "x-forwarded-host": "evil.example" },
    { host: "app.diamondanimator.com", origin: "https://diamondanimator.com" },
    { host: "app.diamondanimator.com", "sec-fetch-site": "cross-site" },
  ]);
  assert.ok(!("error" in r), JSON.stringify(r));
  assert.equal(r.origin, "https://app.diamondanimator.com");
  assert.deepEqual(r.hosts, ["app.diamondanimator.com"]);
  assert.deepEqual(r.trusted, [true, true, false, false, false, false, false, false, false]);
  const odd = ask({ PORT: "8080", DIAMOND_PUBLIC_ORIGIN: "https://app.diamondanimator.com" }, []);
  assert.ok(!("error" in odd), "any port is fine online (the front door decides the address)");
});

test("online: a badly written address stops the app instead of trusting the wrong thing", () => {
  for (const bad of ["http://app.diamondanimator.com", "https://app.diamondanimator.com/", "https://app.diamondanimator.com:8443", "app.diamondanimator.com", "https://"]) {
    const r = ask({ PORT: "3000", DIAMOND_PUBLIC_ORIGIN: bad }, []);
    assert.ok("error" in r && /DIAMOND_PUBLIC_ORIGIN must be/.test(r.error), `${bad}: ${JSON.stringify(r)}`);
  }
});
