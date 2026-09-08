import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {closeSync,cpSync,existsSync,mkdirSync,mkdtempSync,openSync,readFileSync,readdirSync,realpathSync,rmSync,symlinkSync,writeFileSync} from "node:fs";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {chromium} from "playwright-core";
import {BASE,OUT,PATHS,SUITES,bind,collectEvidence,git,mutationChecks,sha,validateScope,type Receipt,type Review} from "./validatePhase2NaturalSafetyCorrectionProof.ts";

const ROOT=realpathSync(process.cwd()),DEPENDENCIES=realpathSync(resolve("node_modules"));
const technical=resolve(OUT,"technical"),reviewRoot=resolve(OUT,"review");
mkdirSync(technical,{recursive:true});mkdirSync(reviewRoot,{recursive:true});
const write=(path:string,value:unknown)=>writeFileSync(path,`${JSON.stringify(value,null,2)}\n`);
const environment=()=>{
  const env:NodeJS.ProcessEnv={NODE_ENV:"development",NEXT_TELEMETRY_DISABLED:"1",OPENAI_API_KEY:"",OPENAI_ORG_ID:"",OPENAI_PROJECT_ID:"",SUPABASE_SERVICE_ROLE_KEY:"",NEXT_PUBLIC_SUPABASE_URL:"",NEXT_PUBLIC_SUPABASE_ANON_KEY:""};
  for(const key of ["PATH","TMPDIR","TEMP","TMP","LANG","LC_ALL","SHELL","TERM"])if(process.env[key])env[key]=process.env[key];return env;
};
const run=(id:string,args:string[],cwd=ROOT,guard=true,details:Record<string,unknown>={})=>{
  const sources=PATHS.map(bind);
  const startedAt=new Date().toISOString(),networkPath=guard?`${OUT}/technical/${id}-network.ndjson`:null,env=environment();
  if(networkPath){writeFileSync(networkPath,"");env.NODE_OPTIONS=`--require=${resolve("scripts/spec0001-browser/networkDeny.cjs")}`;env.SPEC0001_NETWORK_LEDGER=resolve(networkPath);env.SPEC0001_REPOSITORY_ROOT=ROOT;}
  console.log(`Running ${id}`);
  const r=spawnSync(process.execPath,args,{cwd,env,encoding:"utf8",maxBuffer:256*1024*1024});
  assert.deepEqual(PATHS.map(bind),sources,`${id}: no source mutation during execution`);
  const receipt:Receipt={id,command:[process.execPath,...args],cwd,startedAt,finishedAt:new Date().toISOString(),exitCode:r.status??-1,stdout:r.stdout??"",stderr:r.stderr??"",networkPath,details:{...details,sources}};write(`${technical}/${id}.json`,receipt);
  assert.equal(receipt.exitCode,id==="full-lint"?1:0,`${id}: ${receipt.stdout}\n${receipt.stderr}`);
  if(networkPath)assert.equal(readFileSync(networkPath,"utf8"),"",`${id}: zero network attempts`);
  if(id==="full-lint")assert.match(receipt.stdout,/77 problems \(5 errors, 72 warnings\)/);
  return receipt;
};
const permanent=()=>{
  const container=mkdtempSync(resolve(tmpdir(),"spec0005-v2-permanent-")),clone=resolve(container,"baseline");
  try{
    git(["clone","--no-hardlinks","--quiet",ROOT,clone],container);assert.equal(git(["rev-parse","HEAD"],clone),BASE);assert.equal(git(["status","--porcelain"],clone),"");
    mkdirSync(resolve(clone,"node_modules"));
    for(const item of readdirSync(DEPENDENCIES)){const src=realpathSync(resolve(DEPENDENCIES,item)),dest=resolve(clone,"node_modules",item);if(item==="next")cpSync(src,dest,{recursive:true});else symlinkSync(src,dest);}
    run("permanent-browser",["--experimental-strip-types","scripts/runSpec0001BrowserProof.ts",`--run-base=${BASE}`],clone,false,{cleanExactBaseClone:true,dirtyImplementationExcluded:true});
    cpSync(resolve(clone,"output/spec-0001/phase-1.5/browser/result.json"),`${technical}/permanent-browser-result.json`);
    cpSync(resolve(clone,"output/spec-0001/phase-1.5/browser"),`${technical}/permanent-browser-artifacts`,{recursive:true});
  }finally{rmSync(container,{recursive:true,force:true});assert.equal(existsSync(container),false);}
};
const allocate=()=>new Promise<number>((done,reject)=>{const server=createServer();server.once("error",reject);server.listen(0,"127.0.0.1",()=>{const address=server.address();assert.ok(address&&typeof address==="object");server.close(error=>error?reject(error):done(address.port));});});
const prepareFramework=()=>{
  // Published deterministic font fixtures and infrastructure-only framework
  // suppression. No application module, route, query, storage or UI is injected.
  const fixture=JSON.parse(readFileSync("scripts/fixtures/spec0001-browser/v1/next-font-google-response.json","utf8"))as {responses:Array<{url:string;family:string;faces:Array<{file:string;subset:string;unicodeRange:string}>}>};
  const responses:Record<string,string>={};
  for(const response of fixture.responses)responses[response.url]=response.faces.map(face=>`/* ${face.subset} */\n@font-face { font-family: '${response.family}'; font-style: normal; font-weight: 100 900; font-display: swap; src: url(${resolve(face.file)}) format('woff2'); unicode-range: ${face.unicodeRange}; }`).join("\n");
  const fonts=`${reviewRoot}/fonts.cjs`,framework=`${reviewRoot}/framework.cjs`;writeFileSync(fonts,`module.exports = ${JSON.stringify(responses)};\n`);
  writeFileSync(framework,`"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require("node:fs"),path=require("node:path"),root=process.env.SPEC0001_REPOSITORY_ROOT,worktree=process.env.SPEC0005_REVIEW_WORKTREE;
const record=(primitive)=>fs.appendFileSync(process.env.SPEC0001_NETWORK_LEDGER,JSON.stringify({result:"suppressed",primitive,target:"framework-only",pid:process.pid})+"\\n");
const versionPath=require.resolve(root+"/node_modules/next/dist/server/dev/hot-reloader-shared-utils.js"),version=require(versionPath);
if(Object.keys(version).sort().join(",")!=="getVersionInfo,matchNextPageBundleRequest")throw new Error("Next version API drift");
require.cache[versionPath].exports={__esModule:true,matchNextPageBundleRequest:version.matchNextPageBundleRequest,getVersionInfo:async()=>{record("next.getVersionInfo");return {installed:require(root+"/node_modules/next/package.json").version,staleness:"unknown"};}};
const telemetryPath=require.resolve(root+"/node_modules/next/dist/telemetry/storage.js"),telemetry=require(telemetryPath);
if(Object.keys(telemetry).join(",")!=="Telemetry")throw new Error("Next telemetry API drift");
class QuietTelemetry extends telemetry.Telemetry {constructor(options){super(options);const original=this.flushDetached;this.flushDetached=function(mode,dir){if(process.env.NEXT_TELEMETRY_DISABLED==="1"&&mode==="dev"&&path.resolve(String(dir||""))===worktree){record("next.telemetry.flushDetached");return;}return original.call(this,mode,dir);};}}
require.cache[telemetryPath].exports={__esModule:true,Telemetry:QuietTelemetry};
`);return {fonts,framework};
};
const startReview=async()=>{
  assert.equal(existsSync(`${reviewRoot}/evidence.json`),false,"Never start a second review root; reuse only this recorder's bound existing process after validation.");
  const {fonts,framework}=prepareFramework(),port=await allocate();assert.notEqual(port,3000);
  const liveLog=`${OUT}/review/live.log`,networkLog=`${OUT}/review/network.ndjson`;writeFileSync(liveLog,"");writeFileSync(networkLog,"");
  const env=environment();Object.assign(env,{NODE_OPTIONS:`--require=${resolve("scripts/spec0001-browser/networkDeny.cjs")} --require=${framework}`,NEXT_FONT_GOOGLE_MOCKED_RESPONSES:fonts,SPEC0001_NETWORK_LEDGER:resolve(networkLog),SPEC0001_REPOSITORY_ROOT:resolve(realpathSync(resolve(DEPENDENCIES,"next")),"..",".."),SPEC0005_REVIEW_WORKTREE:ROOT,DIAMOND_STICK_AI_V1_MODE:""});
  const args=[resolve(DEPENDENCIES,"next/dist/bin/next"),"dev","--webpack","--hostname","127.0.0.1","--port",String(port)],fd=openSync(liveLog,"a");
  const child=spawn(process.execPath,args,{cwd:ROOT,env,detached:true,stdio:["ignore",fd,fd]});closeSync(fd);
  await new Promise<void>((done,reject)=>{child.once("spawn",done);child.once("error",reject);});const pid=child.pid!;child.unref();
  try{
    const url=`http://127.0.0.1:${port}/`;let ready=false;
    for(let i=0;i<120&&!ready;i++){process.kill(pid,0);try{const r=await fetch(url);await r.arrayBuffer();ready=r.status===200;}catch{}if(!ready)await new Promise(done=>setTimeout(done,500));}
    assert.equal(ready,true,"ordinary root ready");
    const socket=spawnSync("lsof",["-nP",`-iTCP:${port}`,"-sTCP:LISTEN","-Fp"],{encoding:"utf8"});assert.equal(socket.status,0);const listenerPid=Number(socket.stdout.split("\n").find(l=>l.startsWith("p"))?.slice(1));
    const browser=await chromium.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true,args:["--disable-background-networking","--disable-component-update","--no-first-run"]});
    const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:"block"}),page=await context.newPage(),requests:Array<{url:string;method:string}>=[],errors:string[]=[];
    try{
      await context.route("**/*",async route=>{const u=new URL(route.request().url());assert.equal(u.hostname,"127.0.0.1","ordinary browser has no non-loopback traffic");requests.push({url:u.href,method:route.request().method()});await route.continue();});
      page.on("pageerror",error=>errors.push(error.message));await page.goto(url,{waitUntil:"networkidle"});
      await page.screenshot({path:`${reviewRoot}/ordinary-root.png`,fullPage:true});
      assert.equal(page.url(),url);assert.equal(errors.length,0);
      assert.equal(await page.getByText("Welcome to Diamond Animator",{exact:true}).count(),1);
      assert.equal(await page.getByText("New Project",{exact:true}).count(),1);
      write(`${reviewRoot}/browser-smoke.json`,{rootUrl:url,requests,errors,storageInjected:false,sourceInjected:false,newMotionReviewed:false,ordinaryRootOnly:true});
    }finally{await context.close();await browser.close();}
    const startupPath=`${OUT}/review/startup.log`,networkPrefixPath=`${OUT}/review/network-startup.ndjson`;cpSync(liveLog,startupPath);cpSync(networkLog,networkPrefixPath);
    const review:Review={url,port,pid,pgid:pid,listenerPid,worktree:ROOT,command:[process.execPath,...args],rootStatus:200,purpose:"ordinary-existing-app-smoke-only",safetyDemonstrated:false,newMotionReviewed:false,liveLog,networkLog,startup:bind(startupPath),networkPrefix:bind(networkPrefixPath),artifacts:[fonts,framework,`${reviewRoot}/ordinary-root.png`,`${reviewRoot}/browser-smoke.json`].map(p=>bind(p.replace(`${ROOT}/`,""))),cleanupCommand:`kill -- -${pid}`,browserSmoke:{result:"passed",openBrowserContexts:0,errors:0,ordinaryRootOnly:true},sourceIdentity:{head:BASE,index:[],sources:PATHS.map(bind)}};
    write(`${reviewRoot}/evidence.json`,review);return review;
  }catch(error){try{process.kill(-pid,"SIGTERM");}catch{}throw error;}
};

validateScope();
for(const suite of SUITES)run(suite,["--experimental-strip-types",`scripts/${suite}.ts`]);
run("typescript",[resolve(DEPENDENCIES,"typescript/bin/tsc"),"--noEmit","--incremental","false"]);
run("scoped-lint",[resolve(DEPENDENCIES,"eslint/bin/eslint.js"),...PATHS.filter(p=>p.endsWith(".ts"))]);
run("full-lint",[resolve(DEPENDENCIES,"eslint/bin/eslint.js"),"."]);
permanent();
if(!existsSync(`${reviewRoot}/evidence.json`))await startReview();
const manifest=await collectEvidence();write(`${OUT}/proof-manifest.json`,manifest);
const mutations=mutationChecks(manifest,await collectEvidence());write(`${OUT}/manifest-mutation-checks.json`,{result:"passed",materialFieldMutations:mutations,sha256:sha(readFileSync(`${OUT}/proof-manifest.json`))});
console.log(JSON.stringify({result:"passed",manifest:bind(`${OUT}/proof-manifest.json`),materialFieldMutations:mutations,reviewUrl:manifest.review.url,cleanupCommand:manifest.review.cleanupCommand},null,2));
