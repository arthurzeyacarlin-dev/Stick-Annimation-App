export const DRAWING_TEXT_FONTS = [
  "Arial",
  "Verdana",
  "Georgia",
  "Times New Roman",
  "Courier New",
] as const;

export type DrawingTextFontFamily = (typeof DRAWING_TEXT_FONTS)[number];

export type DrawingTextObject = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  flipX: boolean;
  flipY: boolean;
  rotation: number;
  fontFamily: DrawingTextFontFamily;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
};

export type DrawingTextLayout = {
  lines: string[];
  lineHeight: number;
  width: number;
  height: number;
  renderedWidth: number;
};

export type DrawingTextDrawOptions = {
  colorOverride?: string | null;
  opacity?: number;
};

export const DEFAULT_DRAWING_TEXT_FONT: DrawingTextFontFamily = "Arial";
export const DEFAULT_DRAWING_TEXT_SIZE = 42;
export const DEFAULT_DRAWING_TEXT_WIDTH = 260;
export const DEFAULT_DRAWING_TEXT_COLOR = "#101418";

let drawingTextWorkCanvasRef: HTMLCanvasElement | null = null;

export const cloneDrawingTextObject = (textObject: DrawingTextObject): DrawingTextObject => ({
  ...textObject,
});

export const cloneDrawingTextObjects = (textObjects: DrawingTextObject[]) => textObjects.map(cloneDrawingTextObject);

export const drawingTextObjectEqual = (
  left: DrawingTextObject | null | undefined,
  right: DrawingTextObject | null | undefined,
) =>
  left === right ||
  (!left && !right) ||
  (Boolean(left) &&
    Boolean(right) &&
    left!.id === right!.id &&
    left!.text === right!.text &&
    left!.x === right!.x &&
    left!.y === right!.y &&
    left!.width === right!.width &&
    left!.flipX === right!.flipX &&
    left!.flipY === right!.flipY &&
    left!.rotation === right!.rotation &&
    left!.fontFamily === right!.fontFamily &&
    left!.fontSize === right!.fontSize &&
    left!.color === right!.color &&
    left!.bold === right!.bold &&
    left!.italic === right!.italic);

export const drawingTextObjectsEqual = (left: DrawingTextObject[], right: DrawingTextObject[]) => {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (!drawingTextObjectEqual(left[index], right[index])) {
      return false;
    }
  }

  return true;
};

const normalizeTextColor = (color: string) => (/^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_DRAWING_TEXT_COLOR);

const buildTextFont = (textObject: DrawingTextObject) => {
  const fontStyle = textObject.italic ? "italic " : "";
  const fontWeight = textObject.bold ? "700 " : "400 ";
  return `${fontStyle}${fontWeight}${textObject.fontSize}px "${textObject.fontFamily}"`;
};

export const normalizeDrawingTextRotation = (rotation: number | null | undefined) => {
  if (!Number.isFinite(rotation ?? NaN)) {
    return 0;
  }

  const normalized = Math.round(rotation ?? 0) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const resolveDrawingTextDisplayRect = (textObject: DrawingTextObject, layout: DrawingTextLayout) => {
  const width = Math.max(textObject.width, layout.renderedWidth);
  const height = layout.height;
  return {
    x: textObject.flipX ? textObject.x - width : textObject.x,
    y: textObject.flipY ? textObject.y - height : textObject.y,
    width,
    height,
  };
};

export const measureDrawingTextDisplayRect = (
  ctx: CanvasRenderingContext2D,
  textObject: DrawingTextObject,
) => {
  const layout = measureDrawingTextLayout(ctx, textObject);
  return resolveDrawingTextDisplayRect(textObject, layout);
};

const getRotatedBounds = (rect: { x: number; y: number; width: number; height: number }, rotation: number) => {
  if (rotation === 0) {
    return rect;
  }

  const radians = (rotation * Math.PI) / 180;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const rotatePoint = (x: number, y: number) => {
    const offsetX = x - centerX;
    const offsetY = y - centerY;
    return {
      x: centerX + offsetX * cos - offsetY * sin,
      y: centerY + offsetX * sin + offsetY * cos,
    };
  };

  const points = [
    rotatePoint(rect.x, rect.y),
    rotatePoint(rect.x + rect.width, rect.y),
    rotatePoint(rect.x + rect.width, rect.y + rect.height),
    rotatePoint(rect.x, rect.y + rect.height),
  ];

  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
};

const splitTextLines = (text: string) => {
  const normalizedText = text.replace(/\r\n/g, "\n");
  return normalizedText.length > 0 ? normalizedText.split("\n") : [""];
};

export const measureDrawingTextLayout = (
  ctx: CanvasRenderingContext2D,
  textObject: DrawingTextObject,
): DrawingTextLayout => {
  ctx.save();
  ctx.font = buildTextFont(textObject);
  ctx.textBaseline = "top";

  const maxWidth = Math.max(24, textObject.width);
  const lines: string[] = [];
  const paragraphs = splitTextLines(textObject.text);

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    const words = paragraph.split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      const candidateLine = currentLine ? `${currentLine} ${word}` : word;
      const candidateWidth = ctx.measureText(candidateLine).width;
      if (!currentLine || candidateWidth <= maxWidth) {
        currentLine = candidateLine;
        continue;
      }

      lines.push(currentLine);
      currentLine = word;
    }

    lines.push(currentLine);
  }

  const lineHeight = Math.max(14, Math.round(textObject.fontSize * 1.18));
  const renderedWidth = lines.reduce((largestWidth, line) => Math.max(largestWidth, ctx.measureText(line || " ").width), 0);
  ctx.restore();

  return {
    lines,
    lineHeight,
    width: maxWidth,
    height: Math.max(lineHeight, lineHeight * lines.length),
    renderedWidth: Math.max(1, renderedWidth),
  };
};

export const measureDrawingTextObjectBounds = (
  ctx: CanvasRenderingContext2D,
  textObject: DrawingTextObject,
) => {
  const layout = measureDrawingTextLayout(ctx, textObject);
  const displayRect = resolveDrawingTextDisplayRect(textObject, layout);
  const rotation = normalizeDrawingTextRotation(textObject.rotation);
  return getRotatedBounds(displayRect, rotation);
};

export const drawDrawingTextObject = (
  ctx: CanvasRenderingContext2D,
  textObject: DrawingTextObject,
  options?: DrawingTextDrawOptions,
) => {
  const layout = measureDrawingTextLayout(ctx, textObject);
  const displayRect = resolveDrawingTextDisplayRect(textObject, layout);
  const rotation = normalizeDrawingTextRotation(textObject.rotation);
  ctx.save();
  ctx.font = buildTextFont(textObject);
  ctx.textBaseline = "top";
  ctx.fillStyle = options?.colorOverride ?? normalizeTextColor(textObject.color);
  ctx.globalAlpha = Math.max(0, Math.min(1, options?.opacity ?? 1));

  if (rotation === 0) {
    ctx.translate(
      displayRect.x + (textObject.flipX ? displayRect.width : 0),
      displayRect.y + (textObject.flipY ? displayRect.height : 0),
    );
    ctx.scale(textObject.flipX ? -1 : 1, textObject.flipY ? -1 : 1);

    layout.lines.forEach((line, lineIndex) => {
      ctx.fillText(line || " ", 0, lineIndex * layout.lineHeight, layout.width);
    });
    ctx.restore();
    return layout;
  }

  let workCanvas = drawingTextWorkCanvasRef;
  if (!workCanvas) {
    workCanvas = document.createElement("canvas");
    drawingTextWorkCanvasRef = workCanvas;
  }

  const workWidth = Math.max(1, Math.ceil(displayRect.width));
  const workHeight = Math.max(1, Math.ceil(displayRect.height));
  if (workCanvas.width !== workWidth || workCanvas.height !== workHeight) {
    workCanvas.width = workWidth;
    workCanvas.height = workHeight;
  }

  const workCtx = workCanvas.getContext("2d");
  if (!workCtx) {
    ctx.restore();
    return layout;
  }

  workCtx.save();
  workCtx.setTransform(1, 0, 0, 1, 0, 0);
  workCtx.clearRect(0, 0, workCanvas.width, workCanvas.height);
  workCtx.font = buildTextFont(textObject);
  workCtx.textBaseline = "top";
  workCtx.fillStyle = options?.colorOverride ?? normalizeTextColor(textObject.color);
  workCtx.globalAlpha = Math.max(0, Math.min(1, options?.opacity ?? 1));
  workCtx.translate(
    textObject.flipX ? displayRect.width : 0,
    textObject.flipY ? displayRect.height : 0,
  );
  workCtx.scale(textObject.flipX ? -1 : 1, textObject.flipY ? -1 : 1);

  layout.lines.forEach((line, lineIndex) => {
    workCtx.fillText(line || " ", 0, lineIndex * layout.lineHeight, layout.width);
  });
  workCtx.restore();

  ctx.translate(displayRect.x + displayRect.width / 2, displayRect.y + displayRect.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(workCanvas, -displayRect.width / 2, -displayRect.height / 2, displayRect.width, displayRect.height);

  ctx.restore();
  return layout;
};

export const drawScaledDrawingTextObject = (
  ctx: CanvasRenderingContext2D,
  textObject: DrawingTextObject,
  options: DrawingTextDrawOptions & {
    offsetX: number;
    offsetY: number;
    scaleX: number;
    scaleY: number;
  },
) => {
  ctx.save();
  ctx.translate(options.offsetX, options.offsetY);
  ctx.scale(options.scaleX, options.scaleY);
  const layout = drawDrawingTextObject(ctx, textObject, options);
  ctx.restore();
  return layout;
};
