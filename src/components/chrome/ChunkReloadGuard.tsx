"use client";

import { useEffect } from "react";

// SPEC-0020 Phase 6 (found in Arthur's review): when the app is updated while a page is open, the page can ask for a
// piece of the old app that no longer exists ("ChunkLoadError") and show a red error. Reload once, quietly, instead.
const RELOADED_KEY = "da-chunk-reload-at";

const isChunkLoadError = (reason: unknown) => {
  const name = reason instanceof Error ? reason.name : "";
  const message = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
  return name === "ChunkLoadError" || /Loading (CSS )?chunk [^ ]+ failed/i.test(message);
};

const reloadOnce = () => {
  try {
    const last = Number(window.sessionStorage.getItem(RELOADED_KEY) ?? 0);
    if (Date.now() - last < 30_000) return; // already tried just now: don't loop
    window.sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
  } catch {
    // Storage blocked: still reload once.
  }
  window.location.reload();
};

export function ChunkReloadGuard() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => { if (isChunkLoadError(event.error ?? event.message)) reloadOnce(); };
    const onRejection = (event: PromiseRejectionEvent) => { if (isChunkLoadError(event.reason)) reloadOnce(); };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
