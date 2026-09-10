"use client";

import { useEffect, useRef, useState } from "react";
import type { UnifiedAnimationAssetManifestV1, UnifiedAnimationDocumentV1, UnifiedAnimationResolvedAssetV1 } from "@/src/lib/animation/unifiedAnimationContract";
import { UnifiedStageRenderer, type StagePresentationReceipt } from "@/src/lib/animation/unifiedStageRenderer";

export function UnifiedAnimationStage({ document, index, assets, resolvedAssets, onPresented }: {
  document: UnifiedAnimationDocumentV1; index: number;
  assets: readonly UnifiedAnimationAssetManifestV1[]; resolvedAssets: readonly UnifiedAnimationResolvedAssetV1[];
  onPresented?: (receipt: StagePresentationReceipt, renderer: UnifiedStageRenderer) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), renderer = useRef<UnifiedStageRenderer | null>(null);
  const [error, setError] = useState(false);
  const presented = useRef(onPresented);
  useEffect(() => { presented.current = onPresented; }, [onPresented]);
  useEffect(() => {
    const current = new UnifiedStageRenderer(canvas.current!, assets, resolvedAssets);
    renderer.current = current;
    return () => { current.dispose(); renderer.current = null; };
  }, [assets, resolvedAssets]);
  useEffect(() => {
    let alive = true;
    const current = renderer.current!;
    void current.render(document, index).then(receipt => {
      if (!alive || !receipt) return;
      setError(false); presented.current?.(receipt, current);
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [document, index, assets, resolvedAssets]);
  return <>
    <canvas ref={canvas} width={1920} height={1080} aria-label="Animation stage" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
    {error ? <span role="alert" style={{ position: "absolute", left: 32, top: 32, padding: 16, background: "#1a1b24", color: "white", fontSize: 28 }}>Could not render this frame. The last complete frame is preserved.</span> : null}
  </>;
}
