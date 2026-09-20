import type { ExportProjectSnapshot } from "./exportPhase1";
import type { ExportQualityTier } from "./exportContracts";

export const EXPORT_DESTINATION_CATALOG_VERSION = "2026-09-20" as const;
export const EXPORT_DESTINATION_CATALOG_VERIFIED_AT = "2026-09-20" as const;

export type ExportDestinationPresetId =
  | "original"
  | "youtube"
  | "youtube-shorts"
  | "tiktok"
  | "instagram-reels"
  | "instagram-stories"
  | "instagram-feed"
  | "facebook-reels"
  | "facebook-feed"
  | "discord"
  | "snapchat"
  | "x"
  | "reddit"
  | "custom-other";

export type ExportCanvasShape = "original" | "16:9" | "9:16" | "1:1" | "4:5" | "custom";

export type ExportCatalogSource = {
  id: string;
  platform: string;
  title: string;
  url: string;
  accessedAt: typeof EXPORT_DESTINATION_CATALOG_VERIFIED_AT;
  exactValues: readonly string[];
};

export type ExportDestinationCatalogEntry = {
  id: ExportDestinationPresetId;
  displayName: string;
  category: "general" | "video" | "short-video" | "social-feed" | "messaging" | "custom";
  shape: Exclude<ExportCanvasShape, "custom"> | "custom-choice";
  dimensions?: {
    "720p": { width: number; height: number };
    "1080p": { width: number; height: number };
  };
  container: "MP4";
  codecs: "H.264 + AAC when audio exists";
  guidance: string;
  shapeExplanation: string;
  sourceIds: readonly string[];
  brandAsset: { kind: "text-fallback"; label: string; reason: string };
};

export const EXPORT_CATALOG_SOURCES: readonly ExportCatalogSource[] = [
  {
    id: "youtube-encoding",
    platform: "YouTube",
    title: "YouTube recommended upload encoding settings",
    url: "https://support.google.com/youtube/answer/1722171?hl=en",
    accessedAt: EXPORT_DESTINATION_CATALOG_VERIFIED_AT,
    exactValues: ["MP4 container", "H.264 video", "AAC-LC audio", "16:9 standard aspect", "1280x720 at 720p", "1920x1080 at 1080p", "upload at the recorded frame rate"],
  },
  {
    id: "youtube-shorts",
    platform: "YouTube Shorts",
    title: "Understand three-minute YouTube Shorts",
    url: "https://support.google.com/youtube/answer/15424877?hl=en",
    accessedAt: EXPORT_DESTINATION_CATALOG_VERIFIED_AT,
    exactValues: ["square or vertical video", "up to 3 minutes"],
  },
  {
    id: "youtube-shorts-resolution",
    platform: "YouTube Shorts",
    title: "Get started creating YouTube Shorts",
    url: "https://support.google.com/youtube/answer/10059070?hl=en",
    accessedAt: EXPORT_DESTINATION_CATALOG_VERIFIED_AT,
    exactValues: ["vertical videos may be uploaded"],
  },
  {
    id: "tiktok-video",
    platform: "TikTok",
    title: "TikTok Auction In-Feed Ads",
    url: "https://ads.tiktok.com/help/article/tiktok-auction-in-feed-ads",
    accessedAt: EXPORT_DESTINATION_CATALOG_VERIFIED_AT,
    exactValues: ["vertical recommended 9:16", "vertical resolution at least 540x960", "MP4 accepted", "non-Spark video up to 10 minutes", "non-Spark file size at most 500 MB"],
  },
  {
    id: "meta-reels",
    platform: "Meta",
    title: "Instagram & Facebook Reels: Create Short Video Ads",
    url: "https://www.facebook.com/business/ads/facebook-instagram-reels-ads",
    accessedAt: EXPORT_DESTINATION_CATALOG_VERIFIED_AT,
    exactValues: ["9:16 vertical video with audio is the native Reels creative recommendation", "keep key creative elements in the safe zone"],
  },
  {
    id: "facebook-reels-current",
    platform: "Facebook",
    title: "Explore and watch Facebook reels",
    url: "https://www.facebook.com/help/262748009210134/",
    accessedAt: EXPORT_DESTINATION_CATALOG_VERIFIED_AT,
    exactValues: ["Facebook reels can be any length or orientation after the announced 2025 video-to-reels change"],
  },
  {
    id: "discord-attachments",
    platform: "Discord",
    title: "File Attachments FAQ",
    url: "https://support.discord.com/hc/en-us/articles/25444343291031-File-Attachments-FAQ",
    accessedAt: EXPORT_DESTINATION_CATALOG_VERIFIED_AT,
    exactValues: ["free upload limit 20 MB as of August 2026", "Nitro Basic 50 MB", "Nitro up to 500 MB", "MP4 with H.264 is supported", "Discord may experiment with limits"],
  },
  {
    id: "snapchat-video",
    platform: "Snapchat",
    title: "How to Post a Snap to My Story from the Web",
    url: "https://help.snapchat.com/hc/en-us/articles/7012310003348-How-to-Post-a-Snap-to-My-Story-from-the-Web",
    accessedAt: EXPORT_DESTINATION_CATALOG_VERIFIED_AT,
    exactValues: ["9:16 aspect ratio", "minimum 540x960", "5–60 seconds", "automatic crop warning for other aspect ratios"],
  },
  {
    id: "x-video",
    platform: "X",
    title: "How to share and watch videos on X",
    url: "https://help.x.com/en/using-x/x-videos",
    accessedAt: EXPORT_DESTINATION_CATALOG_VERIFIED_AT,
    exactValues: ["non-Premium web upload up to 140 seconds and 512 MB", "Premium upload limits differ", "web aspect-ratio range 1:2.39 through 2.39:1", "maximum web resolution 1920x1200 or 1200x1900"],
  },
  {
    id: "x-media-studio",
    platform: "X",
    title: "Media Studio Library",
    url: "https://help.x.com/en/using-x/media-studio-faqs",
    accessedAt: EXPORT_DESTINATION_CATALOG_VERIFIED_AT,
    exactValues: ["MP4 or MOV", "H.264 video", "AAC-LC audio", "recommended landscape resolution 1280x720", "maximum landscape resolution 1920x1080 for videos up to two hours"],
  },
  {
    id: "reddit-video",
    platform: "Reddit",
    title: "How do I post and comment on Reddit?",
    url: "https://support.reddithelp.com/hc/en-us/articles/360060422572-How-do-I-post-and-comment-on-Reddit",
    accessedAt: EXPORT_DESTINATION_CATALOG_VERIFIED_AT,
    exactValues: ["Create Post supports an Images & Video post type", "community rules and available post types vary"],
  },
] as const;

const neutralFallback = (label: string) => ({
  kind: "text-fallback" as const,
  label,
  reason: "Neutral local text badge; no third-party logo is bundled or fetched.",
});

export const EXPORT_DESTINATION_CATALOG: readonly ExportDestinationCatalogEntry[] = [
  { id: "original", displayName: "Original", category: "general", shape: "original", container: "MP4", codecs: "H.264 + AAC when audio exists", guidance: "Keeps the saved stage shape inside the selected 720p or 1080p bounding box.", shapeExplanation: "No destination reshape. The complete saved stage is preserved.", sourceIds: [], brandAsset: neutralFallback("OR") },
  { id: "youtube", displayName: "YouTube", category: "video", shape: "16:9", dimensions: { "720p": { width: 1280, height: 720 }, "1080p": { width: 1920, height: 1080 } }, container: "MP4", codecs: "H.264 + AAC when audio exists", guidance: "YouTube recommends MP4, H.264, AAC-LC, and the recorded frame rate. Check the destination before posting.", shapeExplanation: "A 16:9 canvas matches YouTube's standard computer-player shape.", sourceIds: ["youtube-encoding"], brandAsset: neutralFallback("YT") },
  { id: "youtube-shorts", displayName: "YouTube Shorts", category: "short-video", shape: "9:16", dimensions: { "720p": { width: 720, height: 1280 }, "1080p": { width: 1080, height: 1920 } }, container: "MP4", codecs: "H.264 + AAC when audio exists", guidance: "YouTube identifies square or vertical videos up to 3 minutes as Shorts. Check eligibility before posting.", shapeExplanation: "A vertical 9:16 canvas is prepared for the Shorts viewer.", sourceIds: ["youtube-shorts", "youtube-shorts-resolution", "youtube-encoding"], brandAsset: neutralFallback("YS") },
  { id: "tiktok", displayName: "TikTok", category: "short-video", shape: "9:16", dimensions: { "720p": { width: 720, height: 1280 }, "1080p": { width: 1080, height: 1920 } }, container: "MP4", codecs: "H.264 + AAC when audio exists", guidance: "TikTok's official business guidance recommends vertical 9:16 and accepts MP4. Posting-surface limits vary; check the destination before posting.", shapeExplanation: "A vertical 9:16 canvas is prepared for TikTok's full-screen format.", sourceIds: ["tiktok-video"], brandAsset: neutralFallback("TT") },
  { id: "instagram-reels", displayName: "Instagram Reels", category: "short-video", shape: "9:16", dimensions: { "720p": { width: 720, height: 1280 }, "1080p": { width: 1080, height: 1920 } }, container: "MP4", codecs: "H.264 + AAC when audio exists", guidance: "Meta recommends native Reels creative at 9:16 with important content kept in the safe zone. Check the destination before posting.", shapeExplanation: "A vertical 9:16 canvas is prepared for the Reels viewer.", sourceIds: ["meta-reels"], brandAsset: neutralFallback("IR") },
  { id: "instagram-stories", displayName: "Instagram Stories", category: "short-video", shape: "9:16", dimensions: { "720p": { width: 720, height: 1280 }, "1080p": { width: 1080, height: 1920 } }, container: "MP4", codecs: "H.264 + AAC when audio exists", guidance: "Diamond Animator prepares a vertical 9:16 local file. Current universal Story limits were not verified from an accessible first-party page; check the destination before posting.", shapeExplanation: "A vertical 9:16 canvas is prepared for a full-screen Story.", sourceIds: [], brandAsset: neutralFallback("IS") },
  { id: "instagram-feed", displayName: "Instagram Feed", category: "social-feed", shape: "4:5", dimensions: { "720p": { width: 720, height: 900 }, "1080p": { width: 1080, height: 1350 } }, container: "MP4", codecs: "H.264 + AAC when audio exists", guidance: "Diamond Animator prepares a portrait 4:5 local file. Current universal feed limits were not verified from an accessible first-party page; check the destination before posting.", shapeExplanation: "A portrait 4:5 canvas uses more feed height than the saved wide stage.", sourceIds: [], brandAsset: neutralFallback("IF") },
  { id: "facebook-reels", displayName: "Facebook Reels", category: "short-video", shape: "9:16", dimensions: { "720p": { width: 720, height: 1280 }, "1080p": { width: 1080, height: 1920 } }, container: "MP4", codecs: "H.264 + AAC when audio exists", guidance: "Meta recommends 9:16 Reels creative, while current Facebook guidance says reels may be any orientation. This preset prepares 9:16; check before posting.", shapeExplanation: "A vertical 9:16 canvas is prepared for immersive Reels viewing.", sourceIds: ["meta-reels", "facebook-reels-current"], brandAsset: neutralFallback("FR") },
  { id: "facebook-feed", displayName: "Facebook Feed", category: "social-feed", shape: "4:5", dimensions: { "720p": { width: 720, height: 900 }, "1080p": { width: 1080, height: 1350 } }, container: "MP4", codecs: "H.264 + AAC when audio exists", guidance: "Diamond Animator prepares a portrait 4:5 local file. Facebook now routes video broadly through Reels; check the destination before posting.", shapeExplanation: "A portrait 4:5 canvas uses more feed height than the saved wide stage.", sourceIds: ["facebook-reels-current"], brandAsset: neutralFallback("FF") },
  { id: "discord", displayName: "Discord", category: "messaging", shape: "original", container: "MP4", codecs: "H.264 + AAC when audio exists", guidance: "Discord supports H.264 MP4. Its official August 2026 free limit is 20 MB, with 50 MB Nitro Basic and up to 500 MB Nitro; experiments may differ.", shapeExplanation: "Keeps the saved stage shape because Discord accepts ordinary file attachments.", sourceIds: ["discord-attachments"], brandAsset: neutralFallback("DC") },
  { id: "snapchat", displayName: "Snapchat", category: "short-video", shape: "9:16", dimensions: { "720p": { width: 720, height: 1280 }, "1080p": { width: 1080, height: 1920 } }, container: "MP4", codecs: "H.264 + AAC when audio exists", guidance: "Snapchat's web Story guidance uses 9:16 and warns that other shapes may be cropped. Check the exact posting surface before posting.", shapeExplanation: "A vertical 9:16 canvas is prepared for Snapchat's full-screen format.", sourceIds: ["snapchat-video"], brandAsset: neutralFallback("SC") },
  { id: "x", displayName: "X", category: "social-feed", shape: "16:9", dimensions: { "720p": { width: 1280, height: 720 }, "1080p": { width: 1920, height: 1080 } }, container: "MP4", codecs: "H.264 + AAC when audio exists", guidance: "X supports H.264/AAC MP4. Non-Premium web uploads are up to 140 seconds and 512 MB; Premium limits differ. Check before posting.", shapeExplanation: "A 16:9 canvas matches X's recommended landscape preparation.", sourceIds: ["x-video", "x-media-studio"], brandAsset: neutralFallback("X") },
  { id: "reddit", displayName: "Reddit", category: "social-feed", shape: "original", container: "MP4", codecs: "H.264 + AAC when audio exists", guidance: "Reddit provides an Images & Video post type, but community rules and available post types vary. Check the destination before posting.", shapeExplanation: "Keeps the saved stage shape for a general local Reddit-ready file.", sourceIds: ["reddit-video"], brandAsset: neutralFallback("RD") },
  { id: "custom-other", displayName: "Custom / Other", category: "custom", shape: "custom-choice", container: "MP4", codecs: "H.264 + AAC when audio exists", guidance: "Choose Original, 16:9, 9:16, 1:1, 4:5, or an even custom canvas from 256 through 1920 pixels per side.", shapeExplanation: "The complete animation is always fitted inside the chosen canvas without crop.", sourceIds: [], brandAsset: neutralFallback("+") },
] as const;

export type ExportDestinationChoice = {
  presetId: ExportDestinationPresetId;
  customShape?: ExportCanvasShape;
  customWidth?: number;
  customHeight?: number;
};

export type ExportDestinationGeometry = {
  preset: ExportDestinationCatalogEntry;
  shape: ExportCanvasShape;
  outputCanvas: { width: number; height: number };
  contentRect: { x: number; y: number; width: number; height: number };
  padding: { top: number; right: number; bottom: number; left: number };
  paddingDescription: string;
};

const evenDimension = (value: number) => Math.max(2, Math.round(value / 2) * 2);

const resolveContain = (outputWidth: number, outputHeight: number, sourceWidth: number, sourceHeight: number) => {
  const scale = Math.min(outputWidth / Math.max(1, sourceWidth), outputHeight / Math.max(1, sourceHeight));
  const width = Math.max(1, sourceWidth) * scale;
  const height = Math.max(1, sourceHeight) * scale;
  return { x: (outputWidth - width) / 2, y: (outputHeight - height) / 2, width, height };
};

export const validateCustomDimensions = (width: number, height: number) => {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return "Width and height must be whole numbers.";
  if (width < 256 || width > 1920 || height < 256 || height > 1920) return "Width and height must each be from 256 through 1920 pixels.";
  if (width % 2 !== 0 || height % 2 !== 0) return "Width and height must both be even numbers.";
  return null;
};

const dimensionsForShape = (
  snapshot: ExportProjectSnapshot,
  shape: ExportCanvasShape,
  tier: ExportQualityTier,
  customWidth?: number,
  customHeight?: number,
) => {
  if (shape === "custom") {
    const width = Number(customWidth);
    const height = Number(customHeight);
    const error = validateCustomDimensions(width, height);
    if (error) throw new Error(`export_custom_dimensions_invalid:${error}`);
    return { width, height };
  }
  const maximumWidth = tier === "720p" ? 1280 : 1920;
  const maximumHeight = tier === "720p" ? 720 : 1080;
  if (shape === "original") {
    const stage = snapshot.project.document.logicalStage;
    const scale = Math.min(maximumWidth / stage.width, maximumHeight / stage.height);
    return { width: evenDimension(stage.width * scale), height: evenDimension(stage.height * scale) };
  }
  const dimensions = {
    "16:9": tier === "720p" ? { width: 1280, height: 720 } : { width: 1920, height: 1080 },
    "9:16": tier === "720p" ? { width: 720, height: 1280 } : { width: 1080, height: 1920 },
    "1:1": tier === "720p" ? { width: 720, height: 720 } : { width: 1080, height: 1080 },
    "4:5": tier === "720p" ? { width: 720, height: 900 } : { width: 1080, height: 1350 },
  } as const;
  return dimensions[shape];
};

export const getExportDestinationPreset = (id: ExportDestinationPresetId) => {
  const preset = EXPORT_DESTINATION_CATALOG.find(candidate => candidate.id === id);
  if (!preset) throw new Error("export_destination_unknown");
  return preset;
};

export const resolveExportDestinationGeometry = (
  snapshot: ExportProjectSnapshot,
  choice: ExportDestinationChoice,
  tier: ExportQualityTier,
): ExportDestinationGeometry => {
  const preset = getExportDestinationPreset(choice.presetId);
  const shape = preset.shape === "custom-choice" ? choice.customShape ?? "original" : preset.shape;
  const outputCanvas = preset.dimensions?.[tier] ?? dimensionsForShape(snapshot, shape, tier, choice.customWidth, choice.customHeight);
  const stage = snapshot.project.document.logicalStage;
  const contentRect = resolveContain(outputCanvas.width, outputCanvas.height, stage.width, stage.height);
  const round = (value: number) => Math.round(value * 100) / 100;
  const padding = {
    top: round(contentRect.y),
    right: round(outputCanvas.width - contentRect.x - contentRect.width),
    bottom: round(outputCanvas.height - contentRect.y - contentRect.height),
    left: round(contentRect.x),
  };
  const hasPadding = Object.values(padding).some(value => value > 0.01);
  return {
    preset,
    shape,
    outputCanvas,
    contentRect: {
      x: round(contentRect.x),
      y: round(contentRect.y),
      width: round(contentRect.width),
      height: round(contentRect.height),
    },
    padding,
    paddingDescription: hasPadding
      ? `Padding: top ${padding.top}px, right ${padding.right}px, bottom ${padding.bottom}px, left ${padding.left}px. Padding uses the project background.`
      : "No padding: the saved stage and output canvas have the same shape.",
  };
};

export const assertExportDestinationCatalog = () => {
  if (EXPORT_DESTINATION_CATALOG.length !== 14) throw new Error("export_destination_catalog_count");
  const ids = new Set<ExportDestinationPresetId>();
  const sourceIds = new Set(EXPORT_CATALOG_SOURCES.map(source => source.id));
  for (const entry of EXPORT_DESTINATION_CATALOG) {
    if (ids.has(entry.id)) throw new Error("export_destination_catalog_duplicate");
    ids.add(entry.id);
    if (entry.container !== "MP4" || entry.codecs !== "H.264 + AAC when audio exists") throw new Error("export_destination_catalog_codec");
    for (const sourceId of entry.sourceIds) if (!sourceIds.has(sourceId)) throw new Error("export_destination_catalog_source");
    if (entry.brandAsset.kind !== "text-fallback") throw new Error("export_destination_catalog_brand_asset");
  }
  return true;
};
