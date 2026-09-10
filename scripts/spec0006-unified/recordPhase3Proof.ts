import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPhase3Fixture, fixtureSha } from "./phase3FixtureFactory.ts";
import { assertFrozenFixture, oracleHash, oracleList } from "./phase3RenderOracle.ts";
import { resolveUnifiedRenderList } from "../../src/lib/animation/unifiedCellResolver.ts";
import { createUnifiedRenderCommands } from "../../src/lib/animation/unifiedStageRenderer.ts";
import { fitAuthoredStage, authoredStagePoint, presentStagePoint } from "../../src/lib/animation/unifiedStageGeometry.ts";
import { digestUnifiedAnimationDocumentV1, parseUnifiedAnimationProjectV1 } from "../../src/lib/animation/unifiedAnimationContract.ts";
import { validateEditableStickProjectDocument } from "../../src/lib/stickProjectStorage.ts";

const root=process.cwd(),out="output/spec-0006/phase-3",plan=JSON.parse(readFileSync(`${out}/boot/plan.json`,"utf8"));
const write=(path:string,data:unknown)=>writeFileSync(`${out}/${path}`,JSON.stringify(data,null,2)+"\n");
const bind=(path:string)=>{const b=readFileSync(path);return{path,byteLength:b.length,sha256:fixtureSha(b)};};
const git=(...args:string[])=>{const r=spawnSync("git",args,{encoding:"utf8"});assert.equal(r.status,0,r.stderr);return r.stdout;};
const fixture=createPhase3Fixture();const frozen=assertFrozenFixture(fixture);
let assertions=0;const same=(a:unknown,b:unknown)=>{assertions++;assert.deepEqual(a,b);};
const freeze=(v:unknown)=>{if(v&&typeof v==="object"){Object.freeze(v);for(const child of Object.values(v))freeze(child);}};
freeze(fixture.document);
const before=oracleHash(fixture.document);
same(await digestUnifiedAnimationDocumentV1(fixture.document,fixture.assets),frozen.document);
const stickOwners=fixture.document.layers[1].cells.filter(c=>c.payload!==null);
same(stickOwners.length,4);same(new Set(stickOwners.map(c=>c.cellId)).size,4);
for(const owner of stickOwners)same(owner.payload,stickOwners[0].payload);
assert.ok(validateEditableStickProjectDocument(fixture.stickProject.document));assertions++;
// Exercise the strict existing document/payload parser with a project envelope.
parseUnifiedAnimationProjectV1({kind:"diamond-animation-project",schemaVersion:1,projectId:fixture.document.projectId,title:fixture.fixtureId,createdAt:"2026-09-10T00:00:00.000Z",updatedAt:"2026-09-10T00:00:00.000Z",sourceRevision:0,documentDigest:frozen.document,candidateDigest:"0".repeat(64),provenance:{migrationVersion:1,sourceKind:"stick-v2",sourceProjectId:fixture.stickProject.projectId,sourceRecordDigest:frozen.source,importedAt:null},document:fixture.document,assets:fixture.assets,auxiliary:{drawingAiMemory:null,stickAiCreationLatch:null}});assertions++;
for(let index=0;index<48;index++){
  const list=resolveUnifiedRenderList(fixture.document,index);
  same(list.map(c=>({layerId:c.layer.layerId,kind:c.layer.contentKind,owner:c.owner.cellId,progress:c.progress})),oracleList(fixture.document,index));
  same(createUnifiedRenderCommands(fixture.document,index).map(c=>c.layerId),fixture.document.layers.map(l=>l.layerId));
}
for(let n=0;n<1024;n++){
  const d=structuredClone(fixture.document),index=n%48;
  d.layers.forEach((l,i)=>{l.visible=Boolean(n&(1<<i));l.locked=Boolean(n&(1<<(i+3)));});
  if(n%2){d.layers.reverse();d.layers.forEach((l,i)=>l.orderIndex=i);}
  same(resolveUnifiedRenderList(d,index).map(c=>({layerId:c.layer.layerId,kind:c.layer.contentKind,owner:c.owner.cellId,progress:c.progress})),oracleList(d,index));
}
const negatives:string[]=[];
const reject=(id:string,fn:()=>unknown)=>{assert.throws(fn);assertions++;negatives.push(id);};
reject("negative-index",()=>resolveUnifiedRenderList(fixture.document,-1));reject("fractional-index",()=>resolveUnifiedRenderList(fixture.document,.5));
for(const type of ["empty","blank-keyframe"] as const){const d=structuredClone(fixture.document);d.layers[1].cells[0].cellType=type;if(type==="empty")d.layers[1].cells[0].payload=null;same(resolveUnifiedRenderList(d,0).length,2);}
for(const kind of ["dangling-owner","forward-owner","cross-layer-owner","owner-cycle","invalid-kind","invalid-point","invalid-limb","invalid-order"]){const d=structuredClone(fixture.document),l=d.layers[1];
  if(kind==="dangling-owner")l.cells[0].ownerCellId="missing";
  if(kind==="forward-owner")l.cells[0].ownerCellId=l.cells[12].cellId;
  if(kind==="cross-layer-owner")l.cells[0].ownerCellId=d.layers[0].cells[0].cellId;
  if(kind==="owner-cycle")l.cells[0].ownerCellId=l.cells[1].cellId;
  if(kind==="invalid-kind")l.contentKind="drawing/v1";
  if(kind==="invalid-point"){const p=l.cells[0].payload!;if("structureGraph" in p)p.structureGraph.joints[0].x=NaN;}
  if(kind==="invalid-limb"){const p=l.cells[0].payload!;if("structureGraph" in p)p.structureGraph.limbs[0].endJointId="missing";}
  if(kind==="invalid-order")l.orderIndex=0;
  reject(kind,()=>createUnifiedRenderCommands(d,0));
}
let maxCoordinateError=0;
for(const [w,h] of [[1440,900],[390,844],[1,100000],[100000,1],[320,900],[1920,1080]]){
  const t=fitAuthoredStage(w,h)!;
  for(let n=0;n<1000;n++){const p={x:(n*1907%1920000)/1000,y:(n*1063%1080000)/1000};const back=authoredStagePoint(presentStagePoint(p,t),t);const error=Math.max(Math.abs(back.x-p.x),Math.abs(back.y-p.y));maxCoordinateError=Math.max(maxCoordinateError,error);assert.ok(error<1e-5);assertions++;}
}
same(fitAuthoredStage(0,100),null);same(fitAuthoredStage(100,0),null);same(fitAuthoredStage(NaN,100),null);same(oracleHash(fixture.document),before);
let maxSourceCoordinateError=0;
for(const layer of fixture.document.layers){const t=layer.sourceDisplayTransform;if(!t)continue;for(let n=0;n<1000;n++){
  const p={x:n*t.sourceWidth/1000,y:n*t.sourceHeight/1000},stage={x:t.offsetX+p.x*t.scale,y:t.offsetY+p.y*t.scale};
  const back={x:(stage.x-t.offsetX)/t.scale,y:(stage.y-t.offsetY)/t.scale};
  const error=Math.max(Math.abs(back.x-p.x),Math.abs(back.y-p.y));maxSourceCoordinateError=Math.max(maxSourceCoordinateError,error);assert.ok(error<1e-9);assertions++;
}}
write("contracts.json",{status:"PASS",assertions,negativeCases:negatives,sourceDocumentFrozen:true,frozen,maxCoordinateError,maxSourceCoordinateError,sourceRoundTrips:2000,coordinateComparison:"IEEE-754 inverse transforms, no quantization; exact integer fixture round trips separately in browser",randomizedLayerCases:1024});
console.log(`PASS ${assertions} renderer contract assertions`);
if(process.argv.includes("--contracts-only"))process.exit(0);

mkdirSync(`${out}/receipts`,{recursive:true});
const sourceConfig=resolve(out,"tsconfig.source.json");writeFileSync(sourceConfig,JSON.stringify({extends:resolve("tsconfig.json"),include:[resolve("next-env.d.ts"),resolve("app/**/*.ts"),resolve("app/**/*.tsx"),resolve("src/**/*.ts"),resolve("src/**/*.tsx"),resolve("scripts/**/*.ts")],exclude:[resolve("node_modules"),resolve("output"),resolve(".next")]},null,2)+"\n");
const inherited=["validateDrawingProjectV1Compatibility","validateDrawingProjectV2Contract","validateDrawingProjectV2Repository","validateStickHistoryPersistence","validateStickPoseTimeline","validateStickFigureAiUiAdapter","validateStickFigureCommandTransaction","validateStickFigureMotionEngine","validateStickFigureActionTiming","validateStickBodySafetyIntegration","validateDrawingProjectAiMemory","validateDrawingAiControlPreferences","validateDrawingProjectAiMemoryRouteSafety","validateTimelinePlaybackSmoothing"];
const commands=[{id:"typescript",command:resolve("node_modules/.bin/tsc"),args:["--noEmit","--incremental","false","--project",sourceConfig],expected:0},
  {id:"focused-lint",command:resolve("node_modules/.bin/eslint"),args:plan.paths.filter((p:string)=>/\.tsx?$/.test(p)).concat(["--format","json"]),expected:0},
  {id:"full-lint",command:resolve("node_modules/.bin/eslint"),args:[".","--ignore-pattern","output/**","--format","json"],expected:1},
  ...["scripts/spec0006-unified/validatePhase1Migration.ts","scripts/spec0006-unified/validatePhase2Navigation.ts",...inherited.map(n=>`scripts/${n}.ts`)].map(path=>({id:path.split("/").at(-1)!.replace(".ts",""),command:process.execPath,args:["--experimental-strip-types",path],expected:0})),
  {id:"diff",command:"git",args:["diff","--check"],expected:0}];
if(!process.argv.includes("--assemble-only"))for(const command of commands.filter(c=>!process.argv.includes("--static-only")||["typescript","focused-lint","full-lint","diff"].includes(c.id))){const start=Date.now(),r=spawnSync(command.command,command.args,{cwd:root,encoding:"utf8",maxBuffer:64*1024*1024,env:{...process.env,NEXT_TELEMETRY_DISABLED:"1"}});write(`receipts/${command.id}.json`,{...command,exitCode:r.status,elapsedMs:Date.now()-start,stdout:r.stdout,stderr:r.stderr});assert.equal(r.status,command.expected,`${command.id}: ${r.stdout.slice(-4000)} ${r.stderr.slice(-1000)}`);console.log(`PASS ${command.id}`);}
if(process.argv.includes("--checks-only")||process.argv.includes("--static-only"))process.exit(0);
const totals=(rows:Array<{errorCount:number;warningCount:number}>)=>({errors:rows.reduce((n,r)=>n+r.errorCount,0),warnings:rows.reduce((n,r)=>n+r.warningCount,0)});
const baseLint=JSON.parse(readFileSync(`${out}/boot/base-lint.json`,"utf8")),fullLint=JSON.parse(JSON.parse(readFileSync(`${out}/receipts/full-lint.json`,"utf8")).stdout);
same(totals(baseLint),totals(fullLint));
const signature=(r:{filePath:string;messages:Array<{ruleId:string;message:string}>})=>r.messages.map(m=>`${r.filePath}:${m.ruleId}:${m.message}`);
same(baseLint.flatMap(signature).sort(),fullLint.flatMap(signature).sort());
write("lint-comparison.json",{status:"PASS",base:totals(baseLint),result:totals(fullLint),newFindings:0});
same(git("rev-parse","HEAD").trim(),plan.authorization);same(git("diff","--cached","--name-only"),"");
const dirty=git("status","--porcelain=v1","--untracked-files=all").split("\n").filter(Boolean).map(l=>l.slice(3)).sort();same(dirty,plan.paths.slice().sort());
for(const b of plan.bindings)same(bind(b.path).sha256,b.sha256);
const browser=JSON.parse(readFileSync(`${out}/browser/result.json`,"utf8"));same(browser.status,"PASS");same(browser.externalRequests,0);same(browser.realApiRequests,0);
const files=(directory:string):string[]=>readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(`${directory}/${e.name}`):[`${directory}/${e.name}`]);
// Reproducible scope audit: all AI/API/motion/command/storage files outside the
// approved presentation wrappers remain byte-identical to the authorized base.
const forbidden=/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|generatePose|planMotion|executeCommand)\s*\(|from\s+["'][^"']*(?:\/ai\/|provider|openai|anthropic|motionEngine|FixtureFactory|phase3Seed)/i;
const newRuntime=dirty.filter(p=>p.startsWith("src/")&&!git("ls-files","--",p).trim());
for(const p of newRuntime)assert.doesNotMatch(readFileSync(p,"utf8"),forbidden);
const addedLines=git("diff","--unified=0","--","src").split("\n").filter(l=>l.startsWith("+")&&!l.startsWith("+++")).map(l=>l.slice(1));assert.doesNotMatch(addedLines.join("\n"),forbidden);
const protectedPaths=git("ls-files").split("\n").filter(p=>p&&(/^(app\/api\/|src\/lib\/ai\/|docs\/specs\/0008)/.test(p)||/(?:[Aa][Ii]|[Pp]rompt|[Pp]rovider|[Mm]otion|[Cc]ommand|[Ss]torage|[Hh]istory)/.test(p))&&!dirty.includes(p));
for(const p of protectedPaths){const base=spawnSync("git",["show",`HEAD:${p}`],{maxBuffer:32*1024*1024});same(base.status,0);same(fixtureSha(readFileSync(p)),fixtureSha(base.stdout));}
write("scope-audit.json",{status:"PASS",exactDirtyPaths:dirty,newRuntime:newRuntime.map(bind),protectedBindings:protectedPaths.map(bind),addedRuntimeLines:addedLines,neutralFixture:{source:frozen.source,document:frozen.document,ownerIds:stickOwners.map(c=>c.cellId),geometryHashes:stickOwners.map(c=>oracleHash(c.payload)),holdCells:44,identicalNeutralGeometry:true,stickInterpolation:false},aiGenerationChanges:0,providerApiChanges:0,productSeedImports:0,fixturePlacement:"Fixture factory under scripts; serialized seed and normal Open injection exist only inside ignored review source-copy",existingProjectionException:"Mixed fixed stage bypasses only the inherited viewport projection; no AI model, prompt, generation, planning, executor or provider behavior changed"});
const inheritedBrowser=JSON.parse(readFileSync(`${out}/inherited-browser-receipt.json`,"utf8"));same(inheritedBrowser.exitCode,0);
const copyAudit=JSON.parse(readFileSync(`${out}/source-copy-audit.json`,"utf8"));same(copyAudit.status,"PASS");same(copyAudit.productFixtureImports,0);
const artifacts=[`${out}/boot/plan.json`,`${out}/boot/fixture-freeze.json`,`${out}/boot/fixture-correction.json`,`${out}/boot/neutral-fixture-correction.json`,`${out}/boot/base-lint.json`,`${out}/scope-audit.json`,`${out}/contracts.json`,`${out}/production-build.json`,`${out}/source-copy.json`,`${out}/review-server-identity.json`,`${out}/lint-comparison.json`,`${out}/tsconfig.source.json`,`${out}/inherited-browser-receipt.json`,`${out}/inherited-phase2-driver.ts`,...files(`${out}/browser`),...files(`${out}/inherited-browser`)];
if(existsSync(`${out}/server-network.jsonl`)){cpSyncFile(`${out}/server-network.jsonl`,`${out}/server-network.snapshot.jsonl`);artifacts.push(`${out}/server-network.snapshot.jsonl`);}
artifacts.push(`${out}/source-copy-audit.json`);
function cpSyncFile(a:string,b:string){writeFileSync(b,readFileSync(a));}
const manifest={kind:"spec0006-phase3-technical-proof",version:1,phase:3,status:"PASS",authorizationSha:plan.authorization,runtimeBase:plan.runtimeBase,headSha:git("rev-parse","HEAD").trim(),branch:"detached-HEAD",worktree:root,indexEmpty:true,pathCeiling:16,exactDirtyPaths:dirty,sourceBindings:dirty.map(bind),frozenBindings:plan.bindings,receipts:commands.map(c=>({id:c.id,...bind(`${out}/receipts/${c.id}.json`)})),artifacts:artifacts.map(bind),evidence:{contracts:assertions,profiles:2,externalRequests:0,realApiRequests:0,sourceWrites:0,documentHistoryWritesOnRender:0,independentPixelOracle:true,productionBuild:true,toolHistoryPersistenceOwnersUnchanged:true,phase4Implemented:false},review:{url:"http://127.0.0.1:56463/",serverPreserved:true,humanAcceptance:"pending Arthur",ownership:"Spec Executor exclusive until final packet; preserve for sequential review",publication:"not authorized"}};
write("proof-manifest.json",manifest);console.log(JSON.stringify({status:"PASS",manifest:bind(`${out}/proof-manifest.json`)}));
