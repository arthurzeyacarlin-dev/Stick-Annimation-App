import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AUTHORING_CANVAS_BYTE_BUDGET,
  createAuthoringSurfaceViewport,
  drawReferencePatchToAuthoringSurface,
  type AuthoringSurfaceViewport,
} from "./authoringSurfaceViewport.ts";

test("retina laptop authoring surfaces stay inside 32 MiB", () => {
  for (const zoom of [0.5, 0.85, 1, 3]) {
    const viewport = createAuthoringSurfaceViewport({
      hostWidth: 990,
      hostHeight: 712,
      worldScale: 4.6,
      zoom,
      panX: 0,
      panY: 0,
      devicePixelRatio: 2,
    });
    assert.ok(viewport.pixelWidth * viewport.pixelHeight * 4 <= AUTHORING_CANVAS_BYTE_BUDGET);
    assert.ok(viewport.worldWidth >= Math.min(viewport.fullWorldWidth, 990 / zoom));
    assert.ok(viewport.worldHeight >= Math.min(viewport.fullWorldHeight, 712 / zoom));
  }
});

test("phone and tablet viewports keep their full visible world covered", () => {
  for (const [hostWidth, hostHeight, dpr] of [[390, 600, 3], [900, 500, 2]] as const) {
    const viewport = createAuthoringSurfaceViewport({ hostWidth, hostHeight, worldScale: 4.6, zoom: 0.85, panX: 0, panY: 0, devicePixelRatio: dpr });
    assert.ok(viewport.worldWidth >= hostWidth / 0.85);
    assert.ok(viewport.worldHeight >= hostHeight / 0.85);
    assert.ok(viewport.pixelWidth * viewport.pixelHeight * 4 <= AUTHORING_CANVAS_BYTE_BUDGET);
  }
});

test("scaled live brush tiles repaint after their pixels mutate", () => {
  const paintedValues: number[] = [];
  let createdCanvasCount = 0;
  const sourceCanvas = {
    width: 0,
    height: 0,
    latestValue: 0,
    getContext: () => ({
      putImageData: (bitmap: ImageData) => {
        sourceCanvas.latestValue = bitmap.data[0] ?? 0;
      },
    }),
  };
  const previousDocument = globalThis.document;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (tag: string) => {
        assert.equal(tag, "canvas");
        createdCanvasCount += 1;
        return sourceCanvas;
      },
    },
  });

  try {
    const targetContext = {
      canvas: { width: 50, height: 50 },
      save: () => undefined,
      restore: () => undefined,
      setTransform: () => undefined,
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      drawImage: (source: typeof sourceCanvas) => paintedValues.push(source.latestValue),
    } as unknown as CanvasRenderingContext2D;
    const patch = { width: 1, height: 1, data: new Uint8ClampedArray([17, 0, 0, 255]) } as ImageData;
    const viewport = {
      referenceLeft: 0,
      referenceTop: 0,
      referenceSpanWidth: 100,
      referenceSpanHeight: 100,
    } as AuthoringSurfaceViewport;

    drawReferencePatchToAuthoringSurface(targetContext, patch, 0, 0, viewport);
    patch.data[0] = 91;
    drawReferencePatchToAuthoringSurface(targetContext, patch, 0, 0, viewport);

    assert.deepEqual(paintedValues, [17, 91]);
    assert.equal(createdCanvasCount, 1, "the temporary tile canvas is reused without reusing stale pixels");
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
  }
});
