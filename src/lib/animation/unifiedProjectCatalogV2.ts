import type {
  UnifiedBitmapSymbolDefinitionV2,
  UnifiedProjectAssetV2,
  UnifiedProjectCatalogsV2,
  UnifiedStructuredSymbolPayloadV2,
} from "./unifiedAnimationContractV2";
import { assertStructuredSymbolPayloadV2 } from "./unifiedAnimationContractV2.ts";
import type { UnifiedSymbolInstanceItemV2, UnifiedSymbolSourceCategoryV2 } from "./unifiedAnimationContentV2";

const digestBytes = async (bytes: Uint8Array) => {
  const stableBytes = Uint8Array.from(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", stableBytes.buffer);
  return `sha256:${Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("")}`;
};

const dataUrlBytes = (dataUrl: string) => {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("invalid_data_url");
  const metadata = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (metadata.endsWith(";base64")) {
    const decoded = globalThis.atob(payload);
    return Uint8Array.from(decoded, character => character.charCodeAt(0));
  }
  return new TextEncoder().encode(decodeURIComponent(payload));
};

export const classifyUnifiedSymbolSourceV2 = (
  hasDrawing: boolean,
  hasStickFigure: boolean,
): UnifiedSymbolSourceCategoryV2 => {
  if (hasDrawing && hasStickFigure) return "Drawing and Stick Figure Symbol";
  if (hasStickFigure) return "Stick Figure Symbol";
  return "Drawing Symbol";
};

const symbolDefinitionHashes = async (input: Omit<UnifiedBitmapSymbolDefinitionV2, "assetSha256" | "definitionDigest">) => {
  const assetSha256 = await digestBytes(dataUrlBytes(input.pngDataUrl));
  const definitionDigest = await digestBytes(new TextEncoder().encode(JSON.stringify({
    name: input.name,
    sourceCategory: input.sourceCategory,
    width: input.width,
    height: input.height,
    assetSha256,
    ...(input.structuredPayload ? { structuredPayload: input.structuredPayload } : {}),
  })));
  return { assetSha256, definitionDigest };
};

export async function createBitmapSymbolDefinitionV2(input: {
  definitionId: string;
  name: string;
  sourceCategory: UnifiedSymbolSourceCategoryV2;
  width: number;
  height: number;
  pngDataUrl: string;
  structuredPayload?: UnifiedStructuredSymbolPayloadV2;
}): Promise<UnifiedBitmapSymbolDefinitionV2> {
  if (input.sourceCategory !== "Drawing Symbol" && !input.structuredPayload) throw new Error("structured_symbol_required");
  assertStructuredSymbolPayloadV2(input);
  const stableInput = structuredClone(input);
  return { ...stableInput, ...await symbolDefinitionHashes(stableInput) };
}

export async function assertStructuredSymbolDigestsV2(symbols: UnifiedBitmapSymbolDefinitionV2[]) {
  for (const definition of symbols) {
    assertStructuredSymbolPayloadV2(definition);
    // Recompute legacy hashes too: removing a new payload must not downgrade
    // a structured definition into an apparently legacy raster definition.
    const rebuilt = await symbolDefinitionHashes(definition);
    if (rebuilt.assetSha256 !== definition.assetSha256 || rebuilt.definitionDigest !== definition.definitionDigest) throw new Error("invalid_record");
  }
}

// Scale point positions, never segment thickness or joint radius. Rotation and
// flips are rigid transforms around the instance center, applied by the renderer.
export const resolveStructuredSymbolGeometryV2 = (
  definition: UnifiedBitmapSymbolDefinitionV2,
  instance: Pick<UnifiedSymbolInstanceItemV2, "x" | "y" | "width" | "height">,
) => {
  const payload = definition.structuredPayload;
  if (!payload) return null;
  const joints = payload.joints.map(joint => ({
    id: joint.id, x: instance.x + joint.x * instance.width, y: instance.y + joint.y * instance.height,
  }));
  const byId = new Map(joints.map(joint => [joint.id, joint]));
  return { joints, limbs: payload.limbs.map(limb => ({ id: limb.id, start: byId.get(limb.startJointId)!, end: byId.get(limb.endJointId)! })) };
};

export async function createProjectAssetV2(input: {
  assetId: string;
  name: string;
  kind: "image" | "file";
  mimeType: string;
  byteLength: number;
  width: number | null;
  height: number | null;
  dataUrl: string | null;
  sourceBytes: Uint8Array;
}): Promise<UnifiedProjectAssetV2> {
  const assetSha256 = await digestBytes(input.sourceBytes);
  return {
    assetId: input.assetId,
    name: input.name,
    kind: input.kind,
    mimeType: input.mimeType,
    byteLength: input.byteLength,
    width: input.kind === "image" ? input.width : null,
    height: input.kind === "image" ? input.height : null,
    dataUrl: input.kind === "image" ? input.dataUrl : null,
    assetSha256,
  };
}

export const appendSymbolDefinitionV2 = (
  catalogs: UnifiedProjectCatalogsV2,
  definition: UnifiedBitmapSymbolDefinitionV2,
) => {
  const normalizedName = definition.name.trim().toLocaleLowerCase();
  if (catalogs.symbols.some(candidate => candidate.name.trim().toLocaleLowerCase() === normalizedName)) {
    throw new Error("duplicate_symbol_name");
  }
  if (catalogs.symbols.some(candidate => candidate.assetSha256 === definition.assetSha256)) {
    throw new Error("duplicate_symbol_content");
  }
  return { ...catalogs, symbols: [...catalogs.symbols, definition] };
};

export const appendProjectAssetsV2 = (
  catalogs: UnifiedProjectCatalogsV2,
  assets: UnifiedProjectAssetV2[],
) => {
  const names = new Set(catalogs.assets.map(asset => asset.name.trim().toLocaleLowerCase()));
  for (const asset of assets) {
    const normalizedName = asset.name.trim().toLocaleLowerCase();
    if (names.has(normalizedName)) throw new Error("duplicate_asset_name");
    names.add(normalizedName);
  }
  return { ...catalogs, assets: [...catalogs.assets, ...assets] };
};

export const removeSymbolDefinitionV2 = (
  catalogs: UnifiedProjectCatalogsV2,
  definitionId: string,
  referencedDefinitionIds: ReadonlySet<string>,
) => {
  if (referencedDefinitionIds.has(definitionId)) throw new Error("symbol_definition_referenced");
  return { ...catalogs, symbols: catalogs.symbols.filter(symbol => symbol.definitionId !== definitionId) };
};
