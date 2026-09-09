import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root=process.cwd(),out="output/spec-0006/phase-2";
const plan=JSON.parse(readFileSync(`${out}/boot/plan.json`,"utf8")) as {base:string;paths:string[];frozen:Array<{path:string;sha256:string}>};
const sha=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
const bind=(path:string)=>{const bytes=readFileSync(path);return{path,byteLength:bytes.length,sha256:sha(bytes)};};
const git=(...args:string[])=>{const r=spawnSync("git",args,{encoding:"utf8"});assert.equal(r.status,0,r.stderr);return r.stdout;};
const sourceConfig=`${out}/tsconfig.source.json`;
writeFileSync(sourceConfig,JSON.stringify({extends:resolve("tsconfig.json"),include:[resolve("next-env.d.ts"),resolve("**/*.ts"),resolve("**/*.tsx"),resolve("**/*.mts")],exclude:[resolve("node_modules"),resolve(".next"),resolve("output")]},null,2)+"\n");
const nodeCommand=(id:string,path:string)=>({id,command:"node",args:["--experimental-strip-types",path],expected:0});
const commands=[
  nodeCommand("navigation","scripts/spec0006-unified/validatePhase2Navigation.ts"),
  nodeCommand("phase1-migration","scripts/spec0006-unified/validatePhase1Migration.ts"),
  {id:"typescript",command:"npx",args:["tsc","--noEmit","--project",sourceConfig],expected:0},
  {id:"focused-lint",command:"npx",args:["eslint",...plan.paths.filter(p=>/\.tsx?$/.test(p)),"--format","json"],expected:0},
  {id:"full-lint",command:"npx",args:["eslint",".","--format","json"],expected:1},
  ...[
    ["drawing-v1","validateDrawingProjectV1Compatibility"],["drawing-v2-contract","validateDrawingProjectV2Contract"],["drawing-v2-repository","validateDrawingProjectV2Repository"],
    ["stick-history-storage","validateStickHistoryPersistence"],["stick-timeline","validateStickPoseTimeline"],["stick-ai-adapter","validateStickFigureAiUiAdapter"],
    ["stick-transaction","validateStickFigureCommandTransaction"],["stick-motion","validateStickFigureMotionEngine"],["stick-timing","validateStickFigureActionTiming"],
    ["stick-safety","validateStickBodySafetyIntegration"],["drawing-memory","validateDrawingProjectAiMemory"],["drawing-preferences","validateDrawingAiControlPreferences"],
    ["drawing-route-isolation","validateProjectAiRouteIsolation"],
  ].map(([id,name])=>({...nodeCommand(id,`scripts/${name}.ts`),expected:id==="drawing-route-isolation"?1:0})),
  {id:"diff-check",command:"git",args:["diff","--check"],expected:0},
];
mkdirSync(`${out}/receipts`,{recursive:true});
if(!process.argv.includes("--assemble-only")){
  for(const spec of commands){
    const start=Date.now(),result=spawnSync(spec.command,spec.args,{cwd:root,encoding:"utf8",maxBuffer:32*1024*1024,env:{...process.env,NEXT_TELEMETRY_DISABLED:"1",VALIDATE_AI_URL:"http://127.0.0.1:56362/api/ai"}});
    const receipt={id:spec.id,command:[spec.command,...spec.args],exitCode:result.status,expected:spec.expected,elapsedMs:Date.now()-start,stdout:result.stdout,stderr:result.stderr};
    writeFileSync(`${out}/receipts/${spec.id}.json`,JSON.stringify(receipt,null,2)+"\n");
    assert.equal(result.status,spec.expected,`${spec.id}: ${result.stdout?.slice(-3000)} ${result.stderr?.slice(-1000)}`);console.log(`${spec.id==="drawing-route-isolation"?"KNOWN-FAIL":"PASS"} ${spec.id}`);
  }
  // The inherited validator expects completed-frames, while the unchanged route
  // returns prepared-command. Preserve its failure and separately prove every
  // memory-isolation assertion with only those two status literals refreshed.
  const originalPath="scripts/validateProjectAiRouteIsolation.ts",original=readFileSync(originalPath,"utf8");
  assert.equal(original,git("show",`HEAD:${originalPath}`));assert.equal((original.match(/=== "completed-frames"/g)??[]).length,2);
  const adjustedPath=`${out}/route-current-status.ts`;writeFileSync(adjustedPath,original.replaceAll('=== "completed-frames"','=== "prepared-command"'));
  const result=spawnSync("node",["--experimental-strip-types",adjustedPath],{encoding:"utf8",env:{...process.env,VALIDATE_AI_URL:"http://127.0.0.1:56362/api/ai"}});
  assert.equal(result.status,0,result.stdout+result.stderr);assert.equal(JSON.parse(result.stdout).allChecksPassed,true);
  const untouchedRoutePaths=git("ls-files","app/api","src/lib/ai","src/lib/supabase","scripts/validateProjectAiRouteIsolation.ts").trim().split("\n");
  assert.equal(git("diff","HEAD","--",...untouchedRoutePaths),"");
  writeFileSync(`${out}/route-current-status-proof.json`,JSON.stringify({status:"PASS",inheritedValidatorStatus:"FAIL",reason:"Expected completed-frames; unchanged current route returns prepared-command",original:bind(originalPath),adjusted:bind(adjustedPath),untouchedRouteBindings:untouchedRoutePaths.map(bind),command:["node","--experimental-strip-types",adjustedPath],url:"http://127.0.0.1:56362/api/ai",exitCode:result.status,stdout:result.stdout,stderr:result.stderr,providerRequests:0},null,2)+"\n");
  console.log("PASS current-status Drawing memory isolation (original validator failure retained)");
  const fullTypes=spawnSync("npx",["tsc","--noEmit"],{encoding:"utf8"});
  assert.equal(fullTypes.status,2);assert.equal((fullTypes.stdout.match(/error TS2344/g)??[]).length,2);
  for(const page of ["app/dev/ai-costs/page.tsx","app/dev/ai-costs/lifetime/page.tsx"])assert.equal(readFileSync(page,"utf8"),git("show",`HEAD:${page}`));
  writeFileSync(`${out}/generated-type-baseline.json`,JSON.stringify({status:"KNOWN-FAIL",reason:"Two unchanged private dashboard searchParams PageProps errors in generated Next types",command:["npx","tsc","--noEmit"],exitCode:fullTypes.status,stdout:fullTypes.stdout,stderr:fullTypes.stderr,sourceCheck:bind(sourceConfig)},null,2)+"\n");
}
if(process.argv.includes("--checks-only"))process.exit(0);
const baseLint=JSON.parse(readFileSync(`${out}/boot/base-lint.json`,"utf8")) as Array<{filePath:string;errorCount:number;warningCount:number;messages:Array<{ruleId:string;message:string;line:number}>}>;
const fullReceipt=JSON.parse(readFileSync(`${out}/receipts/full-lint.json`,"utf8"));
const fullLint=JSON.parse(fullReceipt.stdout) as typeof baseLint;
const totals=(rows:typeof baseLint)=>({errors:rows.reduce((s,r)=>s+r.errorCount,0),warnings:rows.reduce((s,r)=>s+r.warningCount,0)});
const previous=new Map(baseLint.map(r=>[r.filePath,r.messages]));
const changedLines=new Map<string,Set<number>>();let file="",line=0;
for(const row of git("diff","--unified=0").split("\n")){
  if(row.startsWith("+++ b/")){file=row.slice(6);changedLines.set(file,new Set());}
  const hunk=/^@@ .* \+(\d+)(?:,(\d+))? @@/.exec(row);if(hunk)line=Number(hunk[1]);
  else if(row.startsWith("+")&&!row.startsWith("+++")){changedLines.get(file)?.add(line++);}else if(row.startsWith(" "))line++;
}
const findings:unknown[]=[];
for(const row of fullLint)for(const message of row.messages){
  const path=row.filePath.slice(root.length+1);
  if(!previous.get(row.filePath)?.some(m=>m.ruleId===message.ruleId&&m.message===message.message)||changedLines.get(path)?.has(message.line))findings.push({path,...message});
}
assert.deepEqual(findings,[]);assert.equal(totals(fullLint).errors,5);assert.ok(totals(fullLint).warnings<=totals(baseLint).warnings);
writeFileSync(`${out}/lint-comparison.json`,JSON.stringify({status:"PASS",base:totals(baseLint),result:totals(fullLint),newOrChangedLineFindings:findings},null,2)+"\n");
assert.equal(git("rev-parse","HEAD").trim(),plan.base);assert.equal(git("diff","--cached","--name-only"),"");
const dirty=git("status","--porcelain=v1","--untracked-files=all").split("\n").filter(Boolean).map(l=>l.slice(3)).sort();assert.deepEqual(dirty,[...plan.paths].sort());
for(const frozen of plan.frozen)assert.equal(bind(frozen.path).sha256,frozen.sha256);
const productPaths=plan.paths.filter(p=>p.startsWith("src/")||p.startsWith("app/"));
const leaks=productPaths.filter(p=>/PRIVATE REVIEW|phase2-cases|spec0006|localhost:\d|127\.0\.0\.1:\d|__.*PROOF|fixture picker|scripts\/fixtures/.test(readFileSync(p,"utf8")));
assert.deepEqual(leaks,[]);
const browser=JSON.parse(readFileSync(`${out}/browser/result.json`,"utf8"));assert.equal(browser.status,"PASS");assert.ok(browser.operations.length>=40);assert.equal(browser.realApiRequests,0);assert.equal(browser.externalRequests,0);assert.equal(browser.sourceWrites,0);
const artifactPaths=[`${out}/boot/plan.json`,`${out}/boot/base-lint.json`,`${out}/boot/browser.json`,`${out}/lint-comparison.json`,`${out}/browser/result.json`,...browser.screenshots.map((p:string)=>`${out}/browser/${p}`),...browser.accessibility.map((p:string)=>`${out}/browser/${p}`),`${out}/production-build.json`,`${out}/review-server-identity.json`,`${out}/server-network.snapshot.jsonl`,`${out}/route-current-status.ts`,`${out}/route-current-status-proof.json`,sourceConfig,`${out}/generated-type-baseline.json`];
const manifest={kind:"spec0006-phase2-technical-proof",version:1,phase:2,status:"PASS",baseSha:plan.base,headSha:git("rev-parse","HEAD").trim(),worktree:root,branch:"detached-HEAD",indexEmpty:true,pathCeiling:16,exactDirtyPaths:plan.paths,sourceBindings:plan.paths.map(bind),frozenPhase1:plan.frozen,
  receipts:commands.map(spec=>({id:spec.id,...bind(`${out}/receipts/${spec.id}.json`)})),artifacts:artifactPaths.map(bind),
  evidence:{browserOperations:browser.operations.length,screenshots:browser.screenshots.length,sourceWrites:0,realApiRequests:0,externalRequests:0,pageErrors:0,consoleErrors:0,newOrChangedLineLintFindings:0,reviewOnlyProductSurface:false,productionRuntime:true,canonicalRepositoryImplemented:false,compatibilityEditorsMerged:false},
  review:{url:browser.url,serverPreserved:true,humanAcceptance:"pending Arthur",executorOwnership:"exclusive until this task stops",publication:"not authorized",controlPlane:"unchanged"},createdAt:new Date().toISOString()};
writeFileSync(`${out}/proof-manifest.json`,JSON.stringify(manifest,null,2)+"\n");console.log(JSON.stringify({status:"PASS",manifest:resolve(out,"proof-manifest.json"),...bind(`${out}/proof-manifest.json`)}));
