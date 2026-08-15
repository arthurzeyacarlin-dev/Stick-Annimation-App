"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const tls = require("node:tls");
const dns = require("node:dns");
const childProcess = require("node:child_process");

const ledgerPath = process.env.SPEC0001_NETWORK_LEDGER || "";
const root = process.env.SPEC0001_REPOSITORY_ROOT || process.cwd();
const original = {
  fetch: globalThis.fetch,
  httpRequest: http.request,
  httpGet: http.get,
  httpsRequest: https.request,
  httpsGet: https.get,
  netConnect: net.connect,
  netCreateConnection: net.createConnection,
  tlsConnect: tls.connect,
  dnsLookup: dns.lookup,
  dnsResolve: dns.resolve,
  dnsReverse: dns.reverse,
  spawn: childProcess.spawn,
  spawnSync: childProcess.spawnSync,
  exec: childProcess.exec,
  execFile: childProcess.execFile,
  fork: childProcess.fork,
};

const record = (entry) => {
  if (!ledgerPath) return;
  const safe = {...entry, pid: process.pid, at: new Date().toISOString()};
  try { fs.appendFileSync(ledgerPath, `${JSON.stringify(safe)}\n`, {encoding: "utf8", mode: 0o600}); } catch {}
};

const typedError = (primitive, target) => {
  const error = new Error(`SPEC0001_NETWORK_DENIED:${primitive}:${target}`);
  error.code = "SPEC0001_NETWORK_DENIED";
  record({result: "denied", primitive, target: String(target).slice(0, 240)});
  return error;
};

const isLoopbackHost = (host) => {
  const normalized = String(host || "").replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "127.0.0.1" || normalized === "::1" || normalized.startsWith("127.");
};

const parseUrl = (input) => {
  try {
    if (input instanceof URL) return input;
    if (typeof input === "string") return new URL(input);
    if (input && typeof input.href === "string") return new URL(input.href);
    const protocol = input && input.protocol ? input.protocol : "http:";
    const host = input && (input.hostname || input.host) ? input.hostname || input.host : "";
    const port = input && input.port ? `:${input.port}` : "";
    const path = input && input.path ? input.path : "/";
    return new URL(`${protocol}//${host}${port}${path}`);
  } catch { return null; }
};

const guardHttp = (primitive, originalFn) => function guardedHttp(input, ...args) {
  const url = parseUrl(input);
  if (!url || !isLoopbackHost(url.hostname)) throw typedError(primitive, url ? url.origin : "malformed");
  record({result: "allowed", primitive, target: `${url.protocol}//${url.host}`});
  return originalFn.call(this, input, ...args);
};

if (typeof original.fetch === "function") {
  globalThis.fetch = async function guardedFetch(input, init) {
    const url = parseUrl(input);
    if (!url || !isLoopbackHost(url.hostname)) throw typedError("fetch", url ? url.origin : "malformed");
    record({result: "allowed", primitive: "fetch", target: `${url.protocol}//${url.host}`});
    return original.fetch.call(this, input, init);
  };
}

http.request = guardHttp("http.request", original.httpRequest);
http.get = guardHttp("http.get", original.httpGet);
https.request = guardHttp("https.request", original.httpsRequest);
https.get = guardHttp("https.get", original.httpsGet);

const socketTarget = (args) => {
  const first = args[0];
  if (first && typeof first === "object") return first.host || first.hostname || "";
  return typeof args[1] === "string" ? args[1] : "";
};
const guardSocket = (primitive, originalFn) => function guardedSocket(...args) {
  const host = socketTarget(args);
  if (!isLoopbackHost(host)) throw typedError(primitive, host || "missing-host");
  record({result: "allowed", primitive, target: host});
  return originalFn.apply(this, args);
};
net.connect = guardSocket("net.connect", original.netConnect);
net.createConnection = guardSocket("net.createConnection", original.netCreateConnection);
tls.connect = guardSocket("tls.connect", original.tlsConnect);

const denyDns = (primitive, originalFn) => function deniedDns(host, ...args) {
  if (isLoopbackHost(host)) {
    record({result: "allowed", primitive, target: String(host)});
    return originalFn.call(this, host, ...args);
  }
  const error = typedError(primitive, host || "missing-host");
  const callback = args.find((entry) => typeof entry === "function");
  if (callback) { queueMicrotask(() => callback(error)); return; }
  throw error;
};
dns.lookup = denyDns("dns.lookup", original.dnsLookup);
dns.resolve = denyDns("dns.resolve", original.dnsResolve);
dns.reverse = denyDns("dns.reverse", original.dnsReverse);
if (dns.promises) {
  const originalPromisesLookup = dns.promises.lookup.bind(dns.promises);
  dns.promises.lookup = async (host, options) => {
    if (isLoopbackHost(host)) {
      record({result: "allowed", primitive: "dns.promises.lookup", target: String(host)});
      return originalPromisesLookup(host, options);
    }
    throw typedError("dns.promises.lookup", host);
  };
  dns.promises.resolve = async (host) => { throw typedError("dns.promises.resolve", host); };
  dns.promises.reverse = async (host) => { throw typedError("dns.promises.reverse", host); };
}

const allowedNextChild = (command, args) => {
  if (command !== process.execPath) return false;
  const joined = (args || []).join(" ");
  return joined.includes(`${root}/node_modules/next/`) || joined.includes("next/dist/compiled/jest-worker");
};
const guardSpawn = (primitive, originalFn) => function guardedSpawn(command, args, options) {
  if (!allowedNextChild(command, Array.isArray(args) ? args : [])) throw typedError(primitive, command || "missing-command");
  record({result: "allowed", primitive, target: "next-internal-node-child"});
  return originalFn.call(this, command, args, options);
};
childProcess.spawn = guardSpawn("child_process.spawn", original.spawn);
childProcess.spawnSync = guardSpawn("child_process.spawnSync", original.spawnSync);
childProcess.exec = function deniedExec(command) { throw typedError("child_process.exec", command); };
childProcess.execFile = function deniedExecFile(file) { throw typedError("child_process.execFile", file); };
childProcess.fork = function guardedFork(modulePath, args, options) {
  if (!String(modulePath).startsWith(`${root}/node_modules/next/`)) throw typedError("child_process.fork", modulePath);
  record({result: "allowed", primitive: "child_process.fork", target: "next-internal-node-child"});
  return original.fork.call(this, modulePath, args, options);
};

globalThis.__SPEC0001_NETWORK_DENY_SELF_TEST_V1 = async () => {
  const checks = [];
  const expectDenied = async (name, operation) => {
    try { await operation(); checks.push({name, denied: false}); }
    catch (error) { checks.push({name, denied: error && error.code === "SPEC0001_NETWORK_DENIED"}); }
  };
  await expectDenied("fetch", () => globalThis.fetch("https://example.com/spec0001"));
  await expectDenied("http", () => http.request("http://example.com/spec0001"));
  await expectDenied("https", () => https.request("https://example.com/spec0001"));
  await expectDenied("net", () => net.connect(443, "203.0.113.1"));
  await expectDenied("tls", () => tls.connect(443, "203.0.113.1"));
  await expectDenied("dns", () => dns.promises.lookup("example.com"));
  await expectDenied("child", () => childProcess.spawn("curl", ["https://example.com"]));
  if (!checks.every((entry) => entry.denied)) throw new Error(`Network guard self-test failed: ${JSON.stringify(checks)}`);
  return checks;
};
