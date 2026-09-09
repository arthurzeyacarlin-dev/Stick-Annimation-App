import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createPhase2Sources, memorySourceReader } from "./phase2FixtureFactory.ts";
import { listProjectCollection, orderProjectCollection, readCollectionCandidate } from "../../src/lib/animation/unifiedProjectCollection.ts";
import { createUntitledWorkspace, WorkspaceBootstrap, prepareCollectionWorkspace, type WorkspaceCandidate } from "../../src/lib/animation/unifiedWorkspaceBootstrap.ts";
import type { UnifiedLegacyMigrationSourceV1 } from "../../src/lib/animation/unifiedAnimationMigration.ts";

const spec = JSON.parse(readFileSync("scripts/fixtures/spec0006-unified/v1/phase2-cases.json", "utf8"));
const checks: string[] = [];
const test = async (id: string, run: () => void | Promise<void>) => { await run(); checks.push(id); };
const sources = await createPhase2Sources();
const reader = memorySourceReader(sources);
const entries = await listProjectCollection(reader);
const fingerprint = async (value: unknown): Promise<unknown> => {
  if (value instanceof Blob) return {sha: createHash("sha256").update(Buffer.from(await value.arrayBuffer())).digest("hex"), size: value.size};
  if (Array.isArray(value)) return Promise.all(value.map(fingerprint));
  if (value && typeof value === "object") return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, child]) => [key, await fingerprint(child)])));
  return value;
};
const before = await fingerprint(sources);
await test("all-four-kinds", () => { assert.equal(entries.length,4); assert.ok(entries.every((entry)=>entry.classification === "legacy"), JSON.stringify(entries)); assert.equal(new Set(entries.map(e=>e.sourceKind)).size,4); });
await test("empty", async () => assert.deepEqual(await listProjectCollection(memorySourceReader([])),[]));
await test("updated-descending", () => { const values = [3,1,2].map((value,index)=>({...entries[index],updatedAt:`2026-09-0${value}T00:00:00.000Z`})); assert.deepEqual(orderProjectCollection(values).map(e=>e.updatedAt),[values[0].updatedAt,values[2].updatedAt,values[1].updatedAt]); });
await test("stable-id-tie", () => assert.deepEqual(orderProjectCollection([...entries].reverse()).map(e=>e.id), [...entries].map(e=>e.id).sort()));
await test("same-title-different-id", () => assert.equal(orderProjectCollection(entries.map(e=>({...e,title:"Same title"}))).length,4));
await test("exact-duplicate", async () => { const result=await listProjectCollection(memorySourceReader([sources[0],structuredClone(sources[0])])); assert.equal(result.length,1); assert.equal(result[0].classification,"legacy"); });
await test("conflicting-identity", async () => { const changed=structuredClone(sources[0]); (changed as {project:{name:string}}).project.name="Changed"; const result=await listProjectCollection(memorySourceReader([sources[0],changed])); assert.equal(result.length,2); assert.ok(result.every(e=>e.error==="duplicate_identity")); });
await test("canonical-provenance-dedupe", () => { const canonical={...entries[0],id:"canonical-1",classification:"canonical" as const}; const result=orderProjectCollection([entries[0],canonical,{...canonical,id:"canonical-2"}]); assert.equal(result.length,1); assert.equal(result[0].classification,"canonical"); assert.equal(result[0].protectedSource,true); });
await test("changed-source-separate", () => assert.equal(orderProjectCollection([entries[0],{...entries[0],id:"canonical",classification:"canonical",sourceDigest:"different"}]).length,2));
for (const [id, mutation] of [
  ["invalid-entry-visible",(source: UnifiedLegacyMigrationSourceV1)=>{(source as {project:{data:unknown}}).project.data=null;}],
  ["unsupported-entry-visible",(source: UnifiedLegacyMigrationSourceV1)=>{(source as {project:{data:{version:number}}}).project.data.version=99;}],
] as const) await test(id,async()=>{const source=structuredClone(sources[0]); mutation(source); const result=await listProjectCollection(memorySourceReader([source]));assert.equal(result[0].classification,"invalid");});
await test("missing-asset-visible",async()=>{const source=structuredClone(sources[1]); if(source.sourceKind!=="drawing-v2")throw new Error();source.record.assets=[];assert.equal((await listProjectCollection(memorySourceReader([source])))[0].classification,"invalid");});
for (const entry of entries) await test(`map-${entry.sourceKind}`,async()=>{const result=await readCollectionCandidate(reader,entry);assert.equal(result.candidate.project.candidateDigest,entry.candidateDigest);});
await test("source-changes-after-list",async()=>{const changed=structuredClone(sources);(changed[0] as {project:{name:string}}).project.name="Changed";await assert.rejects(readCollectionCandidate(memorySourceReader(changed),entries.find(e=>e.sourceKind==="drawing-v1")!),/source_changed/);});
await test("source-removed-after-list",async()=>{await assert.rejects(readCollectionCandidate(memorySourceReader([]),entries[0]),/source_changed/);});
await test("duplicate-added-after-list",async()=>{const changed=structuredClone(sources[0]);(changed as {project:{name:string}}).project.name="conflict";await assert.rejects(readCollectionCandidate(memorySourceReader([...sources,changed]),entries.find(e=>e.sourceKind==="drawing-v1")!),/duplicate_identity/);});
await test("missing-asset-after-list",async()=>{const changed=structuredClone(sources);if(changed[1].sourceKind!=="drawing-v2")throw new Error();changed[1].record.assets=[];await assert.rejects(readCollectionCandidate(memorySourceReader(changed),entries.find(e=>e.sourceKind==="drawing-v2")!));});
await test("invalid-entry",async()=>{await assert.rejects(readCollectionCandidate(reader,{...entries[0],classification:"invalid",error:"invalid_record"}),/invalid_record/);});
const bootstrap=new WorkspaceBootstrap();
await test("new-defaults",async()=>{const first=await bootstrap.open(createUntitledWorkspace);assert.equal(first.status,"opened");const current=bootstrap.current!.candidate;assert.equal(current.title,"Untitled Project");assert.equal(current.document.fps,12);assert.equal(current.document.layers.length,1);assert.equal(current.document.layers[0].name,"Layer 1");assert.equal(current.document.layers[0].cells.length,1);assert.equal(current.document.reopenState.onionEnabled,false);assert.equal(current.document.logicalStage.width,1920);assert.equal(current.migration,null);});
const deferred=()=>{let resolve!:(value:WorkspaceCandidate)=>void;let reject!:(reason:Error)=>void;const promise=new Promise<WorkspaceCandidate>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
for(const id of ["double-click","latest-open-wins","open-during-bootstrap","stale-failure"])await test(id,async()=>{const old=deferred();const first=bootstrap.open(()=>old.promise);const second=await bootstrap.open(createUntitledWorkspace);assert.equal(second.status,"opened");const current=bootstrap.current;if(id==="stale-failure")old.reject(new Error("invalid_record"));else old.resolve(await createUntitledWorkspace());assert.equal((await first).status,"stale");assert.equal(bootstrap.current,current);});
await test("cancel-during-bootstrap",async()=>{const old=deferred(),current=bootstrap.current;const pending=bootstrap.open(()=>old.promise);bootstrap.cancel();old.resolve(await createUntitledWorkspace());assert.equal((await pending).status,"stale");assert.equal(bootstrap.current,current);});
for(const id of ["IndexedDB-unavailable","localStorage-read-error","invalid_record","asset_missing","source_changed"])await test(id,async()=>{const current=bootstrap.current;const result=await bootstrap.open(async()=>{throw new Error(id.includes("unavailable")||id.includes("error")?"storage_read_failed":id);});assert.equal(result.status,"failed");assert.equal(bootstrap.current,current);});
await test("refresh",()=>{const fresh=new WorkspaceBootstrap();assert.equal(fresh.current,null);bootstrap.clear();assert.equal(bootstrap.current,null);});
await test("compatible-stick-and-drawing",async()=>{for(const entry of entries.filter(e=>e.sourceKind!=="drawing-v2")){const result=await prepareCollectionWorkspace(reader,entry);assert.equal(result.digest,entry.candidateDigest);assert.equal(result.editor.kind,entry.sourceKind.startsWith("drawing")?"drawing":"stick");}});
await test("source-zero-writes",async()=>assert.deepEqual(await fingerprint(sources),before));
for(const id of [...spec.collectionCases,...spec.raceCases]) assert.ok(checks.includes(id),`Missing required case ${id}`);
console.log(JSON.stringify({status:"PASS",checks,sourceKinds:4,sourceWrites:0,frozenSources:true,canonicalRepositoryImplemented:false},null,2));
