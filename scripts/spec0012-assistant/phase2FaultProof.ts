import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { chromium } from "playwright-core";
import { ASSISTANT_LIMITS, byteSize, sealSession, type Session } from "../../src/lib/assistant/assistantContracts.ts";
import { fixtureRequest, fixtureSession } from "./phase2Fixtures.ts";

const output = resolve("output/spec-0012/phase-2-correction/faults"); mkdirSync(output, { recursive: true });
const assertions: string[] = []; const blockedRequests: string[] = []; const origin = "http://127.0.0.1:57970";
const equal = (a: unknown, b: unknown, name: string) => { assert.deepEqual(a, b, name); assertions.push(name); };
const check = (condition: unknown, name: string) => { assert.ok(condition, name); assertions.push(name); };
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
try {
  const context = await browser.newContext();
  const modules = new Map<string, string>();
  for (const name of ["assistantContracts", "assistantStorage"]) modules.set(`/__proof/${name}.js`, ts.transpileModule(readFileSync(`src/lib/assistant/${name}.ts`, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replaceAll("./assistantContracts.ts", "./assistantContracts.js"));
  await context.route("**/*", async route => { const url = new URL(route.request().url()); if (modules.has(url.pathname)) await route.fulfill({ contentType: "text/javascript", body: modules.get(url.pathname)! }); else if (url.origin === origin) await route.continue(); else { blockedRequests.push(url.origin); await route.abort(); } });
  const page = await context.newPage(); await page.goto(`${origin}/assistant`); await page.getByLabel("Message the Assistant").waitFor();
  const run = (code: string) => page.evaluate(`(async()=>{const s=await import('/__proof/assistantStorage.js');const c=await import('/__proof/assistantContracts.js'); const raw=async()=>{const db=await new Promise((r,j)=>{const o=indexedDB.open(s.ASSISTANT_DB);o.onsuccess=()=>r(o.result);o.onerror=()=>j(o.error)});return db};${code}})()`);
  await run("await s.listSessions()");
  const seed = async (sessions: Session[]) => page.evaluate(values => new Promise<void>((resolve, reject) => { const open = indexedDB.open("diamond-assistant-session-v1", 1); open.onsuccess = () => { const db = open.result; const tx = db.transaction("sessions", "readwrite"); tx.objectStore("sessions").clear(); for (const value of values) tx.objectStore("sessions").put(value); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; }), sessions);
  const basic = await fixtureSession(500); await seed([basic]);
  const cas = await run(`const original=crypto.subtle.digest.bind(crypto.subtle);let first=true;crypto.subtle.digest=async(...args)=>{const hash=await original(...args);if(first){first=false;const db=await raw();await new Promise((r,j)=>{const t=db.transaction('sessions','readwrite');const store=t.objectStore('sessions');const get=store.get('${basic.id}');get.onsuccess=()=>store.put({...get.result,title:'External bytes changed without revision'});t.oncomplete=r;t.onerror=j});db.close()}return hash};try{await s.renameSession('${basic.id}','Stale overwrite',${JSON.stringify(basic)});return false}catch(e){return e.code==='conflict'}finally{crypto.subtle.digest=original}`);
  check(cas, "CAS detects bytes changed during hashing even without a revision increment");
  const remained = await run(`const db=await raw();return new Promise(r=>{const t=db.transaction('sessions');const get=t.objectStore('sessions').get('${basic.id}');t.oncomplete=()=>{db.close();r(get.result.title)}})`); equal(remained, "External bytes changed without revision", "stale write cannot overwrite intervening bytes");
  await seed([basic]);
  const expired = await run(`Object.defineProperty(navigator,'locks',{configurable:true,value:undefined});const original=crypto.subtle.digest.bind(crypto.subtle);let first=true;crypto.subtle.digest=async(...args)=>{const hash=await original(...args);if(first){first=false;const db=await raw();await new Promise((r,j)=>{const t=db.transaction('leases','readwrite');t.objectStore('leases').put({owner:'replacement-owner',expires:Date.now()+60000},'diamond-assistant-write-v1');t.oncomplete=r;t.onerror=j});db.close()}return hash};try{await s.renameSession('${basic.id}','Old lease overwrite',${JSON.stringify(basic)});return false}catch(e){return e.code==='lease'}finally{crypto.subtle.digest=original;const db=await raw();await new Promise(r=>{const t=db.transaction('leases','readwrite');t.objectStore('leases').clear();t.oncomplete=r});db.close()}`);
  check(expired, "expired/replaced lease holder cannot commit after takeover"); equal(await run("return (await s.listSessions()).sessions[0].digest"), basic.digest, "lease rejection preserves previous authoritative revision");
  const abort = await run(`const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const request=Reflect.apply(original,this,args);if(this.name==='sessions')this.transaction.abort();return request};try{await s.beginTurn(crypto.randomUUID(),'Atomic abort','medium',null);return false}catch{return true}finally{IDBObjectStore.prototype.put=original}`); check(abort, "transaction-completion abort rejects first send"); equal(await run("return (await s.listSessions()).sessions.length"), 1, "aborted first send publishes no partial session");
  const maxRecord = await fixtureSession(600, 49, 16000, "medium", 4000); check(byteSize(maxRecord) < ASSISTANT_LIMITS.sessionBytes, "near-1-MiB fixture valid before pending reservation"); await seed([maxRecord]);
  const recordBound = await run(`const before=(await s.listSessions()).sessions[0];try{await s.beginTurn(before.id,'New question','medium',before);return false}catch(e){return e.code==='size'}`); check(recordBound, "reply reservation rejects near-full record before dispatch");
  const massive = await Promise.all(Array.from({ length: 33 }, (_, i) => fixtureSession(700 + i, 49, 16000, "medium", 3800)));
  let total = massive.reduce((sum, value) => sum + byteSize(value), 0);
  check(total < ASSISTANT_LIMITS.databaseBytes, "large aggregate fixture is initially below 32 MiB");
  // Fill the remaining space with a valid record so the next reply reservation crosses 32 MiB.
  const slack = ASSISTANT_LIMITS.databaseBytes - total; const pairs = Math.max(1, Math.ceil(slack / 18000));
  let filler = await fixtureSession(799, pairs, Math.min(16000, Math.max(100, Math.floor(slack / pairs) - 1300)), "medium", 20);
  while (byteSize(filler) + total > ASSISTANT_LIMITS.databaseBytes - 20000) {
    filler.messages.filter(m => m.role === "assistant").forEach(m => { m.text = m.text.slice(0, Math.max(7, m.text.length - 100)); }); filler = await sealSession(filler);
  }
  massive.push(filler); total += byteSize(filler); check(ASSISTANT_LIMITS.databaseBytes - total < ASSISTANT_LIMITS.replyReserveBytes, "aggregate leaves less than one reserved reply"); await seed(massive);
  const aggregate = await run("try{await s.beginTurn(crypto.randomUUID(),'No room for a reserved answer','medium',null);return false}catch(e){return e.code==='capacity'}"); check(aggregate, "32-MiB aggregate limit blocks write without eviction"); equal(await run("return (await s.listSessions()).sessions.length"), massive.length, "aggregate rejection retains every saved chat");
  await seed([basic]); await page.reload(); await page.waitForTimeout(600); await page.getByRole("button", { name: `Open chat: ${basic.title}`, exact: true }).click();
  await run(`const db=await raw();await new Promise(r=>{const t=db.transaction('sessions','readwrite');const s=t.objectStore('sessions');const q=s.get('${basic.id}');q.onsuccess=()=>s.put({...q.result,digest:'0'.repeat(64)});t.oncomplete=r});db.close();const channel=new BroadcastChannel('diamond-assistant-invalidation-v1');channel.postMessage({forged:'should never be trusted'});channel.close()`);
  await page.getByText("A saved chat could not be verified.", { exact: false }).waitFor(); check(await page.getByRole("article", { name: "Your message", exact: true }).isVisible(), "corruption preserves last readable visible conversation"); check(await page.getByRole("button", { name: "Send", exact: true }).isDisabled(), "corruption visibly blocks unsafe Send");
  await seed([]); await page.reload(); await page.waitForTimeout(400);
  // The real API executes only the missing-key failure path under the server network deny guard.
  const req = fixtureRequest(); const real = await page.evaluate(async body => { const response = await fetch('/api/diamond-assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')}; }, req);
  equal(real.status, 202, "real dedicated API accepts strict Assistant-only request"); equal(real.cache, "no-store", "API response never cached");
  await page.waitForTimeout(50); const missing = await page.evaluate(async req => (await fetch(`/api/diamond-assistant?jobId=${req.jobId}&sessionId=${req.sessionId}`)).json(), req); equal(missing.status, "failed", "missing-key actual service fails safely without provider call"); check(missing.error.includes("not configured"), "missing-key message is truthful");
  const negatives = await page.evaluate(async req => {
    const post = async (body: unknown, origin?: string) => (await fetch('/api/diamond-assistant',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)})).status;
    return [await post({...req,jobId:crypto.randomUUID(),projectId:'forbidden'}),await post({...req,message:'x'.repeat(256001)}),(await fetch('/api/diamond-assistant?jobId='+req.jobId+'&sessionId=wrong0001')).status];
  }, req); equal(negatives, [400, 400, 404], "real route rejects project field, raw oversize, and wrong session identity");
  equal(blockedRequests, [], "fault proof attempted zero external requests");
  writeFileSync(resolve(output, "result.json"), JSON.stringify({ status: "PASS", assertions, aggregateBytes: total, aggregateSessions: massive.length, realProviderCalls: 0, paidCalls: 0, blockedRequests }, null, 2)); console.log(JSON.stringify({ status: "PASS", assertions: assertions.length }));
} finally { await browser.close(); }
