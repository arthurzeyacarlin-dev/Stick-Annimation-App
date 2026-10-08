// Account project direct-to-Storage saves (online beta). Mocked Supabase client:
// in-memory heads/versions tables + a private bucket that only accepts writes through
// the signed upload links the store hands out (like the real signed-URL flow).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UnifiedAnimationProjectV2 } from "../animation/unifiedAnimationContractV2.ts";
import { createNativeUnifiedProjectV2 } from "../animation/unifiedWorkspaceFactoryV2.ts";
import { packAccountProject } from "./projectBundle.ts";
import {
  ACCOUNT_PROJECT_BUCKET, accountProjectErrorStatus, createAccountProjectStore, parseAccountProjectUploadBody,
} from "./projectStorageCore.ts";

type Row = Record<string, unknown>;
const PART = 1024; // small parts so a tiny project spans several parts

const fakeSupabase = (partLimit = PART) => {
  const tables: Record<string, Row[]> = { diamond_p4u_heads: [], diamond_p4u_versions: [] };
  const keys: Record<string, string[]> = {
    diamond_p4u_heads: ["project_id"], diamond_p4u_versions: ["project_id", "revision", "project_digest"],
  };
  const objects = new Map<string, Uint8Array>();
  const uploadTokens = new Map<string, string>();
  const signedReads = new Map<string, string>();
  let counter = 0;
  const calls = { signedUploads: 0, signedReads: 0, removed: [] as string[] };

  class Query implements PromiseLike<{ data: unknown; error: unknown }> {
    private filters: Array<(row: Row) => boolean> = [];
    private returning = false;
    private single = false;
    private sort: { column: string; ascending: boolean } | null = null;
    private cap: number | null = null;
    private table: string;
    private mode: "select" | "insert" | "update";
    private payload?: Row;
    constructor(table: string, mode: "select" | "insert" | "update", payload?: Row) {
      this.table = table; this.mode = mode; this.payload = payload;
    }
    select() { if (this.mode !== "select") this.returning = true; return this; }
    eq(column: string, value: unknown) { this.filters.push(row => row[column] === value); return this; }
    is(column: string, value: unknown) { this.filters.push(row => (row[column] ?? null) === value); return this; }
    order(column: string, options: { ascending: boolean }) { this.sort = { column, ascending: options.ascending }; return this; }
    limit(count: number) { this.cap = count; return this; }
    maybeSingle() { this.single = true; return this; }
    private run(): { data: unknown; error: unknown } {
      const rows = tables[this.table];
      if (this.mode === "insert") {
        const row = structuredClone(this.payload!);
        if (rows.some(other => keys[this.table].every(key => other[key] === row[key]))) return { data: null, error: { message: "duplicate key" } };
        rows.push(row);
        return { data: null, error: null };
      }
      let matched = rows.filter(row => this.filters.every(filter => filter(row)));
      if (this.mode === "update") {
        for (const row of matched) Object.assign(row, structuredClone(this.payload!));
        if (!this.returning) return { data: null, error: null };
      }
      if (this.sort) {
        const { column, ascending } = this.sort;
        matched = [...matched].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1));
      }
      if (this.cap !== null) matched = matched.slice(0, this.cap);
      const data = matched.map(row => structuredClone(row));
      if (this.single) return data.length > 1 ? { data: null, error: { message: "multiple rows" } } : { data: data[0] ?? null, error: null };
      return { data, error: null };
    }
    then<A, B>(resolve?: ((value: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null, reject?: ((reason: unknown) => B | PromiseLike<B>) | null) {
      return Promise.resolve().then(() => this.run()).then(resolve, reject);
    }
  }

  const bucketApi = {
    async createSignedUploadUrl(path: string) {
      calls.signedUploads += 1;
      const token = `up-${++counter}`;
      uploadTokens.set(token, path);
      return { data: { signedUrl: `https://fake.supabase.co/storage/v1/object/upload/sign/${ACCOUNT_PROJECT_BUCKET}/${path}?token=${token}`, path, token }, error: null };
    },
    async download(path: string) {
      const bytes = objects.get(path);
      return bytes ? { data: new Blob([bytes as BlobPart]), error: null } : { data: null, error: { message: "not found" } };
    },
    async createSignedUrls(paths: string[]) {
      calls.signedReads += 1;
      return {
        data: paths.map(path => {
          const token = `read-${++counter}`;
          signedReads.set(token, path);
          return { path, signedUrl: `https://fake.supabase.co/storage/v1/object/sign/${ACCOUNT_PROJECT_BUCKET}/${path}?token=${token}`, error: null };
        }),
        error: null,
      };
    },
    async remove(paths: string[]) {
      for (const path of paths) { objects.delete(path); calls.removed.push(path); }
      return { data: [], error: null };
    },
  };
  const client = {
    from: (table: string) => ({
      select: () => new Query(table, "select"),
      insert: (row: Row) => new Query(table, "insert", row),
      update: (row: Row) => new Query(table, "update", row),
    }),
    storage: { from: (name: string) => { assert.equal(name, ACCOUNT_PROJECT_BUCKET); return bucketApi; } },
  } as unknown as SupabaseClient;

  // What the browser does with a signed upload link (bucket file_size_limit enforced).
  const browserPut = (signedUrl: string, bytes: Uint8Array) => {
    const token = new URL(signedUrl).searchParams.get("token")!;
    const path = uploadTokens.get(token);
    if (!path || objects.has(path) || bytes.byteLength > partLimit) return false;
    objects.set(path, Uint8Array.from(bytes));
    return true;
  };
  const browserGet = (signedUrl: string) => {
    const path = signedReads.get(new URL(signedUrl).searchParams.get("token")!);
    return path ? objects.get(path) ?? null : null;
  };
  return { client, tables, objects, calls, browserPut, browserGet };
};

const OWNER = "owner_A";
const OTHER = "owner_B";
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

// Browser side of a save: pack, gzip, describe.
const bundleFor = async (project: UnifiedAnimationProjectV2, expectedRevision: number | null) => {
  const { body, version } = await packAccountProject(project);
  const raw = new Uint8Array(await body.arrayBuffer());
  // Make the gzip incompressible-ish so it spans several small test parts.
  const compressed = gzipSync(raw, { level: 0 });
  return {
    compressed,
    metadata: {
      projectId: version.projectId, revision: version.revision, projectDigest: version.projectDigest,
      expectedRevision, bundleSha256: sha(compressed), rawByteLength: raw.byteLength, compressedByteLength: compressed.byteLength,
    },
  };
};

const newProject = (title = "Online save") => {
  const project = createNativeUnifiedProjectV2("2026-10-08T00:00:00.000Z");
  project.title = title;
  project.revision = 1;
  return project;
};

const save = async (fake: ReturnType<typeof fakeSupabase>, store: ReturnType<typeof createAccountProjectStore>,
  ownerId: string, project: UnifiedAnimationProjectV2, expectedRevision: number | null) => {
  const { compressed, metadata } = await bundleFor(project, expectedRevision);
  const prepared = await store.prepareAccountProjectUpload(ownerId, metadata);
  assert.equal(prepared.status, "upload");
  if (prepared.status !== "upload") throw new Error("unreachable");
  prepared.parts.forEach((part, index) => {
    assert.ok(part.path.startsWith(`${ownerId}/${project.projectId}/${project.revision}/${prepared.attempt}/`));
    assert.ok(fake.browserPut(part.signedUrl, compressed.subarray(index * prepared.partBytes, (index + 1) * prepared.partBytes)));
  });
  return { receipt: await store.commitAccountProjectUpload(ownerId, { ...metadata, attempt: prepared.attempt }), metadata, prepared, compressed };
};

test("new project: signed multi-part upload, server verifies, commits version + head, signed download round-trips", async () => {
  const fake = fakeSupabase();
  const store = createAccountProjectStore(() => fake.client, { partBytes: PART });
  const project = newProject();
  const { receipt, metadata, prepared, compressed } = await save(fake, store, OWNER, project, null);
  assert.ok(prepared.parts.length > 1, "test bundle should span several parts");
  assert.deepEqual(receipt, { ownerId: OWNER, projectId: project.projectId, revision: 1, projectDigest: metadata.projectDigest, storedByteLength: receipt.storedByteLength });
  assert.equal(fake.tables.diamond_p4u_versions.length, 1);
  assert.equal(fake.tables.diamond_p4u_heads[0].title, "Online save");
  assert.equal((await store.listAccountProjectHeads(OWNER)).length, 1);

  const download = await store.accountProjectDownload(OWNER, project.projectId);
  assert.deepEqual(download.receipt, receipt);
  assert.equal(download.download.bundleSha256, metadata.bundleSha256);
  const joined = Buffer.concat(download.download.parts.map(url => fake.browserGet(url)!));
  assert.equal(sha(joined), sha(compressed));

  // Replaying the same commit (e.g. after a network drop) is answered from the head.
  assert.deepEqual(await store.commitAccountProjectUpload(OWNER, { ...metadata, attempt: prepared.attempt }), receipt);
  const again = await store.prepareAccountProjectUpload(OWNER, metadata);
  assert.equal(again.status, "committed");
});

test("second revision needs the current expected revision; stale writes are refused", async () => {
  const fake = fakeSupabase();
  const store = createAccountProjectStore(() => fake.client, { partBytes: PART });
  const project = newProject();
  const first = await save(fake, store, OWNER, project, null);
  const next = structuredClone(project);
  next.title = "Renamed";
  next.revision = 2;
  const { metadata } = await bundleFor(next, 1);
  await assert.rejects(store.prepareAccountProjectUpload(OWNER, { ...metadata, expectedRevision: null }), { message: "stale_revision" });
  await assert.rejects(store.prepareAccountProjectUpload(OWNER, { ...metadata, revision: 3, expectedRevision: 1 }), { message: "stale_revision" });
  // Re-preparing the committed version is answered from the head; a different "new" revision 1 is stale.
  assert.equal((await store.prepareAccountProjectUpload(OWNER, first.metadata)).status, "committed");
  const rival = structuredClone(project);
  rival.title = "Rival first save";
  const rivalBundle = await bundleFor(rival, null);
  await assert.rejects(store.prepareAccountProjectUpload(OWNER, rivalBundle.metadata), { message: "stale_revision" });
  const second = await save(fake, store, OWNER, next, 1);
  assert.equal(second.receipt.revision, 2);
  assert.equal(fake.tables.diamond_p4u_heads.length, 1);
  assert.equal(fake.tables.diamond_p4u_heads[0].title, "Renamed");
  assert.equal(fake.tables.diamond_p4u_versions.length, 2);
});

test("tampered, missing or mis-sized parts are rejected before commit and the attempt's parts are removed", async () => {
  const fake = fakeSupabase();
  const store = createAccountProjectStore(() => fake.client, { partBytes: PART });
  const project = newProject();
  const { compressed, metadata } = await bundleFor(project, null);

  // Tampered byte.
  let prepared = await store.prepareAccountProjectUpload(OWNER, metadata);
  if (prepared.status !== "upload") throw new Error("expected upload");
  const tampered = Uint8Array.from(compressed);
  tampered[10] ^= 1;
  prepared.parts.forEach((part, index) => fake.browserPut(part.signedUrl, tampered.subarray(index * PART, (index + 1) * PART)));
  await assert.rejects(store.commitAccountProjectUpload(OWNER, { ...metadata, attempt: prepared.attempt }), { message: "account_project_upload_invalid" });
  assert.equal(fake.tables.diamond_p4u_heads.length, 0);
  assert.equal(fake.tables.diamond_p4u_versions.length, 0);
  assert.equal(fake.objects.size, 0, "rejected parts are cleaned up");

  // Missing last part.
  prepared = await store.prepareAccountProjectUpload(OWNER, metadata);
  if (prepared.status !== "upload") throw new Error("expected upload");
  prepared.parts.slice(0, -1).forEach((part, index) => fake.browserPut(part.signedUrl, compressed.subarray(index * PART, (index + 1) * PART)));
  await assert.rejects(store.commitAccountProjectUpload(OWNER, { ...metadata, attempt: prepared.attempt }), { message: "account_project_upload_invalid" });

  // Lying about the size (claims smaller than uploaded) also fails verification.
  const lie = { ...metadata, compressedByteLength: metadata.compressedByteLength - 1 };
  prepared = await store.prepareAccountProjectUpload(OWNER, lie);
  if (prepared.status !== "upload") throw new Error("expected upload");
  prepared.parts.forEach((part, index) => fake.browserPut(part.signedUrl, compressed.subarray(index * PART, (index + 1) * PART)));
  await assert.rejects(store.commitAccountProjectUpload(OWNER, { ...lie, attempt: prepared.attempt }), { message: "account_project_upload_invalid" });

  // Commit without any upload, or with an invalid attempt id.
  await assert.rejects(store.commitAccountProjectUpload(OWNER, { ...metadata, attempt: crypto.randomUUID() }), { message: "account_project_upload_invalid" });
  await assert.rejects(store.commitAccountProjectUpload(OWNER, { ...metadata, attempt: null }), { message: "account_project_invalid_request" });
  assert.equal(fake.tables.diamond_p4u_heads.length, 0);
});

test("owners are isolated: another account cannot read, list, commit or delete someone else's project", async () => {
  const fake = fakeSupabase();
  const store = createAccountProjectStore(() => fake.client, { partBytes: PART });
  const project = newProject();
  const { receipt, metadata, prepared } = await save(fake, store, OWNER, project, null);
  assert.equal(await store.accountProjectHeadReceipt(OTHER, project.projectId), null);
  assert.equal(await store.accountProjectBelongsToOwner(OTHER, project.projectId), false);
  assert.deepEqual(await store.listAccountProjectHeads(OTHER), []);
  await assert.rejects(store.accountProjectDownload(OTHER, project.projectId), { message: "account_project_not_found" });
  await assert.rejects(store.deleteAccountProject(OTHER, project.projectId, 1, receipt.projectDigest), { message: "account_project_not_found" });
  // Reusing A's attempt id from B's session points at B's own (empty) folder.
  const next = structuredClone(project);
  next.revision = 2;
  const nextBundle = await bundleFor(next, 1);
  await assert.rejects(store.commitAccountProjectUpload(OTHER, { ...nextBundle.metadata, attempt: prepared.attempt }), { message: "stale_revision" });
  // B may only ever get links inside B's own folder; claiming A's project id still cannot take A's head.
  const { compressed } = await bundleFor(project, null);
  const otherPrepared = await store.prepareAccountProjectUpload(OTHER, metadata);
  if (otherPrepared.status !== "upload") throw new Error("expected upload");
  otherPrepared.parts.forEach((part, index) => {
    assert.ok(part.path.startsWith(`${OTHER}/`));
    fake.browserPut(part.signedUrl, compressed.subarray(index * PART, (index + 1) * PART));
  });
  await assert.rejects(store.commitAccountProjectUpload(OTHER, { ...metadata, attempt: otherPrepared.attempt }));
  assert.equal(fake.tables.diamond_p4u_heads.length, 1);
  assert.equal(fake.tables.diamond_p4u_heads[0].owner_id, OWNER);
  assert.equal(fake.tables.diamond_p4u_versions.length, 1);
  await assert.rejects(store.prepareAccountProjectUpload("bad/owner", metadata), { message: "account_project_invalid_scope" });
  await assert.rejects(store.prepareAccountProjectUpload(OWNER, { ...metadata, projectId: "../x" }), { message: "account_project_invalid_scope" });
});

test("deleted projects cannot be resaved; delete needs the current revision + digest", async () => {
  const fake = fakeSupabase();
  const store = createAccountProjectStore(() => fake.client, { partBytes: PART });
  const project = newProject();
  const { receipt } = await save(fake, store, OWNER, project, null);
  await assert.rejects(store.deleteAccountProject(OWNER, project.projectId, 2, receipt.projectDigest), { message: "stale_revision" });
  await store.deleteAccountProject(OWNER, project.projectId, 1, receipt.projectDigest);
  const next = structuredClone(project);
  next.revision = 2;
  const { metadata } = await bundleFor(next, 1);
  await assert.rejects(store.prepareAccountProjectUpload(OWNER, metadata), { message: "account_project_deleted" });
  await assert.rejects(store.accountProjectDownload(OWNER, project.projectId), { message: "account_project_not_found" });
});

test("a version row whose paths leave the owner's folder is never signed for download", async () => {
  const fake = fakeSupabase();
  const store = createAccountProjectStore(() => fake.client, { partBytes: PART });
  const project = newProject();
  await save(fake, store, OWNER, project, null);
  const version = fake.tables.diamond_p4u_versions[0];
  version.part_paths = (version.part_paths as string[]).map((path, index) => index === 0 ? `${OTHER}/${project.projectId}/1/x/0.gzpart` : path);
  const before = fake.calls.signedReads;
  await assert.rejects(store.accountProjectDownload(OWNER, project.projectId), { message: "account_project_readback_failed" });
  assert.equal(fake.calls.signedReads, before);
});

test("request body parser and status codes", () => {
  const good = {
    action: "prepare", projectId: crypto.randomUUID(), revision: 1, projectDigest: "a".repeat(64), expectedRevision: null,
    bundleSha256: "b".repeat(64), rawByteLength: 100, compressedByteLength: 80,
  };
  assert.equal(parseAccountProjectUploadBody(good).action, "prepare");
  assert.equal(parseAccountProjectUploadBody({ ...good, action: "commit", attempt: crypto.randomUUID() }).input.attempt?.length, 36);
  for (const bad of [
    null, [], "x", { ...good, action: "upload" }, { ...good, projectDigest: "A".repeat(64) }, { ...good, revision: 0 },
    { ...good, rawByteLength: 140_000_001 }, { ...good, compressedByteLength: 0 }, { ...good, expectedRevision: "1" },
    { ...good, action: "commit", attempt: "../../x" }, { ...good, action: "commit" },
  ]) assert.throws(() => parseAccountProjectUploadBody(bad), { message: "account_project_invalid_request" });
  assert.equal(accountProjectErrorStatus("stale_revision"), 409);
  assert.equal(accountProjectErrorStatus("account_project_upload_invalid"), 422);
  assert.equal(accountProjectErrorStatus("account_project_invalid_request"), 400);
  assert.equal(accountProjectErrorStatus("account_project_not_found"), 404);
  assert.equal(accountProjectErrorStatus("project_too_large"), 413);
  assert.equal(accountProjectErrorStatus("anything_else"), 503);
});

test("browser client: save uploads straight to signed links (metadata-only app requests), open downloads and verifies", async () => {
  const fake = fakeSupabase(128);
  const store = createAccountProjectStore(() => fake.client, { partBytes: 128 });
  const appBodies: number[] = [];
  let tamperDownload = false;
  const originalFetch = globalThis.fetch;
  const hadWindow = "window" in globalThis;
  (globalThis as unknown as { window: typeof globalThis }).window = globalThis;
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), "http://127.0.0.1:3000");
    const method = init.method ?? "GET";
    if (url.hostname === "fake.supabase.co") {
      if (method === "PUT") return new Response(null, { status: fake.browserPut(url.toString(), init.body as Uint8Array) ? 200 : 400 });
      const bytes = fake.browserGet(url.toString());
      if (!bytes) return new Response(null, { status: 404 });
      const copy = Uint8Array.from(bytes);
      if (tamperDownload) copy[0] ^= 1;
      return new Response(copy);
    }
    assert.equal(url.origin, "http://127.0.0.1:3000");
    assert.equal(new Headers(init.headers).get("x-account-owner"), OWNER);
    if (typeof init.body === "string") appBodies.push(init.body.length);
    try {
      if (url.pathname === "/api/account/projects" && method === "POST") {
        const { action, input } = parseAccountProjectUploadBody(JSON.parse(init.body as string));
        return Response.json(action === "prepare"
          ? await store.prepareAccountProjectUpload(OWNER, input)
          : { receipt: await store.commitAccountProjectUpload(OWNER, input) });
      }
      const projectId = decodeURIComponent(url.pathname.split("/").pop()!);
      if (url.searchParams.get("head") === "1") {
        const receipt = await store.accountProjectHeadReceipt(OWNER, projectId);
        return receipt ? Response.json({ receipt }) : Response.json({ error: "account_project_not_found" }, { status: 404 });
      }
      return Response.json(await store.accountProjectDownload(OWNER, projectId));
    } catch (error) {
      const code = (error as Error).message;
      return Response.json({ error: code }, { status: accountProjectErrorStatus(code) });
    }
  }) as typeof fetch;
  try {
    const { writeAccountProjectV2, readAccountProjectV2 } = await import("./projectClient.ts");
    const project = newProject("Client round trip");
    assert.equal(await writeAccountProjectV2(OWNER, project, null), project);
    assert.ok((fake.tables.diamond_p4u_versions[0].part_paths as string[]).length > 1);
    assert.ok(appBodies.every(length => length < 2_000), "only small JSON goes to the app server");
    const reopened = await readAccountProjectV2(OWNER, project.projectId);
    assert.equal(reopened.title, "Client round trip");
    assert.equal(reopened.revision, 1);
    const stale = structuredClone(project);
    stale.title = "Stale";
    await assert.rejects(writeAccountProjectV2(OWNER, stale, null), { message: "stale_revision" });
    tamperDownload = true;
    await assert.rejects(readAccountProjectV2(OWNER, project.projectId), { message: "account_project_readback_failed" });
  } finally {
    globalThis.fetch = originalFetch;
    if (!hadWindow) delete (globalThis as { window?: unknown }).window;
  }
});
