// (Nov 15 night, Arthur: "the preview of my most recent animation sometimes takes a long time to appear. I want it to pop up as soon as
// it can") THE HOME PICTURE AT ONCE: one small picture per project, kept in this browser. The home card shows it immediately while the
// project itself is still being loaded for the real one. Written when the home card has drawn a project's picture, and by the AI
// panel right after a version lands. A convenience only: nothing here is the project, and a missing or blocked store changes nothing.
const KEY = "diamond-home-poster:";
const INDEX = "diamond-home-poster-index";
const KEEP = 12;          // (projects)
const MAX_TEXT = 400_000; // (characters of one picture)

const store = (): Storage | null => { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } };

// (the library names a project "unified-v2:<id>", the workspace "<id>": one name for both)
const nameOf = (projectId: string) => projectId.slice(projectId.lastIndexOf(":") + 1);
export type HomePoster = { url: string; at: number }; // at = the moment (ms) the picture shows the project at

export function readHomePoster(projectId: string | null | undefined): HomePoster | null {
  if (!projectId) return null;
  try {
    const kept = JSON.parse(store()?.getItem(KEY + nameOf(projectId)) ?? "null") as HomePoster | null;
    return kept && typeof kept.url === "string" && kept.url.startsWith("data:image/") && Number.isFinite(kept.at) ? kept : null;
  } catch { return null; }
}

// at: the moment the picture is of (a landing = now; the home card's own picture = the project's saved time). An older picture never
// replaces a newer one: the picture of an animation that just landed stays until a save that is newer than it has been drawn.
export function writeHomePoster(projectId: string | null | undefined, url: string | null | undefined, at: number = Date.now()): void {
  const s = store();
  if (!s || !projectId || !url || !url.startsWith("data:image/") || url.length > MAX_TEXT || !Number.isFinite(at)) return;
  const name = nameOf(projectId);
  try {
    const kept = readHomePoster(name);
    if (kept && kept.at > at) return;
    let ids: string[] = [];
    try { const raw = JSON.parse(s.getItem(INDEX) ?? "[]"); if (Array.isArray(raw)) ids = raw.filter((id): id is string => typeof id === "string"); } catch { ids = []; }
    ids = [name, ...ids.filter((id) => id !== name)];
    for (const old of ids.slice(KEEP)) s.removeItem(KEY + old);
    s.setItem(INDEX, JSON.stringify(ids.slice(0, KEEP)));
    s.setItem(KEY + name, JSON.stringify({ url, at }));
  } catch { /* a full or blocked store: the home card simply loads the picture as before */ }
}

/** One picture of an animation (a data URL; transparent paper) -> the small home picture on white. Browser only; null when it cannot be made. */
export async function smallPosterFrom(pictureUrl: string): Promise<string | null> {
  try {
    const image = new Image();
    await new Promise<void>((done, fail) => { image.onload = () => done(); image.onerror = () => fail(new Error("picture")); image.src = pictureUrl; });
    const scale = Math.min(480 / Math.max(1, image.naturalWidth), 270 / Math.max(1, image.naturalHeight), 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch { return null; }
}
