export type ProjectPlayerCanvasGeometry = {
  cssWidth: number;
  cssHeight: number;
  backingWidth: number;
  backingHeight: number;
  pixelRatio: number;
};

export const resolveProjectPlayerCanvasGeometry = (
  availableWidth: number,
  availableHeight: number,
  stageWidth: number,
  stageHeight: number,
  devicePixelRatio: number,
): ProjectPlayerCanvasGeometry => {
  const safeAvailableWidth = Math.max(1, availableWidth);
  const safeAvailableHeight = Math.max(1, availableHeight);
  const safeStageWidth = Math.max(1, stageWidth);
  const safeStageHeight = Math.max(1, stageHeight);
  const containScale = Math.min(
    safeAvailableWidth / safeStageWidth,
    safeAvailableHeight / safeStageHeight,
  );
  const cssWidth = Math.max(1, safeStageWidth * containScale);
  const cssHeight = Math.max(1, safeStageHeight * containScale);
  const requestedPixelRatio = Math.min(2, Math.max(1, devicePixelRatio || 1));
  const cappedPixelRatio = Math.min(
    requestedPixelRatio,
    4096 / cssWidth,
    4096 / cssHeight,
  );
  const pixelRatio = Math.max(1 / Math.max(cssWidth, cssHeight), cappedPixelRatio);
  return {
    cssWidth,
    cssHeight,
    backingWidth: Math.max(1, Math.min(4096, Math.round(cssWidth * pixelRatio))),
    backingHeight: Math.max(1, Math.min(4096, Math.round(cssHeight * pixelRatio))),
    pixelRatio,
  };
};
