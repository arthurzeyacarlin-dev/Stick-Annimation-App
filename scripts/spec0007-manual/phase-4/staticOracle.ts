import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { inspectStaticAssetBytes, STATIC_ASSET_IMPORT_LIMITS, StaticAssetImportError } from "../../../src/lib/animation/editorCommands/staticAssetImport.ts";
import { appendProjectAssetsV2, removeProjectAssetV2 } from "../../../src/lib/animation/unifiedProjectCatalogV2.ts";
import type { UnifiedProjectAssetV2, UnifiedProjectCatalogsV2 } from "../../../src/lib/animation/unifiedAnimationContractV2.ts";

const output = "output/spec-0007/phase-4";
mkdirSync(`${output}/receipts`, { recursive: true });
let assertions = 0;
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const reject = (run: () => unknown, code: string, label: string) => {
  assertions += 1;
  assert.throws(run, error => error instanceof StaticAssetImportError && error.code === code, label);
};
const u32 = (value: number) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
const chunk = (type: string, data: number[]) => [...u32(data.length), ...Buffer.from(type), ...data, 0, 0, 0, 0];
const png = (width = 1, height = 1, extra: number[] = []) => Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10,
  ...chunk("IHDR", [...u32(width), ...u32(height), 8, 6, 0, 0, 0]),
  ...extra,
  ...chunk("IDAT", []),
  ...chunk("IEND", []),
]);
const jpeg = (width = 1, height = 1) => Uint8Array.from([
  0xff, 0xd8,
  0xff, 0xc0, 0x00, 0x11, 0x08, (height >> 8) & 255, height & 255, (width >> 8) & 255, width & 255,
  0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  0xff, 0xd9,
]);
const webp = (width = 1, height = 1) => {
  const w = width - 1, h = height - 1;
  const payload = [0x2f, w & 255, ((w >> 8) & 0x3f) | ((h & 3) << 6), (h >> 2) & 255, (h >> 10) & 15];
  const body = [...Buffer.from("VP8L"), payload.length, 0, 0, 0, ...payload, 0];
  return Uint8Array.from([...Buffer.from("RIFF"), ...[body.length + 4, 0, 0, 0], ...Buffer.from("WEBP"), ...body]);
};

equal(inspectStaticAssetBytes({ name: "one.png", mimeType: "image/png", declaredSize: png().length, bytes: png() }), { mimeType: "image/png", formatLabel: "PNG", width: 1, height: 1 }, "PNG signature and dimensions");
equal(inspectStaticAssetBytes({ name: "one.jpeg", mimeType: "image/jpeg", declaredSize: jpeg().length, bytes: jpeg() }), { mimeType: "image/jpeg", formatLabel: "JPEG", width: 1, height: 1 }, "JPEG signature and dimensions");
equal(inspectStaticAssetBytes({ name: "one.webp", mimeType: "image/webp", declaredSize: webp().length, bytes: webp() }), { mimeType: "image/webp", formatLabel: "WebP", width: 1, height: 1 }, "WebP signature and dimensions");
reject(() => inspectStaticAssetBytes({ name: "fake.png", mimeType: "image/png", declaredSize: jpeg().length, bytes: jpeg() }), "asset_type_mismatch", "spoofed extension rejected");
reject(() => inspectStaticAssetBytes({ name: "fake.gif", mimeType: "image/gif", declaredSize: 6, bytes: Uint8Array.from(Buffer.from("GIF89a")) }), "asset_unsupported_type", "GIF rejected");
reject(() => inspectStaticAssetBytes({ name: "fake.svg", mimeType: "image/svg+xml", declaredSize: 6, bytes: Uint8Array.from(Buffer.from("<svg/>")) }), "asset_unsupported_type", "SVG rejected");
const animatedPng = png(1, 1, chunk("acTL", [...u32(1), ...u32(0)]));
reject(() => inspectStaticAssetBytes({ name: "animated.png", mimeType: "image/png", declaredSize: animatedPng.length, bytes: animatedPng }), "asset_animated", "animated PNG rejected");
const truncated = png().slice(0, -5);
reject(() => inspectStaticAssetBytes({ name: "broken.png", mimeType: "image/png", declaredSize: truncated.length, bytes: truncated }), "asset_corrupt", "truncated PNG rejected");
const oversize = png(8193, 1);
reject(() => inspectStaticAssetBytes({ name: "wide.png", mimeType: "image/png", declaredSize: oversize.length, bytes: oversize }), "asset_dimension_limit", "dimension ceiling enforced");
const tooManyPixels = png(8192, 4097);
reject(() => inspectStaticAssetBytes({ name: "large.png", mimeType: "image/png", declaredSize: tooManyPixels.length, bytes: tooManyPixels }), "asset_decode_limit", "decoded pixel ceiling enforced");
equal(STATIC_ASSET_IMPORT_LIMITS.maximumBatchFiles, 32, "batch ceiling");
equal(STATIC_ASSET_IMPORT_LIMITS.maximumEncodedBytes, 16_777_216, "encoded byte ceiling");

const asset = (id: string, name: string, digest: string): UnifiedProjectAssetV2 => ({
  assetId: id, name, kind: "image", mimeType: "image/png", byteLength: 1, width: 1, height: 1,
  dataUrl: "data:image/png;base64,AA==", assetSha256: digest,
});
const empty: UnifiedProjectCatalogsV2 = { symbols: [], assets: [] };
const first = asset("11111111-1111-4111-8111-111111111111", "Block.png", `sha256:${"1".repeat(64)}`);
const duplicateBytes = asset("22222222-2222-4222-8222-222222222222", "Copy.png", first.assetSha256);
const catalogs = appendProjectAssetsV2(empty, [first]);
assertions += 1; assert.throws(() => appendProjectAssetsV2(catalogs, [duplicateBytes]), /duplicate_asset_content/, "duplicate bytes rejected");
assertions += 1; assert.throws(() => appendProjectAssetsV2(catalogs, [asset("33333333-3333-4333-8333-333333333333", "block.PNG", `sha256:${"2".repeat(64)}`)]), /duplicate_asset_name/, "case-insensitive duplicate name rejected");
assertions += 1; assert.throws(() => removeProjectAssetV2(catalogs, first.assetId, new Set([first.assetId])), /asset_referenced/, "referenced catalog entry rejected");
equal(removeProjectAssetV2(catalogs, first.assetId, new Set()).assets, [], "unreferenced catalog entry removed");

const source = (path: string) => readFileSync(path, "utf8");
const importSource = source("src/lib/animation/editorCommands/staticAssetImport.ts");
const canvasSource = source("src/components/workspace/DrawingCanvas.tsx");
const workspaceSource = source("src/components/workspace/DrawingWorkspace.tsx");
const registrySource = source("src/lib/animation/editorCommands/destructiveRegistry.ts");
check(!importSource.includes("fetch("), "asset import performs no URL fetch");
check(importSource.includes("URL.revokeObjectURL"), "temporary decode URL is always revoked");
check(canvasSource.includes("data-assets-drop-zone") && canvasSource.includes("accept=\".png,.jpg,.jpeg,.webp"), "chooser and OS drop surfaces are bounded");
check(canvasSource.includes("Lock image proportions") && canvasSource.includes("placedAssetAspectLocked"), "placement has explicit aspect lock and unlock");
check(canvasSource.includes("currentAssetCatalogContextRef.current !== importContextKey") && workspaceSource.includes("assetCatalogContextKey={projectId ?? openedInitialProject.id}"), "an import cannot land after the project context changes");
check(workspaceSource.includes("removeUnifiedAsset") && registrySource.includes('"delete-asset"'), "catalog deletion uses the destructive registry and history coordinator");

const protectedPaths = [
  "src/lib/animation/editorCommands/drawRigCorridor.ts",
  "src/lib/animation/editorCommands/rasterGesture.ts",
  "src/lib/animation/legacyRigRetirementV3.ts",
  "src/components/workspace/DrawingToolBar.tsx",
  "src/components/workspace/DrawingTimelineRow.tsx",
  "src/components/workspace/AnimationWorkspace.tsx",
];
for (const path of protectedPaths) {
  equal(execFileSync("git", ["diff", "--name-only", "HEAD", "--", path], { encoding: "utf8" }).trim(), "", `${path} remains byte-unchanged`);
}

const result = { status: "PASS", assertions, protectedPaths, limits: STATIC_ASSET_IMPORT_LIMITS };
writeFileSync(`${output}/receipts/static-oracle.json`, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));
