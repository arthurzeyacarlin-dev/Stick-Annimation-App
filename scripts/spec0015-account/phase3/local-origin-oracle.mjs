import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const configUrl = pathToFileURL(path.resolve("src/lib/account/accountConfig.ts"));
const originalPort = process.env.PORT;
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };

try {
  for (const port of ["3000", "58580"]) {
    process.env.PORT = port;
    const config = await import(`${configUrl.href}?port=${port}`);
    const origin = `http://127.0.0.1:${port}`;
    const host = `127.0.0.1:${port}`;
    const request = (headers) => new Request(`${origin}/api/usage-journal`, { headers });

    check(config.ACCOUNT_LOCAL_ORIGIN === origin, `${port}: wrong configured origin`);
    check(config.ACCOUNT_LOCAL_HOST === host, `${port}: wrong configured host`);
    check(config.isTrustedAccountRequest(request({ Host: host, Origin: origin })), `${port}: exact request rejected`);
    check(config.isTrustedAccountRequest(request({ Host: host })), `${port}: same-origin GET rejected`);
    for (const wrongHost of ["evil.test", `localhost:${port}`, `127.0.0.1:${port === "3000" ? "58580" : "3000"}`]) {
      check(!config.isTrustedAccountRequest(request({ Host: wrongHost, Origin: origin })), `${port}: wrong Host accepted`);
    }
    for (const wrongOrigin of ["http://evil.test", `http://localhost:${port}`, `http://127.0.0.1:${port === "3000" ? "58580" : "3000"}`]) {
      check(!config.isTrustedAccountRequest(request({ Host: host, Origin: wrongOrigin })), `${port}: wrong Origin accepted`);
    }
    check(!config.isTrustedAccountRequest(request({ Host: host, Origin: origin, "X-Forwarded-Host": "evil.test" })), `${port}: forwarded Host accepted`);
    check(!config.isTrustedAccountRequest(request({ Host: host, Origin: origin, "X-Forwarded-Proto": "https" })), `${port}: forwarded scheme accepted`);
    check(!config.isTrustedAccountRequest(request({ Host: host, Origin: origin, "Sec-Fetch-Site": "cross-site" })), `${port}: cross-site fetch accepted`);
  }

  process.env.PORT = "58581";
  await assert.rejects(import(`${configUrl.href}?port=58581`), /configured only for ports 3000 and 58580/);
  checks += 1;
} finally {
  if (originalPort === undefined) delete process.env.PORT;
  else process.env.PORT = originalPort;
}

process.stdout.write(`SPEC-0015 local-origin oracle passed ${checks} checks.\n`);
