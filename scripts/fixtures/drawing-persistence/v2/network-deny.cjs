/* eslint-disable @typescript-eslint/no-require-imports */
const denialLedger = [];
const deny = (primitive, target) => {
  const error = new Error(`SPEC0002_NETWORK_DENIED:${primitive}:${String(target ?? "")}`);
  error.code = "SPEC0002_NETWORK_DENIED";
  denialLedger.push({ primitive, target: String(target ?? ""), code: error.code });
  throw error;
};

globalThis.__SPEC0002_NETWORK_DENIALS = denialLedger;
globalThis.fetch = async (input) => deny("fetch", typeof input === "string" ? input : input?.url);

const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const tls = require("node:tls");
const dns = require("node:dns");
const childProcess = require("node:child_process");
const realDnsLookup = dns.lookup.bind(dns);
const realDnsPromisesLookup = dns.promises?.lookup.bind(dns.promises);

http.request = (...args) => deny("http.request", args[0]);
http.get = (...args) => deny("http.get", args[0]);
https.request = (...args) => deny("https.request", args[0]);
https.get = (...args) => deny("https.get", args[0]);
net.connect = (...args) => deny("net.connect", args[0]);
net.createConnection = (...args) => deny("net.createConnection", args[0]);
tls.connect = (...args) => deny("tls.connect", args[0]);
dns.lookup = (...args) => args[0] === "127.0.0.1" || args[0] === "localhost" ? realDnsLookup(...args) : deny("dns.lookup", args[0]);
if (dns.promises && realDnsPromisesLookup) dns.promises.lookup = async (...args) => args[0] === "127.0.0.1" || args[0] === "localhost" ? realDnsPromisesLookup(...args) : deny("dns.promises.lookup", args[0]);
childProcess.spawn = (...args) => deny("child_process.spawn", args[0]);
childProcess.exec = (...args) => deny("child_process.exec", args[0]);
childProcess.execFile = (...args) => deny("child_process.execFile", args[0]);
childProcess.fork = (...args) => deny("child_process.fork", args[0]);
