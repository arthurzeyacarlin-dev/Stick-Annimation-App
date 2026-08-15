/* eslint-disable @typescript-eslint/no-require-imports */
const http = require("node:http");
const { readFileSync } = require("node:fs");
const { extname, resolve, sep } = require("node:path");

const root = process.env.SPEC0002_BROWSER_ROOT;
if (!root) throw new Error("Missing SPEC0002_BROWSER_ROOT.");

const selfTests = [
  () => globalThis.fetch("https://spec0002.invalid/fetch"),
  () => http.get("http://spec0002.invalid/http"),
  () => require("node:https").get("https://spec0002.invalid/https"),
  () => require("node:net").connect(443, "spec0002.invalid"),
  () => require("node:tls").connect(443, "spec0002.invalid"),
  () => require("node:dns").lookup("spec0002.invalid", () => undefined),
  () => require("node:dns").promises.lookup("spec0002.invalid"),
  () => require("node:child_process").spawn("spec0002-forbidden-child"),
];

const run = async () => {
  for (const operation of selfTests) {
    try { await operation(); } catch (error) {
      if (error?.code !== "SPEC0002_NETWORK_DENIED") throw error;
    }
  }
  const server = http.createServer((request, response) => {
    const requestPath = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
    const absolutePath = resolve(root, relativePath);
    if (absolutePath !== resolve(root) && !absolutePath.startsWith(`${resolve(root)}${sep}`)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    try {
      const bytes = readFileSync(absolutePath);
      const type = extname(absolutePath) === ".js" ? "text/javascript" : extname(absolutePath) === ".html" ? "text/html" : "application/octet-stream";
      response.writeHead(200, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store" });
      response.end(bytes);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Unexpected server address.");
    process.stdout.write(`${JSON.stringify({ ready: true, port: address.port, serverDenials: globalThis.__SPEC0002_NETWORK_DENIALS })}\n`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
};

run().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exit(1);
});
