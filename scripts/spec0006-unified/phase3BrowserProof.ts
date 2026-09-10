/* eslint-disable @typescript-eslint/no-explicit-any -- isolated browser proof instrumentation */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, symlinkSync } from "node:fs";
import { resolve } from "node:path";
import { cpus, totalmem, release } from "node:os";
import { chromium, type Page } from "playwright-core";
import { createPhase3Fixture, fixtureSha } from "./phase3FixtureFactory.ts";
import { assertFrozenFixture, paintReference } from "./phase3RenderOracle.ts";

const root=process.cwd(),out=resolve("output/spec-0006/phase-3"),copy=resolve(out,"review-app"),port=56463,url=`http://127.0.0.1:${port}/`;
mkdirSync(out,{recursive:true});
const fixture=createPhase3Fixture();assertFrozenFixture(fixture);
const write=(name:string,value:unknown)=>writeFileSync(resolve(out,name),JSON.stringify(value,null,2)+"\n");
const bind=(path:string)=>{const b=readFileSync(path);return{path,bytes:b.length,sha256:fixtureSha(b)};};

if(process.argv.includes("--prepare")){
  // One ignored source copy, exclusively within the executor's worktree. It is
  // always made from the current accepted-to-test source, never rejected bytes.
  mkdirSync(copy,{recursive:true});
  for(const name of ["app","src","public","package.json","package-lock.json","tsconfig.json","next.config.ts","postcss.config.mjs"]){if(existsSync(name))cpSync(name,resolve(copy,name),{recursive:true});}
  if(!existsSync(resolve(copy,"node_modules")))symlinkSync(resolve(root,"node_modules"),resolve(copy,"node_modules"));
  const injections:Array<{path:string;before:string;after:string}>=[];
  const inject=(path:string,patch:(text:string)=>string)=>{const target=resolve(copy,path),before=readFileSync(target,"utf8"),after=patch(before);assert.notEqual(after,before);writeFileSync(target,after);injections.push({path,before:fixtureSha(before),after:fixtureSha(after)});};
  const transport=JSON.stringify(fixture);
  writeFileSync(resolve(copy,"src/lib/animation/phase3Seed.ts"),`import type {WorkspaceCandidate} from './unifiedWorkspaceBootstrap';\nimport {digestUnifiedAnimationDocumentV1} from './unifiedAnimationContract';\nexport const seed = ${transport};\nexport const seededEntry={id:'phase3-seed',locator:'phase3-seed',title:seed.fixtureId,updatedAt:'2026-09-10T00:00:00.000Z',classification:'canonical' as const,sourceKind:'stick-v2' as const,sourceId:seed.document.projectId,sourceDigest:null,candidateDigest:'seed',error:null,protectedSource:false};\nexport async function seededWorkspace():Promise<WorkspaceCandidate>{const document=structuredClone(seed.document);const assets=seed.assets;const resolvedAssets=seed.resolvedAssets.map(a=>({assetId:a.assetId,bytes:Uint8Array.from(atob(a.base64),c=>c.charCodeAt(0))}));return {id:document.projectId,title:seed.fixtureId,digest:await digestUnifiedAnimationDocumentV1(document as never,assets as never),document:document as never,migration:{project:{assets} as never,resolvedAssets},editor:{kind:'stick',project:structuredClone(seed.stickProject) as never}};}\n`);
  inject("src/components/open-project/OpenProjectBrowser.tsx",s=>s.replace('import { useEffect,',`import {seededEntry} from '@/src/lib/animation/phase3Seed';\nimport { useEffect,`).replace("setEntries(collection);",`setEntries((() => {try {return localStorage.getItem("da_phase3_proof_seed") === "off";} catch {return true;}})() ? collection : [seededEntry, ...collection]);`));
  inject("src/lib/animation/unifiedWorkspaceBootstrap.ts",s=>`import {seededWorkspace} from './phase3Seed';\n${s}`.replace("  const { candidate, source } = await readCollectionCandidate(reader, entry);","  if(entry.id === 'phase3-seed') return seededWorkspace();\n  const { candidate, source } = await readCollectionCandidate(reader, entry);"));
  // Proof accounting has no UI and exists only in this ignored build. Exposing
  // the actual renderer lets independent browser tests exercise faults without
  // inserting a product debug hook or changing the authored root.
  inject("src/components/workspace/UnifiedAnimationStage.tsx",s=>s.replace('setError(false); presented.current?.(receipt, current);',`setError(false); presented.current?.(receipt, current);\n      const proofWindow=window as unknown as {__phase3?:any};\n      const prior=proofWindow.__phase3;\n      const textPixels=canvas.current!.getContext("2d")!.getImageData(80,70,780,80).data; let textInk=0; for(let i=0;i<textPixels.length;i+=4) if(textPixels[i]===48&&textPixels[i+1]===78&&textPixels[i+2]===80)textInk++;\n      proofWindow.__phase3={renderer:current,document,assets,resolvedAssets,receipts:[...(prior?.receipts??[]),{...receipt,at:performance.now(),textInk}].slice(-5000),makeRenderer:(canvas:HTMLCanvasElement,a:any=assets,r:any=resolvedAssets)=>new UnifiedStageRenderer(canvas,a,r)};`));
  inject("src/components/workspace/stickfigure/StickFigureWorkspace.tsx",s=>s.replace("    workspaceRootRef.current = next;",`    (window as unknown as {__stickProof:unknown}).__stickProof={digest:next.editorRoot.current.documentDigest,undo:next.editorRoot.undo.length,redo:next.editorRoot.redo.length};\n    workspaceRootRef.current = next;`));
  // Suppress API calls in the review build itself, including Arthur's ordinary
  // browser. The canonical product API module is never changed or invoked.
  inject("app/layout.tsx",s=>s.replace('<ScrollbarActivity />',`<script dangerouslySetInnerHTML={{__html:${JSON.stringify("(()=>{const original=window.fetch;window.fetch=(input,init)=>{const u=new URL(typeof input==='string'?input:input.url,location.href);if(u.origin!==location.origin||u.pathname.startsWith('/api/'))return Promise.resolve(new Response(JSON.stringify({available:false,reason:'offline review'}),{status:200,headers:{'Content-Type':'application/json'}}));return original(input,init);};})();")}}} /><ScrollbarActivity />`));
  const fontSpec=JSON.parse(readFileSync("scripts/fixtures/spec0001-browser/v1/next-font-google-response.json","utf8"));
  const responseMap:Record<string,string>={};
  for(const r of fontSpec.responses){responseMap[r.url]=r.faces.map((f:{file:string;sha256:string;subset:string;unicodeRange:string})=>{assert.equal(`sha256:${bind(f.file).sha256}`,f.sha256);return `/* ${f.subset} */\n@font-face { font-family: '${r.family}'; font-style: normal; font-weight: 100 900; font-display: swap; src: url(${resolve(f.file)}) format('woff2'); unicode-range: ${f.unicodeRange}; }`;}).join("\n");}
  writeFileSync(resolve(out,"font-responses.cjs"),`module.exports=${JSON.stringify(responseMap)};\n`);
  write("source-copy.json",{source:root,copy,injections,seed:bind(resolve(copy,"src/lib/animation/phase3Seed.ts")),fixtureHash:fixtureSha(transport)});
  const environment={...process.env,NEXT_TELEMETRY_DISABLED:"1",NEXT_FONT_GOOGLE_MOCKED_RESPONSES:resolve(out,"font-responses.cjs"),SPEC0001_NETWORK_LEDGER:resolve(out,"server-network.jsonl"),SPEC0001_REPOSITORY_ROOT:root,NODE_OPTIONS:`--require ${resolve(root,"scripts/spec0001-browser/networkDeny.cjs")}`};
  const receipts=[];
  for(const mode of ["compile","generate"]){const start=Date.now();const result=spawnSync(process.execPath,[resolve(root,"node_modules/next/dist/bin/next"),"build","--webpack","--experimental-build-mode",mode],{cwd:copy,env:environment,encoding:"utf8",maxBuffer:32*1024*1024});const receipt={mode,exitCode:result.status,elapsedMs:Date.now()-start,stdout:result.stdout,stderr:result.stderr};write(`build-${mode}.json`,receipt);receipts.push(receipt);assert.equal(result.status,0,result.stdout+result.stderr);console.log(`PASS production ${mode}`);}
  write("production-build.json",{status:"PASS",receipts});
  console.log(`Prepared ${copy}`);process.exit(0);
}

if(process.argv.includes("--serve")){
  const check=spawnSync("lsof",["-nP",`-iTCP:${port}`,"-sTCP:LISTEN"],{encoding:"utf8"});assert.equal(check.stdout.trim(),"","Review port occupied");
  const child=spawn(process.execPath,[resolve(root,"node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{cwd:copy,stdio:"inherit",env:{...process.env,NEXT_TELEMETRY_DISABLED:"1",SPEC0001_NETWORK_LEDGER:resolve(out,"server-network.jsonl"),SPEC0001_REPOSITORY_ROOT:root,NODE_OPTIONS:`--require ${resolve(root,"scripts/spec0001-browser/networkDeny.cjs")}`}});
  write("review-server-identity.json",{pid:child.pid,parentPid:process.pid,port,cwd:copy,worktree:root,url,source:bind(resolve(out,"source-copy.json"))});
  await new Promise<void>((done)=>child.on("exit",()=>done()));process.exit(0);
}

if(process.argv.includes("--inherited")){
  const source="scripts/spec0006-unified/phase2BrowserProof.ts",driver=resolve(out,"inherited-phase2-driver.ts");
  const text=readFileSync(source,"utf8").replace('"./phase2FixtureFactory.ts"',JSON.stringify(resolve("scripts/spec0006-unified/phase2FixtureFactory.ts"))).replace('"output/spec-0006/phase-2/browser"',JSON.stringify(resolve(out,"inherited-browser"))).replace('localStorage.setItem("da_welcome_seen","1");','localStorage.setItem("da_welcome_seen","1");localStorage.setItem("da_phase3_proof_seed","off");');
  writeFileSync(driver,text);const result=spawnSync(process.execPath,["--experimental-strip-types",driver,`--url=${url}`],{encoding:"utf8",maxBuffer:32*1024*1024});
  write("inherited-browser-receipt.json",{original:bind(source),driver:bind(driver),adjustments:["absolute import/output paths","disable only test-copy fixture seed before write spies"],exitCode:result.status,stdout:result.stdout,stderr:result.stderr});
  assert.equal(result.status,0,result.stdout+result.stderr);console.log("PASS inherited 40-operation browser suite");process.exit(0);
}

/* The proof globals below exist only in the ignored source-copy injection. */
declare global { interface Window { __phase3:any; __stickProof:any; __writes:string[]; __selectionStarted:number; __longTasks:number[]; __dragPoints:Array<{x:number;y:number}> } }
const browser=await chromium.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:!process.argv.includes("--headed"),args:["--disable-background-networking","--disable-component-update","--disable-sync","--disable-extensions","--no-first-run","--js-flags=--expose-gc"]});
const errors:string[]=[],requests:Array<{path:string;kind:string}>=[],screenshots:string[]=[],profiles:unknown[]=[];
const pause=(ms=150)=>new Promise(r=>setTimeout(r,ms));
const shot=async(page:Page,name:string)=>{const path=resolve(out,"browser",`${name}.png`);await page.screenshot({path,fullPage:true});screenshots.push(path);writeFileSync(path.replace(".png",".a11y.txt"),await page.locator("body").ariaSnapshot());};
const receipt=(page:Page)=>page.evaluate(()=>window.__phase3.receipts.at(-1));
const frame=(page:Page,index:number)=>page.getByRole("button",{name:new RegExp(`^Frame ${index+1},`)});
async function select(page:Page,index:number){await frame(page,index).click();await page.waitForFunction(i=>window.__phase3?.receipts.at(-1)?.index===i,index);}
async function open(page:Page){await page.goto(url,{waitUntil:"networkidle"});await page.keyboard.press("Escape");await page.getByRole("button",{name:/^Open Project/}).click();await page.getByRole("button",{name:"Open MIXED-REALISTIC-01",exact:true}).waitFor();const start=Date.now();await page.getByRole("button",{name:"Open MIXED-REALISTIC-01",exact:true}).click();await page.waitForFunction(()=>window.__phase3?.receipts.length>0);return Date.now()-start;}
async function renderFaults(page:Page){
  return page.evaluate(async()=>{
    const proof=window.__phase3,canvas=document.createElement("canvas"),renderer=proof.makeRenderer(canvas);
    const digest=async(c:HTMLCanvasElement)=>{const b=c.getContext("2d")!.getImageData(0,0,1920,1080).data;return [...new Uint8Array(await crypto.subtle.digest("SHA-256",b))].map(v=>v.toString(16).padStart(2,"0")).join("");};
    const doc=structuredClone(proof.document),documentBefore=JSON.stringify(doc);const results=[];
    await renderer.render(doc,0);const baseline=await digest(canvas);
    for(const name of ["missing-asset","invalid-command","adapter-throw"]){
      const bad=structuredClone(doc),work=renderer.work.getContext("2d"),original=work.drawImage;
      if(name==="missing-asset")bad.layers[0].cells[0].payload.bitmapAssetId="absent";
      if(name==="invalid-command")bad.layers[1].cells[0].payload.structureGraph.joints[0].x=NaN;
      if(name==="adapter-throw")work.drawImage=()=>{throw new Error("injected-adapter-failure");};
      let rejected=false;try{await renderer.render(bad,0);}catch{rejected=true;}finally{work.drawImage=original;}
      const unchanged=baseline===await digest(canvas);if(!rejected||!unchanged)throw new Error(`Fault not atomic: ${name}`);results.push({name,rejected,unchanged});
    }
    const broken=new TextEncoder().encode("invalid PNG"),brokenHash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",broken))].map(v=>v.toString(16).padStart(2,"0")).join("");
    const brokenAsset={...proof.assets[0],assetId:"broken",byteLength:broken.length,sha256:brokenHash};
    const secondCanvas=document.createElement("canvas"),second=proof.makeRenderer(secondCanvas,[...proof.assets,brokenAsset],[...proof.resolvedAssets,{assetId:"broken",bytes:broken}]);
    await second.render(doc,0);const bad=structuredClone(doc);bad.layers[0].cells[0].payload.bitmapAssetId="broken";
    let rejected=false;try{await second.render(bad,0);}catch{rejected=true;}if(!rejected||await digest(secondCanvas)!==baseline)throw new Error("Decode failure published");results.push({name:"decode-failure",rejected,unchanged:true});second.dispose();
    const hidden=structuredClone(doc);hidden.layers[1].visible=false;await renderer.render(hidden,0);const hiddenDigest=await digest(canvas);if(hiddenDigest===baseline)throw new Error("Hidden layer rendered");results.push({name:"hidden-layer",changed:true});
    const locked=structuredClone(doc);locked.layers.forEach((l:any)=>l.locked=true);await renderer.render(locked,0);if(await digest(canvas)!==baseline)throw new Error("Locked layer disappeared");results.push({name:"locked-layer",unchanged:true});
    const textOnly=structuredClone(doc);textOnly.layers[0].visible=false;textOnly.layers[1].visible=false;textOnly.layers[2].cells[0].payload.bitmapAssetId=null;await renderer.render(textOnly,0);const pixels=canvas.getContext("2d")!.getImageData(70,60,1300,140).data;let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<150)ink++;if(ink<1000)throw new Error("Text-only frame disappeared");results.push({name:"text-only",ink});
    const jobs=Array.from({length:48},(_,i)=>renderer.render(doc,i));const done=await Promise.all(jobs);if(done.filter(Boolean).length!==1||done.at(-1).index!==47)throw new Error("Stale frame publication");results.push({name:"rapid-render",onlyLatestPublished:true});
    await renderer.render(doc,0);const blob=await renderer.snapshot(),bitmap=await createImageBitmap(blob),snapshot=document.createElement("canvas");snapshot.width=1920;snapshot.height=1080;snapshot.getContext("2d")!.drawImage(bitmap,0,0);bitmap.close();if(await digest(snapshot)!==baseline)throw new Error("Snapshot differs from stage");snapshot.width=snapshot.height=0;results.push({name:"shared-snapshot",exact:true});
    if(JSON.stringify(doc)!==documentBefore)throw new Error("Renderer modified source");renderer.dispose();if(renderer.accounting().decodedBytes!==0||renderer.accounting().backingBytes!==0)throw new Error("Dispose retained buffers");results.push({name:"dispose",decodedBytes:0,backingBytes:0});return results;
  });
}
async function manualRoundTrip(page:Page){
  await select(page,0);
  const before=await page.evaluate(()=>({history:window.__stickProof,document:JSON.stringify(window.__phase3.document)}));
  const box=await page.locator('[data-testid="stick-stage"]').boundingBox();assert.ok(box);
  const x=box.x+820/1920*box.width,y=box.y+620/1080*box.height;
  await page.evaluate(()=>{window.__dragPoints=[];const capture=(e:PointerEvent)=>window.__dragPoints.push({x:e.clientX,y:e.clientY});document.addEventListener("pointerdown",capture,{once:true});document.addEventListener("pointerup",capture,{once:true});});
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+16,y-12,{steps:5});await page.mouse.up();
  await page.waitForFunction(d=>window.__stickProof.digest!==d,before.history.digest);
  const changed=await page.evaluate(()=>({history:window.__stickProof,points:window.__dragPoints,joint:window.__phase3.document.layers[1].cells[0].payload.structureGraph.joints.find((j:any)=>j.id==="leftHand")}));
  assert.equal(changed.history.undo,before.history.undo+1);
  const expected={x:820+(changed.points[1].x-changed.points[0].x)*1920/box.width,y:620+(changed.points[1].y-changed.points[0].y)*1080/box.height};
  assert.ok(Math.abs(changed.joint.x-expected.x)<1e-7&&Math.abs(changed.joint.y-expected.y)<1e-7);
  await select(page,1);const held=await page.evaluate(()=>window.__phase3.document.layers[1].cells[0].payload.structureGraph.joints.find((j:any)=>j.id==="leftHand"));assert.deepEqual(held,changed.joint);
  await select(page,12);const independent=await page.evaluate(()=>window.__phase3.document.layers[1].cells[12].payload.structureGraph.joints.find((j:any)=>j.id==="leftHand"));assert.equal(independent.x,820);assert.equal(independent.y,620);
  await page.getByRole("button",{name:"Undo",exact:true}).click();await page.waitForFunction(d=>window.__stickProof.digest===d,before.history.digest);await select(page,0);assert.equal(await page.evaluate(()=>JSON.stringify(window.__phase3.document)),before.document);
  await page.getByRole("button",{name:"Redo",exact:true}).click();await page.waitForFunction(d=>window.__stickProof.digest===d,changed.history.digest);
  await page.getByRole("button",{name:"Undo",exact:true}).click();await page.waitForFunction(d=>window.__stickProof.digest===d,before.history.digest);
  return {pointer:changed.points,expected,actual:changed.joint,oneHistoryEntry:true,heldOwnerEditable:true,independentPoseUnchanged:true,undoRedoExact:true};
}
async function isolatedParity(page:Page){
  return page.evaluate(async({source,fixture})=>{
    const results=[];
    for(const kind of ["drawing/v1","stick-rig/v1"])for(const index of [0,24]){
      const isolated=structuredClone(fixture);isolated.document.layers.forEach(l=>l.visible=l.contentKind===kind);
      const actual=document.createElement("canvas"),reference=document.createElement("canvas"),renderer=window.__phase3.makeRenderer(actual);
      await renderer.render(isolated.document,index);await (0,eval)(`(${source})`)(reference,isolated,index);
      const a=actual.getContext("2d")!.getImageData(0,0,1920,1080).data,b=reference.getContext("2d")!.getImageData(0,0,1920,1080).data;
      let mismatches=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])mismatches++;
      if(mismatches)throw new Error(`Isolated parity ${kind}: ${mismatches}`);
      results.push({kind,index,mismatches});renderer.dispose();reference.width=reference.height=0;
    }return results;
  },{source:paintReference.toString(),fixture});
}
mkdirSync(resolve(out,"browser"),{recursive:true});
try{
  for(const profile of [{name:"desktop",width:1440,height:900,dpr:1},{name:"compact",width:390,height:844,dpr:2}]){
    const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},deviceScaleFactor:profile.dpr,serviceWorkers:"block"});
    await context.route("**/*",async route=>{const u=new URL(route.request().url());const allowed=u.origin===new URL(url).origin&&!u.pathname.startsWith("/api/");requests.push({path:u.pathname,kind:allowed?"loopback":"blocked"});if(allowed)await route.continue();else await route.abort();});
    await context.addInitScript(()=>{localStorage.setItem("da_welcome_seen","1");window.__writes=[];const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){window.__writes.push(`local:${k}`);return set.call(this,k,v);};for(const k of ["put","add","delete","clear"] as const){const original=IDBObjectStore.prototype[k];Object.defineProperty(IDBObjectStore.prototype,k,{value:function(this:IDBObjectStore,...args:unknown[]){window.__writes.push(`idb:${k}`);return Reflect.apply(original,this,args);}});}});
    await context.addInitScript(()=>{window.__longTasks=[];new PerformanceObserver(list=>window.__longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:"longtask",buffered:true});document.addEventListener("click",e=>{if((e.target as HTMLElement).closest('button[aria-label^="Frame "]'))window.__selectionStarted=performance.now();},true);});
    const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
    await page.bringToFront();
    const cdp=await context.newCDPSession(page);await cdp.send("Performance.enable");
    const opens:number[]=[];
    for(let run=0;run<6;run++){const ms=await open(page);if(run)opens.push(ms);}
    await shot(page,`${profile.name}-mixed-paused`);
    const initial=await page.evaluate(()=>({history:window.__stickProof,document:JSON.stringify(window.__phase3.document),writes:window.__writes.slice()}));
    assert.deepEqual(JSON.parse(initial.document),fixture.document,"Review app must contain the current frozen neutral fixture");
    const comparisons=[];
    for(const index of [0,12,13,18,23,24,36,47]){
      await select(page,index);
      const expected=await page.evaluateHandle(async({source,fixture,index})=>{const canvas=document.createElement("canvas");await (0,eval)(`(${source})`)(canvas,fixture,index);return canvas;},{source:paintReference.toString(),fixture,index});
      const pixels=await expected.evaluate(reference=>{const actual=document.querySelector<HTMLCanvasElement>('canvas[aria-label="Animation stage"]')!;const a=actual.getContext("2d")!.getImageData(0,0,1920,1080).data,b=reference.getContext("2d")!.getImageData(0,0,1920,1080).data;let mismatches=0,maxDelta=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d){mismatches++;maxDelta=Math.max(maxDelta,d);}}return{mismatches,maxDelta};});
      comparisons.push({index,...pixels});assert.equal(pixels.mismatches,0,JSON.stringify({profile:profile.name,index,pixels}));await expected.dispose();
    }
    await select(page,0);
    const layout=await page.evaluate(()=>{const c=document.querySelector('canvas[aria-label="Animation stage"]')!,r=c.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,overflow:document.documentElement.scrollWidth>innerWidth,backing:[(c as HTMLCanvasElement).width,(c as HTMLCanvasElement).height]};});
    assert.ok(layout.width>=260&&layout.height>=146,JSON.stringify(layout));assert.equal(layout.overflow,false);assert.deepEqual(layout.backing,[1920,1080]);
    const resize=[];
    for(const [width,height] of [[900,650],[390,844],[1600,500],[320,900],[1440,900],[profile.width,profile.height]]){await page.setViewportSize({width,height});await pause();const r=await receipt(page);resize.push({width,height,index:r.index,backing:await page.locator('canvas[aria-label="Animation stage"]').evaluate((c:HTMLCanvasElement)=>[c.width,c.height])});assert.deepEqual(resize.at(-1)!.backing,[1920,1080]);}
    const dprChanges=[];
    const backingDigest=()=>page.locator('canvas[aria-label="Animation stage"]').evaluate(async(c:HTMLCanvasElement)=>({backing:[c.width,c.height],sha:[...new Uint8Array(await crypto.subtle.digest("SHA-256",c.getContext("2d")!.getImageData(0,0,1920,1080).data))].join(",")}));
    const stable=await backingDigest();
    for(const dpr of [1,2,3,profile.dpr]){await cdp.send("Emulation.setDeviceMetricsOverride",{width:profile.width,height:profile.height,deviceScaleFactor:dpr,mobile:false});await pause();assert.equal(await page.evaluate(()=>devicePixelRatio),dpr);assert.deepEqual(await backingDigest(),stable);dprChanges.push({dpr,backingStable:true});}
    for(let n=0;n<20;n++)await page.setViewportSize({width:profile.width+n%2*10,height:profile.height+n%2*10});
    await page.setViewportSize({width:profile.width,height:profile.height});await pause();assert.deepEqual(await backingDigest(),stable);
    const stage=page.locator('[data-testid="stick-stage"]');
    const hostStyle=await stage.evaluate(el=>{const host=el.parentElement!;const style=host.getAttribute("style");host.style.width="0px";host.style.height="0px";return style;});await pause();
    assert.deepEqual(await backingDigest(),stable);
    await stage.evaluate((el,style)=>el.parentElement!.setAttribute("style",style??""),hostStyle);await pause();assert.deepEqual(await backingDigest(),stable);
    await shot(page,`${profile.name}-resized`);
    const playbackRuns=[];
    for(let run=0;run<6;run++){
      await select(page,0);const startCount=await page.evaluate(()=>window.__phase3.receipts.length-1);
      await page.getByRole("button",{name:"Play",exact:true}).click();
      await page.waitForFunction(start=>{const rows=window.__phase3.receipts.slice(start);return rows.some((r:any)=>r.index===47)&&rows.at(-1)?.index===0;},startCount,{timeout:15000});
      await page.getByRole("button",{name:"Pause",exact:true}).click();
      const ticks=await page.evaluate(start=>window.__phase3.receipts.slice(start),startCount);
      const sequence=ticks.filter((r:any,i:number)=>i===0||r.index!==ticks[i-1].index);const last=sequence.findIndex((r:any)=>r.index===47);assert.ok(last>=0);assert.deepEqual(sequence.slice(0,last+1).map((r:any)=>r.index),Array.from({length:48},(_,i)=>i));assert.equal(sequence[last+1].index,0);
      assert.ok(sequence.every((r:any)=>r.textInk>1000),"Playback lost text");
      const intervals=sequence.slice(1).map((r:any,i:number)=>r.at-sequence[i].at);const onTime=intervals.filter((ms:number)=>ms>=1000/12*.5&&ms<=1000/12*1.75).length/intervals.length;assert.ok(onTime>=.95,`play timing ${onTime}`);
      if(run)playbackRuns.push({ticks:sequence,onTime});console.log(`PASS ${profile.name} playback run ${run}: ${(onTime*100).toFixed(1)}% on time`);
    }
    await shot(page,`${profile.name}-after-playback`);
    const renderRuns=[];let peakHeap=0;
    for(let run=0;run<6;run++){
      const settlements:number[]=[];await page.evaluate(()=>{window.__longTasks=[];});
      for(let i=0;i<120;i++){await select(page,i%2?36:12);settlements.push(await page.evaluate(()=>window.__phase3.receipts.at(-1).at-window.__selectionStarted));if(i%20===0){const m=await cdp.send("Performance.getMetrics");peakHeap=Math.max(peakHeap,m.metrics.find((v:{name:string})=>v.name==="JSHeapUsedSize")!.value);}}
      const longTasks=await page.evaluate(()=>window.__longTasks),p95=settlements.slice().sort((a,b)=>a-b)[113];assert.ok(p95<=(profile.name==="compact"?150:100),`selection settle ${p95}`);assert.ok(Math.max(0,...longTasks)<=(profile.name==="compact"?750:500));assert.ok(longTasks.filter((v:number)=>v>100).length<=(profile.name==="compact"?8:5));
      await cdp.send("HeapProfiler.collectGarbage");const m=await cdp.send("Performance.getMetrics"),heap=m.metrics.find((v:{name:string})=>v.name==="JSHeapUsedSize")!.value;assert.ok(heap<=320*1024*1024);if(run)renderRuns.push({settlements,p95,longTasks,heap});console.log(`PASS ${profile.name} selection run ${run}: p95 ${p95.toFixed(1)} ms`);
    }
    assert.ok(peakHeap<=512*1024*1024);
    const final=await page.evaluate(()=>({history:window.__stickProof,document:JSON.stringify(window.__phase3.document),writes:window.__writes.slice(),accounting:window.__phase3.renderer.accounting()}));
    assert.deepEqual(final.history,initial.history);assert.deepEqual(final.writes,initial.writes);
    await select(page,0);assert.equal(await page.evaluate(()=>JSON.stringify(window.__phase3.document)),initial.document);
    await cdp.send("HeapProfiler.collectGarbage");const metrics=await cdp.send("Performance.getMetrics");const heap=metrics.metrics.find((m:{name:string})=>m.name==="JSHeapUsedSize")!.value;assert.ok(heap<=320*1024*1024);assert.ok(final.accounting.peakOwnedBytes<=290838816);assert.ok(final.accounting.decodedBytes+final.accounting.backingBytes<=153713808);
    const faults=await renderFaults(page),isolated=await isolatedParity(page),manual=await manualRoundTrip(page);
    await shot(page,`${profile.name}-manual-round-trip`);
    profiles.push({profile,opens,layout,comparisons,resize,dprChanges,rapidResize:20,zeroSizeRecovered:true,isolated,playbackRuns,playbackOnTime:Math.min(...playbackRuns.map(r=>r.onTime)),renderRuns,heap,peakHeap,nativeGpuBytes:"not exposed by this CDP profile; app-owned decoded/backing bytes accounted separately",accounting:final.accounting,faults,manual,zeroWrites:true,historyStable:true});
    console.log(`PASS ${profile.name}: visible mixed stage, exact pixels, playback, resize, zero writes`);await context.close();
  }
  assert.deepEqual(errors,[]);assert.equal(requests.filter(r=>r.kind==="blocked").length,0);
  write("browser/result.json",{status:"PASS",url,browser:browser.version(),platform:process.platform,machine:{cpu:cpus()[0].model,cores:cpus().length,physicalBytes:totalmem(),osRelease:release()},fixture:assertFrozenFixture(fixture),sourceCopy:bind(resolve(out,"source-copy.json")),neutralOwnersVerified:true,profiles,screenshots,errors,requests,realApiRequests:0,externalRequests:0});
} finally { await browser.close(); }
