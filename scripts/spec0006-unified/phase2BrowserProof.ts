import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Page, type BrowserContext } from "playwright-core";
import { createPhase2Sources } from "./phase2FixtureFactory.ts";

const url = process.argv.find((arg) => arg.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:56362/";
assert.match(url, /^http:\/\/127\.0\.0\.1:(?!3000\/)\d+\/$/);
const output = resolve("output/spec-0006/phase-2/browser"); mkdirSync(output,{recursive:true});
const sources = await createPhase2Sources();
const transport = await Promise.all(sources.map(async (source) => source.sourceKind === "drawing-v2" ? {...source,record:{...source.record,assets:await Promise.all(source.record.assets.map(async (asset)=>({...asset,bytes:Buffer.from(await asset.bytes.arrayBuffer()).toString("base64")})))}} : source));
const operations: string[] = [], screenshots: string[] = [], accessibility: string[] = [];
const requests: Array<{method:string;url:string;disposition:string}> = [];
const pageErrors: string[] = [], consoleErrors: string[] = [];
const storageProof: Array<{id:string;before:unknown;after:unknown;writes:unknown}> = [];
const browser = await chromium.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:!process.argv.includes("--headed"),args:["--disable-background-networking","--disable-component-update","--disable-sync","--disable-extensions","--no-first-run"]});
const pause = (ms = 200) => new Promise((resolveDelay)=>setTimeout(resolveDelay,ms));
const step = async (id:string, run:()=>Promise<void>) => { await run(); operations.push(id); console.log(`PASS ${id}`); };
const shot = async (page:Page,id:string) => { const name=`${id}.png`; await page.screenshot({path:resolve(output,name),fullPage:true});screenshots.push(name);const tree=`${id}.a11y.txt`;writeFileSync(resolve(output,tree),await page.locator("body").ariaSnapshot());accessibility.push(tree); };
const pageStorage = async (page:Page) => page.evaluate(async()=>{
  const hash = async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new Uint8Array(bytes)))).map(v=>v.toString(16).padStart(2,"0")).join("");
  const normalize=async(value:unknown):Promise<unknown>=>{
    if(value instanceof Blob)return{bytes:value.size,mime:value.type,sha:await hash(new Uint8Array(await value.arrayBuffer()))};
    if(ArrayBuffer.isView(value))return{bytes:value.byteLength,sha:await hash(new Uint8Array(value.buffer,value.byteOffset,value.byteLength))};
    if(Array.isArray(value))return Promise.all(value.map(normalize));
    if(value&&typeof value==="object")return Object.fromEntries(await Promise.all(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(async([key,child])=>[key,await normalize(child)])));
    return value;
  };
  const local:Record<string,unknown>={};
  for(const key of ["da_saved_drawing_projects","da_saved_stick_projects_v1"]){const raw=localStorage.getItem(key);local[key]=raw===null?null:{bytes:new TextEncoder().encode(raw).length,sha:await hash(new TextEncoder().encode(raw))};}
  const databases=await indexedDB.databases();const indexed:Record<string,unknown>={};
  for(const info of databases.filter(db=>db.name==="diamond-animator-local")){
    const db=await new Promise<IDBDatabase>((yes,no)=>{const r=indexedDB.open(info.name!);r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error);});
    for(const name of Array.from(db.objectStoreNames)){
      const rows=await new Promise<unknown[]>((yes,no)=>{const r=db.transaction(name,"readonly").objectStore(name).getAll();r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error);});
      const normalized=JSON.stringify(await normalize(rows));indexed[name]={records:rows.length,sha:await hash(new TextEncoder().encode(normalized))};
    }db.close();
  }return{local,indexed};
});
const writes = (page:Page) => page.evaluate(()=>JSON.parse(document.documentElement.dataset.storageWrites ?? "[]") as string[]);
const sourceWrites = async (page:Page) => (await writes(page)).filter((write) => write !== "localStorage.set:da_drawing_ai_control_preferences_v1");
const resetWrites = (page:Page) => page.evaluate(()=>{document.documentElement.dataset.storageWrites="[]";});
const configure = async (context:BrowserContext) => {
  await context.route("**/*",async(route)=>{
    const request=route.request(),u=new URL(request.url());
    const availability=u.origin===new URL(url).origin&&u.pathname==="/api/ai"&&request.method()==="GET";
    const allowed=u.origin===new URL(url).origin&&!u.pathname.startsWith("/api/");
    requests.push({method:request.method(),url:`${u.origin}${u.pathname}`,disposition:availability?"fulfilled-availability":allowed?"loopback":"blocked"});
    if(availability)await route.fulfill({status:200,contentType:"application/json",body:'{"available":false,"reason":"proof-disabled"}'});
    else if(allowed)await route.continue();else await route.abort();
  });
  await context.addInitScript(()=>{
    localStorage.setItem("da_welcome_seen","1");
    const note=(kind:string)=>{if(document.documentElement){const values=JSON.parse(document.documentElement.dataset.storageWrites??"[]");values.push(kind);document.documentElement.dataset.storageWrites=JSON.stringify(values);}};
    const set=Storage.prototype.setItem,remove=Storage.prototype.removeItem,clear=Storage.prototype.clear;
    Storage.prototype.setItem=function(key,value){note(`localStorage.set:${key}`);return set.call(this,key,value);};
    Storage.prototype.removeItem=function(key){note(`localStorage.remove:${key}`);return remove.call(this,key);};
    Storage.prototype.clear=function(){note("localStorage.clear");return clear.call(this);};
    for(const key of ["put","add","delete","clear"] as const){const original=IDBObjectStore.prototype[key];Object.defineProperty(IDBObjectStore.prototype,key,{value:function(this:IDBObjectStore,...args:unknown[]){note(`idb.${key}:${this.name}`);return Reflect.apply(original,this,args);},configurable:true});}
  });
};
const seed = async(page:Page)=>page.evaluate(async(values)=>{
  const drawings=values.filter(s=>s.sourceKind==="drawing-v1").map(s=>"project"in s?s.project:null);
  drawings.push({id:"invalid-drawing",name:"Damaged Drawing project",data:{version:99}} as never);
  localStorage.setItem("da_saved_drawing_projects",JSON.stringify(drawings));
  const sticks=values.filter(s=>s.sourceKind.startsWith("stick")).map(s=>"project"in s?s.project:null);
  localStorage.setItem("da_saved_stick_projects_v1",JSON.stringify({storageVersion:1,projects:sticks}));
  const source=values.find(s=>s.sourceKind==="drawing-v2");if(!source||source.sourceKind!=="drawing-v2")throw new Error("No V2 fixture");
  const record={...source.record,assets:source.record.assets.map(asset=>({...asset,bytes:new Blob([Uint8Array.from(atob(asset.bytes),c=>c.charCodeAt(0))],{type:asset.kind==="raster-png"?"image/png":"audio/wav"})}))};
  const db=await new Promise<IDBDatabase>((yes,no)=>{const r=indexedDB.open("diamond-animator-local",1);r.onupgradeneeded=()=>{for(const [name,keyPath]of [["drawingProjectHeadsV2","projectId"],["drawingProjectVersionsV2",["projectId","storageRevision"]],["drawingProjectPreviewsV1","projectId"],["drawingProjectAuxiliaryV1","projectId"],["drawingProjectLegacyDeleteTombstonesV1","projectId"]]as const)r.result.createObjectStore(name,{keyPath:typeof keyPath==="string"?keyPath:[...keyPath]});};r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error);});
  await new Promise<void>((yes,no)=>{const tx=db.transaction(["drawingProjectHeadsV2","drawingProjectVersionsV2"],"readwrite");tx.objectStore("drawingProjectHeadsV2").put(source.head);tx.objectStore("drawingProjectVersionsV2").put(record);tx.oncomplete=()=>yes();tx.onerror=()=>no(tx.error);});db.close();
},transport);
const holdDigests = (page:Page) => page.evaluateHandle(() => {
  const original = crypto.subtle.digest;
  let unblock!: () => void;
  const gate = new Promise<void>((resolveGate) => { unblock = resolveGate; });
  crypto.subtle.digest = async function(algorithm, data) { await gate; return original.call(this, algorithm, data); };
  return { release() { crypto.subtle.digest = original; unblock(); } };
});
const waitCollection=async(page:Page)=>{await page.getByRole("main",{name:"Projects",exact:true}).waitFor();await page.getByRole("button",{name:"Open Drawing study (V1)",exact:true}).waitFor();await pause();};
const oneRoot=async(page:Page,kind:string)=>{assert.equal(await page.getByRole("region",{name:"Animation workspace",exact:true}).count(),1);assert.equal(await page.locator("[data-editor-kind]").count(),1);assert.equal(await page.locator("[data-editor-kind]").getAttribute("data-editor-kind"),kind);};
const focusName=async(page:Page)=>page.evaluate(()=>document.activeElement?.getAttribute("aria-label")??document.activeElement?.textContent);
const frame= (page:Page,n:number)=>page.getByRole("button",{name:new RegExp(`^Frame ${n},`)});
const home=async(page:Page)=>{await page.reload({waitUntil:"networkidle"});await page.getByRole("button",{name:/^New Project/}).waitFor();};
const assertNoRejectedWorkspaceChrome=async(page:Page)=>{
  assert.equal(await page.getByRole("button",{name:"Home",exact:true}).count(),0);
  assert.equal(await page.getByRole("button",{name:"Open Project",exact:true}).count(),0);
  assert.equal(await page.getByRole("button",{name:"Panels",exact:true}).count(),0);
  assert.equal(await page.getByText("Animation Workspace",{exact:true}).count(),0);
  const geometry=await page.evaluate(()=>{
    const file=[...document.querySelectorAll("button")].find(button=>button.textContent?.trim()==="File");
    if(!file)throw new Error("File button missing");
    let top:HTMLElement|null=file;
    while(top&&!(Math.abs(top.getBoundingClientRect().width-window.innerWidth)<1&&Math.abs(top.getBoundingClientRect().height-44)<1))top=top.parentElement;
    const region=document.querySelector<HTMLElement>('[aria-label="Animation workspace"]');
    const editor=document.querySelector<HTMLElement>('[data-editor-kind]');
    return{top:top?.getBoundingClientRect().top,topHeight:top?.getBoundingClientRect().height,regionTop:region?.getBoundingClientRect().top,editorTop:editor?.getBoundingClientRect().top};
  });
  assert.deepEqual(geometry,{top:0,topHeight:44,regionTop:0,editorTop:0});
};
const assertInheritedCollectionVisuals=async(page:Page,viewport:{width:number;height:number})=>{
  assert.equal(await page.getByRole("button",{name:"Refresh",exact:true}).count(),0);
  assert.equal(await page.getByRole("button",{name:"Drawing",exact:true}).count(),0);
  assert.equal(await page.getByRole("button",{name:"Stick Figure",exact:true}).count(),0);
  for(const label of [/^Legacy(?:\s|·)/,/^Canonical(?:\s|=)/,/^Invalid$/])assert.equal(await page.getByText(label).count(),0);
  const visual=await page.evaluate(()=>{
    const main=document.querySelector<HTMLElement>('[data-open-project-browser="true"]')!;
    const back=[...main.querySelectorAll("button")].find(button=>button.textContent?.trim()==="← Back")!;
    const heading=[...main.querySelectorAll("div")].find(element=>element.textContent?.trim()==="Projects"&&getComputedStyle(element).textTransform==="uppercase")!;
    const card=main.querySelector<HTMLElement>('[data-project-card="true"]')!;
    const mr=main.getBoundingClientRect(),br=back.getBoundingClientRect(),hr=heading.getBoundingClientRect(),cr=card.getBoundingClientRect(),ms=getComputedStyle(main),cs=getComputedStyle(card);
    return{main:{x:mr.x,y:mr.y,width:mr.width,background:ms.backgroundColor,paddingTop:ms.paddingTop,paddingLeft:ms.paddingLeft},back:{x:br.x,y:br.y},headingCenter:hr.x+hr.width/2,card:{x:cr.x,width:cr.width,borderRadius:cs.borderRadius,padding:cs.padding,background:cs.backgroundColor}};
  });
  assert.deepEqual(visual.main,{x:0,y:0,width:viewport.width,background:"rgb(26, 27, 36)",paddingTop:"20px",paddingLeft:"20px"});
  assert.equal(visual.back.x,Math.max(20,(viewport.width-Math.min(1120,viewport.width-40))/2));assert.ok(Math.abs(visual.back.y-23.25)<=0.01,`Back button moved from inherited y=23.25: ${visual.back.y}`);
  assert.ok(Math.abs(visual.headingCenter-viewport.width/2)<=1);
  assert.equal(visual.card.x,Math.max(20,(viewport.width-Math.min(1120,viewport.width-40))/2));assert.equal(visual.card.width,Math.min(1120,viewport.width-40));
  assert.deepEqual({borderRadius:visual.card.borderRadius,padding:visual.card.padding,background:visual.card.background},{borderRadius:"16px",padding:"14px 16px",background:"rgba(255, 255, 255, 0.035)"});
};
try {
  for(const viewport of [{width:1440,height:900,deviceScaleFactor:1},{width:390,height:844,deviceScaleFactor:2}]){
    const compact=viewport.width<640,tag=compact?"compact":"desktop";
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:viewport.deviceScaleFactor,serviceWorkers:"block"});await configure(context);
    const page=await context.newPage();page.on("pageerror",error=>pageErrors.push(error.message));page.on("console",message=>{if(message.type()==="error")consoleErrors.push(message.text());});
    await page.goto(url,{waitUntil:"networkidle"});await seed(page);await resetWrites(page);if(!compact)await shot(page,"desktop-home");
    await step(`${tag}:tutorials-back-focus`,async()=>{await page.getByRole("button",{name:/^Tutorials/}).click();await page.getByRole("button",{name:/Back/}).click();assert.match(await focusName(page)??"",/Tutorials/);});
    await step(`${tag}:open-during-new-bootstrap`,async()=>{
      const gate=await holdDigests(page);
      await page.getByRole("button",{name:/^New Project/}).click();
      await page.getByRole("button",{name:/^Open Project/}).click();
      await gate.evaluate(state=>state.release());await waitCollection(page);
      assert.equal(await page.locator("[data-editor-kind]").count(),0);
      await page.getByRole("button",{name:"← Back",exact:true}).click();
    });
    await step(`${tag}:new-direct-title`,async()=>{await page.getByRole("button",{name:/^New Project/}).click();await page.getByText("Untitled Project",{exact:true}).waitFor();await oneRoot(page,"drawing");assert.equal(await page.getByRole("button",{name:/Drawing Animation|Stick Figure Animation/}).count(),0);await shot(page,`${tag}-new`);});
    await step(`${tag}:workspace-visual-preservation`,async()=>{await assertNoRejectedWorkspaceChrome(page);});
    await step(`${tag}:drawing-tools-history`,async()=>{
      for(const tool of ["Select","Lasso","Brush","Eraser","Fill","Text","Shape","Knife"])assert.equal(await page.getByRole("button",{name:tool,exact:true}).isVisible(),true);
      await page.getByRole("button",{name:"Brush",exact:true}).click();const stage=await page.locator('[data-workspace-stage-guide="camera"]').boundingBox();assert.ok(stage);await page.mouse.move(stage.x+stage.width*.42,stage.y+stage.height*.48);await page.mouse.down();await page.mouse.move(stage.x+stage.width*.6,stage.y+stage.height*.55,{steps:12});await page.mouse.up();await pause(500);
      assert.equal(await page.getByRole("button",{name:"Undo",exact:true}).isEnabled(),true);await page.getByRole("button",{name:"Undo",exact:true}).click();await pause();assert.equal(await page.getByRole("button",{name:"Redo",exact:true}).isEnabled(),true);await page.getByRole("button",{name:"Redo",exact:true}).click();
      await page.getByRole("button",{name:"Play",exact:true}).click();await page.getByRole("button",{name:"Pause",exact:true}).click();
    });
    await home(page);
    await step(`${tag}:open-back-focus`,async()=>{await page.getByRole("button",{name:/^Open Project/}).click();await waitCollection(page);await page.getByRole("button",{name:"← Back",exact:true}).click();assert.match(await focusName(page)??"",/Open Project/);});
    await step(`${tag}:cancel-pending-open`,async()=>{
      await page.getByRole("button",{name:/^Open Project/}).click();await waitCollection(page);
      const gate=await holdDigests(page);await page.getByRole("button",{name:"Open Stick study (V1)",exact:true}).click();
      await page.getByRole("button",{name:"← Back",exact:true}).click();
      await gate.evaluate(state=>state.release());await pause(500);
      assert.equal(await page.locator("[data-editor-kind]").count(),0);assert.equal(await page.getByRole("button",{name:/^New Project/}).isVisible(),true);
    });
    await page.getByRole("button",{name:/^Open Project/}).click();await waitCollection(page);
    await step(`${tag}:combined-collection`,async()=>{assert.equal(await page.locator('[data-project-card="true"]').count(),5);await assertInheritedCollectionVisuals(page,viewport);await shot(page,`${tag}-collection`);});
    await step(`${tag}:invalid-disabled`,async()=>{assert.equal(await page.getByRole("button",{name:"Damaged Drawing project unavailable",exact:true}).isDisabled(),true);assert.equal(await page.getByText("Unavailable",{exact:true}).count(),1);});
    const before=await pageStorage(page);await resetWrites(page);
    for(const title of ["Drawing study (V1)","Drawing study (V2)","Stick study (V1)","Stick study (V2)"]){
      await step(`${tag}:open-${title}`,async()=>{await page.getByRole("button",{name:`Open ${title}`,exact:true}).click();await page.getByText(title,{exact:true}).waitFor();await pause(500);await oneRoot(page,title.startsWith("Drawing")?"drawing":"stick");await assertNoRejectedWorkspaceChrome(page);await shot(page,`${tag}-${title.includes("Drawing")?"drawing":"stick"}-${title.includes("V1")?"v1":"v2"}`);});
      if(title==="Stick study (V2)"&&!compact){
        await step(`${tag}:stick-edit-history-creator`,async()=>{
          await frame(page,1).click();const stage=page.locator('[data-testid="stick-stage"]');const circle=stage.locator('svg circle:not([data-onion-side])').first();const box=await circle.boundingBox();assert.ok(box);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+12,box.y+box.height/2+10,{steps:5});await page.mouse.up();await pause();assert.equal(await page.getByRole("button",{name:"Undo",exact:true}).isEnabled(),true);await page.getByRole("button",{name:"Undo",exact:true}).click();await pause();await page.getByRole("button",{name:"Redo",exact:true}).click();await pause();
          await page.getByRole("button",{name:"Onion",exact:true}).click();await page.getByRole("button",{name:"Play",exact:true}).click();await pause(500);await page.getByRole("button",{name:"Pause",exact:true}).click();await frame(page,1).click();
          await page.getByRole("button",{name:"Stick Figure Tools",exact:true}).click();await page.getByRole("button",{name:"Create New Stick Figure",exact:true}).click();await page.getByRole("button",{name:"Save Stick Figure",exact:true}).waitFor();assert.equal(await page.getByRole("button",{name:"Save Stick Figure",exact:true}).isDisabled(),true);await page.getByRole("button",{name:"Back",exact:true}).click();await page.getByText(title,{exact:true}).waitFor();await oneRoot(page,"stick");
        });
      }
      await home(page);await page.getByRole("button",{name:/^Open Project/}).click();await waitCollection(page);
    }
    const after=await pageStorage(page),observedWrites=await writes(page);assert.deepEqual(after,before);assert.deepEqual(await sourceWrites(page),[]);storageProof.push({id:`${tag}:list-open-editor`,before,after,writes:observedWrites});
    await step(`${tag}:source-change-rejection`,async()=>{await page.evaluate(()=>{const values=JSON.parse(localStorage.getItem("da_saved_drawing_projects")!);values[0].name="Changed after listing";localStorage.setItem("da_saved_drawing_projects",JSON.stringify(values));});await resetWrites(page);const original=await pageStorage(page);await page.getByRole("button",{name:"Open Drawing study (V1)",exact:true}).click();await page.getByText(/could not be opened safely \(source_changed\)/i).waitFor();assert.equal(await page.locator("[data-editor-kind]").count(),0);assert.deepEqual(await pageStorage(page),original);assert.deepEqual(await sourceWrites(page),[]);await page.getByRole("button",{name:"← Back",exact:true}).click();await page.getByRole("button",{name:/^Open Project/}).click();await page.getByRole("button",{name:"Open Changed after listing"}).waitFor();});
    await page.getByRole("button",{name:"← Back",exact:true}).click();await seed(page);await resetWrites(page);await page.getByRole("button",{name:/^Open Project/}).click();await waitCollection(page);
    await step(`${tag}:missing-asset-rejection`,async()=>{await page.evaluate(async()=>{const db=await new Promise<IDBDatabase>(yes=>{const r=indexedDB.open("diamond-animator-local");r.onsuccess=()=>yes(r.result);});await new Promise<void>(yes=>{const tx=db.transaction("drawingProjectVersionsV2","readwrite"),store=tx.objectStore("drawingProjectVersionsV2"),r=store.getAll();r.onsuccess=()=>{const value=r.result[0];value.assets=[];store.put(value);};tx.oncomplete=()=>yes();});db.close();});await resetWrites(page);const original=await pageStorage(page);await page.getByRole("button",{name:"Open Drawing study (V2)",exact:true}).click();await page.getByText(/could not be opened safely/i).waitFor();assert.equal(await page.locator("[data-editor-kind]").count(),0);assert.deepEqual(await pageStorage(page),original);assert.deepEqual(await sourceWrites(page),[]);});
    await page.getByRole("button",{name:"← Back",exact:true}).click();await seed(page);await resetWrites(page);await page.getByRole("button",{name:/^Open Project/}).click();await waitCollection(page);
    await step(`${tag}:double-open-single-editor`,async()=>{await page.getByRole("button",{name:"Open Stick study (V1)",exact:true}).evaluate((button)=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();});await page.getByRole("region",{name:"Animation workspace",exact:true}).waitFor();await oneRoot(page,"stick");});
    await step(`${tag}:inherited-responsive-layout`,async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);for(const name of ["File","Play"]){const rect=await page.getByRole("button",{name,exact:true}).boundingBox();assert.ok(rect&&rect.x>=0&&rect.x<viewport.width&&rect.width>0,`${name} missing from inherited viewport`);}const stage=await page.locator('[data-testid="stick-stage"]').boundingBox(),timeline=await frame(page,1).boundingBox();assert.ok(stage&&stage.width>0&&stage.height>0);assert.ok(timeline&&timeline.width>0&&timeline.height>0);if(!compact)assert.ok(stage.width>=260&&stage.height>=146);});
    await step(`${tag}:refresh-home`,async()=>{await home(page);assert.equal(await page.getByRole("region",{name:"Animation workspace"}).count(),0);await page.getByRole("button",{name:/^Open Project/}).click();await waitCollection(page);await page.getByRole("button",{name:"← Back",exact:true}).click();assert.match(await focusName(page)??"",/Open Project/);});
    await context.close();
  }
  for(const fault of ["empty","idb","local"]){
    const context=await browser.newContext({viewport:{width:390,height:844}});await configure(context);
    if(fault!=="empty")await context.addInitScript((kind)=>{if(kind==="idb")Object.defineProperty(window,"indexedDB",{get(){throw new Error("storage unavailable");}});else Storage.prototype.getItem=function(){throw new Error("storage unavailable");};},fault);
    const page=await context.newPage();await page.goto(url,{waitUntil:"networkidle"});await page.getByRole("button",{name:/^Open Project/}).click();await pause(500);
    await step(`storage:${fault}`,async()=>{if(fault==="empty"){await page.getByText(/No saved projects yet/).waitFor();assert.deepEqual((await pageStorage(page)).indexed,{});}else await page.getByText("Unavailable",{exact:true}).first().waitFor();await page.getByRole("button",{name:"← Back",exact:true}).click();await page.getByRole("button",{name:/^New Project/}).click();await page.getByText("Untitled Project",{exact:true}).waitFor();await oneRoot(page,"drawing");await assertNoRejectedWorkspaceChrome(page);});await context.close();
  }
  assert.deepEqual(pageErrors,[]);assert.deepEqual(consoleErrors,[]);assert.equal(requests.filter(r=>r.disposition==="blocked").length,0);
  const result={status:"PASS",url,operations,screenshots,accessibility,storageProof,requests,pageErrors,consoleErrors,externalRequests:0,realApiRequests:0,sourceWrites:0,reviewOnlyProductSurface:false,inheritedWorkspaceChrome:true,inheritedProjectsShell:true,forbiddenPhase2ChromeAbsent:true,compactEvidence:"Chromium browser profile, not physical phone",createdAt:new Date().toISOString()};
  writeFileSync(resolve(output,"result.json"),JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify({status:"PASS",operations:operations.length,screenshots:screenshots.length,result:resolve(output,"result.json"),sha256:createHash("sha256").update(JSON.stringify(result)).digest("hex")}));
} finally { await browser.close(); }
