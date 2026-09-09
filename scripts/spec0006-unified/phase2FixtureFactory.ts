import { deflateSync } from "node:zlib";
import { createDrawingV1Fixture, createDrawingV2Fixture, createStickFixture, RGBA_BYTES } from "./phase1FixtureFactory.ts";
import { calculateDocumentDigest, calculateStoredByteLength, sha256Hex } from "../../src/lib/drawingProjectV2Canonical.ts";
import type { UnifiedLegacyMigrationSourceV1 } from "../../src/lib/animation/unifiedAnimationMigration.ts";
import type { ProjectSource, ProjectSourceReader } from "../../src/lib/animation/unifiedProjectSourceReader.ts";

const crc = (data: Buffer) => {
  let value = 0xffffffff;
  for (const byte of data) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); }
  return (value ^ 0xffffffff) >>> 0;
};
const chunk = (name: string, data: Buffer) => {
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4), type = Buffer.from(name);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, checksum]);
};
const png = () => {
  const header = Buffer.alloc(13); header.writeUInt32BE(2); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.concat([Buffer.from([0]), Buffer.from(RGBA_BYTES.slice(0, 8)), Buffer.from([0]), Buffer.from(RGBA_BYTES.slice(8))]);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
};
const wav = () => {
  const bytes = Buffer.alloc(844); bytes.write("RIFF"); bytes.writeUInt32LE(836,4); bytes.write("WAVEfmt ",8); bytes.writeUInt32LE(16,16); bytes.writeUInt16LE(1,20); bytes.writeUInt16LE(1,22); bytes.writeUInt32LE(8000,24); bytes.writeUInt32LE(16000,28); bytes.writeUInt16LE(2,32); bytes.writeUInt16LE(16,34); bytes.write("data",36); bytes.writeUInt32LE(800,40); return bytes;
};
export const createPhase2Sources = async (): Promise<UnifiedLegacyMigrationSourceV1[]> => {
  const drawing = createDrawingV1Fixture(4); drawing.id = "60000000-0000-4000-8000-000000000011"; drawing.name = "Drawing study (V1)"; drawing.data.timelineFps = 12;
  drawing.data.layers[0].timelineFrames[0].soundAttachment!.audioDataUrl = `data:audio/wav;base64,${wav().toString("base64")}`;
  const v2 = await createDrawingV2Fixture(); v2.head.projectId = "60000000-0000-4000-8000-000000000012"; v2.record.projectId = v2.head.projectId; v2.head.title = "Drawing study (V2)";
  for (const asset of v2.record.assets) {
    const bytes = asset.kind === "raster-png" ? png() : wav(); asset.bytes = new Blob([new Uint8Array(bytes)], {type: asset.kind === "raster-png" ? "image/png" : "audio/wav"});
    if (asset.kind === "raster-png") { asset.encodedByteLength = bytes.length; asset.encodedSha256 = await sha256Hex(bytes); }
    else { asset.byteLength = bytes.length; asset.sha256 = await sha256Hex(bytes); }
  }
  v2.record.documentDigest = await calculateDocumentDigest(v2.record.document, v2.record.assets);
  v2.record.storedByteLength = calculateStoredByteLength(v2.record);
  v2.head.documentDigest = v2.record.documentDigest; v2.head.activeStoredByteLength = v2.record.storedByteLength;
  const sticks = ([1,2] as const).map((version) => {
    const record = createStickFixture(version); record.projectId = `60000000-0000-4000-8000-00000000001${version + 2}`; record.document.projectId = record.projectId;
    record.document.title = `Stick study (V${version})`;
    // Ordinary manually authored Stick graphs use the legacy stage's local
    // coordinates. Keep this fixture visible in both compatibility viewports.
    const content = record.document.layers[0].frames[0].content!;
    content.figures = [];
    content.structureGraph.joints.forEach((joint, index) => { joint.x = 140; joint.y = 80 + index * 60; });
    if (record.recordVersion === 2) record.aiCreationLatch.projectId = record.projectId;
    return { sourceKind: version === 1 ? "stick-v1" as const : "stick-v2" as const, project: record };
  });
  return [{sourceKind:"drawing-v1",project:drawing},{sourceKind:"drawing-v2",...v2},...sticks];
};
export const memorySourceReader = (sources: UnifiedLegacyMigrationSourceV1[]): ProjectSourceReader => ({
  list: async () => sources.map((source, index): ProjectSource => {
    const record = source.sourceKind === "drawing-v2" ? source.head : source.project as Record<string, unknown>;
    const id = source.sourceKind === "drawing-v2" ? source.head.projectId : String((record as Record<string, unknown>).projectId ?? (record as Record<string, unknown>).id);
    return { locator: `source-${index}`, sourceKind: source.sourceKind, sourceId: id, title: "Invalid fixture", updatedAt: null, read: async () => source };
  }),
});
