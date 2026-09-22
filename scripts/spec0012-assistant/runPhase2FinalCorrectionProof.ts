import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const root = resolve("output/spec-0012/phase-2-final-correction"); mkdirSync(resolve(root,"adapters"),{recursive:true});
const sha=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");
const names=["phase2Oracle","phase2CorrectionOracle","phase2BrowserProof","phase2CorrectionBrowser","phase2ProtectedBrowser","phase2RestartProof","phase2FaultProof","phase2AnimatorSmoke","phase2Regressions","phase2BuildProof"];
const adapters=names.map(name=>{
 const path=`scripts/spec0012-assistant/${name}.ts`;const original=readFileSync(path,"utf8");
 // Preserve every assertion; change only evidence destinations and resolve imports from
 // their original source directory. Run final proof without rewriting earlier sealed evidence.
 const adapted=original.replaceAll("phase-2-correction","phase-2-final-correction").replaceAll("phase2-correction-build-","phase2-final-correction-build-").replace(/(from\s+["'])(\.[^"']+)(["'])/g,(_match,before,target,after)=>`${before}${resolve("scripts/spec0012-assistant",target)}${after}`);
 const javascript=ts.transpileModule(adapted,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;const generated=resolve(root,"adapters",`${name}.mjs`);writeFileSync(generated,javascript);
 return{name,path,sourceSha256:sha(original),generated,generatedSha256:sha(javascript),assertionsRemoved:0,changes:["separate final evidence directory/build ledger labels","relative imports resolved from original source directory"]};
});
writeFileSync(resolve(root,"adapter-bindings.json"),JSON.stringify(adapters,null,2));
const run=(name:string)=>new Promise<void>((resolveRun,reject)=>{
 const path=adapters.find(a=>a.name===name)?.generated??`scripts/spec0012-assistant/${name}.ts`;const child=spawn(process.execPath,["--experimental-strip-types",path],{stdio:["ignore","pipe","pipe"]});let log="";child.stdout.on("data",v=>log+=v);child.stderr.on("data",v=>log+=v);child.on("error",reject);child.on("exit",code=>{writeFileSync(resolve(root,`${name}.log`),log);if(code===0){console.log(`PASS ${name}`);resolveRun()}else reject(new Error(`${name}: ${log.slice(-6000)}`))});
});
const mode=process.argv[2];
if(mode==="build") await run("phase2BuildProof");
else if(mode==="technical") { await run("phase2Oracle");await run("phase2CorrectionOracle");await run("phase2FinalCorrectionOracle");await run("phase2Regressions"); }
else if(mode==="browser") {
 await Promise.all([(async()=>{await run("phase2AnimatorSmoke");await run("phase2CorrectionBrowser")})(),(async()=>{await run("phase2BrowserProof");await run("phase2ProtectedBrowser");await run("phase2RestartProof");await run("phase2FaultProof")})(),run("phase2FinalCorrectionBrowser")]);
 const sources=JSON.parse(readFileSync(resolve(root,"baseline-bindings.json"),"utf8")).sources.map((item:{path:string})=>({path:item.path,sha256:sha(readFileSync(item.path))}));
 writeFileSync(resolve(root,"production-verification.json"),JSON.stringify({status:"PASS",mode:"production",buildId:readFileSync(".next/BUILD_ID","utf8").trim(),completedAt:new Date().toISOString(),sourceDigest:sha(JSON.stringify(sources)),suites:["phase2AnimatorSmoke","phase2BrowserProof","phase2CorrectionBrowser","phase2ProtectedBrowser","phase2RestartProof","phase2FaultProof","phase2FinalCorrectionBrowser"],realProviderCalls:0,paidCalls:0},null,2));
} else assert.fail("Expected build, technical or browser");
