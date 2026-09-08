import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {readFileSync, realpathSync} from "node:fs";
import {resolve, relative} from "node:path";
import {pathToFileURL} from "node:url";

export const BASE = "5d0299a00459d39d6c4bff5eeb345f72c5abde4e";
export const BRANCH = "codex/spec0005-phase2-v2-fresh-safety";
export const OUT = "output/spec-0005/phase-2-natural-safety-correction";
export const PATHS = [
  "scripts/fixtures/spec0005-stick/v2/body-safety-natural-correction-cases.json",
  "scripts/spec0005-stick/recordPhase2NaturalSafetyCorrectionProof.ts",
  "scripts/spec0005-stick/validatePhase2NaturalSafetyCorrectionProof.ts",
  "scripts/validateStickBodyNaturalSafety.ts",
  "scripts/validateStickBodySafetyIntegration.ts",
  "src/lib/ai/stickFigureBodySafety.ts",
  "src/lib/ai/stickFigureCommandExecutor.ts",
  "src/lib/ai/stickFigureMotionEngine.ts",
] as const;
export const SUITES = ["validateStickBodyNaturalSafety", "validateStickBodySafety", "validateStickBodySafetyIntegration",
  "validateStickMotionQualityBaseline", "validateStickFigureAiContracts", "validateStickFigureCommandTransaction",
  "validateStickFigureMotionEngine", "validateStickFigureActionTiming", "validateStickFigureAiUiAdapter",
  "validateStickHistoryPersistence", "validateStickPoseTimeline"] as const;
export const GATES = [...SUITES, "typescript", "scoped-lint", "full-lint", "permanent-browser"] as const;
export const sha = (bytes:string|Buffer) => createHash("sha256").update(bytes).digest("hex");
export const git = (args:string[],cwd=process.cwd()) => {
  const r=spawnSync("git",args,{cwd,encoding:"utf8",maxBuffer:64*1024*1024});assert.equal(r.status,0,r.stderr);return r.stdout.trim();
};
export const bind = (path:string) => {const bytes=readFileSync(resolve(path));return {path,bytes:bytes.length,sha256:sha(bytes)};};
export const dirty = () => [...new Set([...git(["diff","--name-only"]).split("\n"),...git(["ls-files","--others","--exclude-standard"]).split("\n")].filter(Boolean))].sort();
export type Receipt = {id:string;command:string[];cwd:string;startedAt:string;finishedAt:string;exitCode:number;stdout:string;stderr:string;networkPath:string|null;details:Record<string,unknown>};
type Binding=ReturnType<typeof bind>;
export type Review = {url:string;port:number;pid:number;pgid:number;listenerPid:number;worktree:string;command:string[];rootStatus:number;purpose:string;safetyDemonstrated:boolean;newMotionReviewed:boolean;liveLog:string;networkLog:string;startup:Binding;networkPrefix:Binding;artifacts:Binding[];cleanupCommand:string;browserSmoke:Record<string,unknown>;sourceIdentity:{head:string;index:string[];sources:Binding[]}};
const read=<T,>(path:string)=>JSON.parse(readFileSync(resolve(path),"utf8"))as T;
const assertBinding=(b:Binding)=>{assert.equal(relative(process.cwd(),resolve(b.path)),b.path);assert.deepEqual(bind(b.path),b);};
const networkEntries=(path:string)=>readFileSync(path,"utf8").split("\n").filter(Boolean).map(line=>JSON.parse(line)as {result:string;target:string});
export function validateScope(){
  for(const ref of ["HEAD","main","origin/main"])assert.equal(git(["rev-parse",ref]),BASE,`exact ${ref}`);
  assert.equal(git(["branch","--show-current"]),BRANCH);assert.equal(git(["diff","--cached","--name-only"]),"");
  assert.deepEqual(dirty(),[...PATHS]);assert.equal(git(["diff","--check"]),"");assert.equal(git(["diff","--cached","--check"]),"");
}
export async function collectEvidence(){
  validateScope();
  const freeze=read<{base:string;frozenAt:string;sources:Binding[];runtimeBeforeEdits:Binding[];receipt:Binding}>(`${OUT}/oracle-freeze.json`);
  assert.equal(freeze.base,BASE);
  assert.deepEqual(freeze.sources.map(s=>s.sha256),["e81fbdfeba86af216e105af3b1a547521d32d2861683b20e7a8dfc1d4c7185ca","cf5b4ba27a988c2735fcf65f9d1dae92e147975dc17c03225bb604cbb63acbc5"]);
  for(const b of [...freeze.sources,freeze.receipt])assertBinding(b);
  for(const b of freeze.runtimeBeforeEdits){const bytes=spawnSync("git",["show",`${BASE}:${b.path}`],{encoding:"buffer"}).stdout;assert.equal(sha(bytes),b.sha256);assert.equal(bytes.length,b.bytes);}
  const pre=read<{result:string;propertyCandidates:number;mirrors:number}>(freeze.receipt.path);assert.equal(pre.result,"passed");assert.equal(pre.propertyCandidates,10000);assert.equal(pre.mirrors,10000);
  const receipts=GATES.map(id=>{
    const path=`${OUT}/technical/${id}.json`,r=read<Receipt>(path);assert.equal(r.id,id);assert.equal(r.command[0],process.execPath);
    assert.deepEqual(r.details.sources,PATHS.map(bind),`${id}: executed exact final source bytes`);
    assert.ok(Date.parse(r.startedAt)>=Date.parse(freeze.frozenAt)&&Date.parse(r.finishedAt)>=Date.parse(r.startedAt));
    assert.equal(r.exitCode,id==="full-lint"?1:0,`${id} exit`);
    if(id==="full-lint")assert.match(r.stdout,/77 problems \(5 errors, 72 warnings\)/);
    if(id==="scoped-lint")assert.equal(r.stdout.trim(),"");
    if(SUITES.includes(id as typeof SUITES[number]))assert.deepEqual(r.command.slice(1),["--experimental-strip-types",`scripts/${id}.ts`]);
    if(r.networkPath){assert.ok(r.networkPath.startsWith(`${OUT}/technical/`));assert.deepEqual(networkEntries(r.networkPath),[],`${id}: no network or provider attempts`);}
    return {id,receipt:bind(path),network:r.networkPath?bind(r.networkPath):null};
  });
  const integration=JSON.parse(read<Receipt>(`${OUT}/technical/validateStickBodySafetyIntegration.json`).stdout) as {result:string;propertyCandidates:number;mirroredCandidates:number;v2:{propertyCandidates:number;mirroredCandidates:number;accepted:number;rejected:number;stationaryHoldPreviewApply:boolean;fixed:Array<{id:string;qualification:{reason:string;stage:string}|null}>}};
  assert.equal(integration.result,"passed");assert.equal(integration.propertyCandidates,10000);assert.equal(integration.mirroredCandidates,10000);
  assert.equal(integration.v2.propertyCandidates,10000);assert.equal(integration.v2.mirroredCandidates,10000);assert.equal(integration.v2.accepted,5000);assert.equal(integration.v2.rejected,5000);assert.equal(integration.v2.stationaryHoldPreviewApply,true);
  assert.equal(integration.v2.fixed.length,32);
  assert.deepEqual(integration.v2.fixed.find(c=>c.id==="later-active-zero-hip-foot-chord")?.qualification,{reason:"branch_singularity",stage:"important_pose"});
  assert.deepEqual(integration.v2.fixed.find(c=>c.id==="later-active-parallel-knee-guide")?.qualification,{reason:"facing_projection",stage:"important_pose"});
  const permanent=read<{status:string;headCommit:string;runBaseline:{baselineCommit:string};network:{nonLoopbackAttempts:number;realApiRouteRequests:number;policyViolations:unknown[]};cleanup:{status:string;openBrowserContexts:number;openServers:number;residualPorts:number;anchorRestored:boolean}}>(`${OUT}/technical/permanent-browser-result.json`);
  assert.equal(permanent.status,"passed");assert.equal(permanent.headCommit,BASE);assert.equal(permanent.runBaseline.baselineCommit,BASE);
  assert.equal(permanent.network.nonLoopbackAttempts,0);assert.equal(permanent.network.realApiRouteRequests,0);assert.deepEqual(permanent.network.policyViolations,[]);
  assert.equal(permanent.cleanup.status,"passed");assert.equal(permanent.cleanup.openBrowserContexts,0);assert.equal(permanent.cleanup.openServers,0);assert.equal(permanent.cleanup.residualPorts,0);assert.equal(permanent.cleanup.anchorRestored,true);
  const review=read<Review>(`${OUT}/review/evidence.json`),url=new URL(review.url);
  assert.equal(url.hostname,"127.0.0.1");assert.equal(url.port,String(review.port));assert.notEqual(review.port,3000);assert.equal(url.pathname,"/");assert.equal(url.search,"");assert.equal(url.hash,"");
  assert.equal(review.worktree,realpathSync(process.cwd()));assert.equal(review.rootStatus,200);assert.equal(review.purpose,"ordinary-existing-app-smoke-only");assert.equal(review.safetyDemonstrated,false);assert.equal(review.newMotionReviewed,false);
  assert.deepEqual(review.sourceIdentity,{head:BASE,index:[],sources:PATHS.map(bind)});
  assert.equal(review.cleanupCommand,`kill -- -${review.pgid}`);assert.equal(review.pid,review.pgid);
  for(const b of [review.startup,review.networkPrefix,...review.artifacts])assertBinding(b);
  assert.equal(sha(readFileSync(review.liveLog).subarray(0,review.startup.bytes)),review.startup.sha256);
  assert.equal(sha(readFileSync(review.networkLog).subarray(0,review.networkPrefix.bytes)),review.networkPrefix.sha256);
  assert.ok(networkEntries(review.networkLog).every(e=>e.result==="suppressed"||e.result==="allowed"&&(e.target.includes("127.")||e.target.includes("::1")||e.target==="next-internal-node-child")));
  for(const pid of [review.pid,review.listenerPid]){
    const p=spawnSync("ps",["-ww","-o","pgid=","-p",String(pid)],{encoding:"utf8"});assert.equal(p.status,0);assert.equal(Number(p.stdout.trim()),review.pgid);
  }
  const cwd=spawnSync("lsof",["-a","-p",String(review.listenerPid),"-d","cwd","-Fn"],{encoding:"utf8"});assert.ok(cwd.stdout.includes(`n${review.worktree}`));
  const listeners=spawnSync("lsof",["-nP",`-iTCP:${review.port}`,"-sTCP:LISTEN","-Fp","-Fn"],{encoding:"utf8"});assert.ok(listeners.stdout.includes(`p${review.listenerPid}`)&&listeners.stdout.includes(`n127.0.0.1:${review.port}`));
  const root=await fetch(review.url);assert.equal(root.status,200);await root.arrayBuffer();
  return {
    version:2,status:"technical-pass-implementation-review-pending",role:"Spec Executor",phase:"SPEC-0005 Phase 2 v2",base:BASE,head:BASE,branch:BRANCH,index:[],worktree:realpathSync(process.cwd()),
    exclusiveOwnership:"Spec Executor; transfer not authorized",dirtyPaths:[...PATHS],sources:PATHS.map(bind),
    specification:{commit:BASE,file:bind("docs/specs/0005-professional-shared-stick-motion-engine.md")},
    historical:{acceptedV1ManifestSha256:"e8a3fbbbb1a1cdf63e5d3648422def4736a4a1bf212ecc27335d2aa842db7874",acceptedV1Bytes:17520,earlierNonAcceptanceManifestSha256:"ea7ab9c5a142843b109ad49924f4709660347265099740312a666eca07972cd4",verification:"immutable published control-plane references; historical manifests not regenerated or rerun",fixture:bind("scripts/fixtures/spec0005-stick/v2/body-safety-cases.json")},
    oracle:{freeze:bind(`${OUT}/oracle-freeze.json`),preRuntime:freeze.receipt,provenance:"Analytical handwritten cases and independent oracle frozen before runtime edits; no rejected executor input reused.",seed:50052026,
      supplementalChecks:"Integration adds two-moving-step projected-transition duration, whole-body band edges, through-front turns and transaction attacks. Frozen oracle bytes remain unchanged.",
      ownerLabelClarification:"The frozen declared-release construction also declares step semantics and is byte-identical to non-support-step; its actual semantic owner is Phase 6. A separately executed pure release verifies Phase 4. Catalogue owner labels do not override identical structured inputs."},
    commandOrder:[...GATES],receipts,integration,permanent:{evidence:bind(`${OUT}/technical/permanent-browser-result.json`),execution:"clean isolated exact-base clone; dirty implementation excluded",network:permanent.network,cleanup:permanent.cleanup},
    sourceFlow:["qualifyStickBodySafetyCandidateSequencesV2","test-local selection/bake","finalizeStickBodySafetyCandidateV2","finalizeStickSpec0005MotionCandidate","frozen request-bound Preview","atomic same-candidate Apply"],
    review:{evidence:bind(`${OUT}/review/evidence.json`),...review},
    claims:{falseAccepts:0,falseRejects:0,humanNaturalnessAccepted:false,newMotionReviewed:false,visibleSafetyProof:false,laterPhasesEnabled:false,providerRequests:0,externalRequests:0},
    cleanup:{permanentTester:"passed",review:"one ordinary root retained for owner smoke",command:review.cleanupCommand},publication:{staged:false,committed:false,pushed:false,published:false,controlPlaneEdited:false},
  };
}
type Json=string|number|boolean|null|Json[]|{[key:string]:Json};
export function mutationChecks(manifest:unknown,expected:unknown){
  assert.deepEqual(manifest,expected);let count=0;
  const walk=(value:Json,path:Array<string|number>)=>{
    if(value!==null&&typeof value==="object"){
      if(path.length){
        const mutated=structuredClone(manifest)as Json;let target=mutated as Record<string|number,Json>;
        for(const key of path.slice(0,-1))target=target[key]as Record<string|number,Json>;
        target[path.at(-1)!]=Array.isArray(value)?[...value,"unexpected"]:{...value,unexpected:true};
        assert.throws(()=>assert.deepEqual(mutated,expected));count++;
      }
      for(const [key,item]of Object.entries(value))walk(item,[...path,Array.isArray(value)?Number(key):key]);
    }else{
      const mutated=structuredClone(manifest)as Json;let target=mutated as Record<string|number,Json>;
      for(const key of path.slice(0,-1))target=target[key]as Record<string|number,Json>;
      target[path.at(-1)!]=typeof value==="number"?value+1:typeof value==="boolean"?!value:value===null?"mutated":`${value}#mutated`;
      assert.throws(()=>assert.deepEqual(mutated,expected));count++;
    }
  };
  walk(manifest as Json,[]);
  assert.throws(()=>assert.deepEqual({...manifest as object,unexpected:true},expected));count++;
  return count;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const path=`${OUT}/proof-manifest.json`,bytes=readFileSync(path),expectedHash=process.argv.find(a=>a.startsWith("--expected-sha256="))?.split("=")[1];
  if(expectedHash)assert.equal(sha(bytes),expectedHash);
  const expected=await collectEvidence(),mutations=mutationChecks(JSON.parse(bytes.toString()),expected);
  console.log(JSON.stringify({result:"passed",sha256:sha(bytes),bytes:bytes.length,materialFieldMutations:mutations,indexEmpty:true,exactDirtyPaths:dirty()},null,2));
}
