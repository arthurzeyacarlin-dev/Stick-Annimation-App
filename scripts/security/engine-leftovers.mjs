// (Nov 12 security, item 7) DRY RUN ONLY: lists what a leftover sweep of the engine output folder WOULD remove, and removes nothing.
// A version folder is a saved animation (plan, report, video, layers, blocks - editing reads the old shapes), so it is NEVER a leftover.
// Leftovers = (a) `*.part.json` temp files, (b) `v*` folders that the animation's own animation.json does not list, both older than a day.
//   node scripts/security/engine-leftovers.mjs [outDir]      (default: ../ltx-effects/out/app-v1 next to this app copy)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const outDir = resolve(process.argv[2] ?? join(process.cwd(), "..", "ltx-effects", "out", "app-v1"));
const DAY = 24 * 60 * 60 * 1000, now = Date.now();
const dirs = (p) => { try { return readdirSync(p, { withFileTypes: true }); } catch { return []; } };
const old = (p) => { try { return now - statSync(p).mtimeMs > DAY; } catch { return false; } };
let versions = 0, kept = 0, parts = [], unlisted = [], unknown = [];
for (const project of dirs(outDir)) if (project.isDirectory()) for (const anim of dirs(join(outDir, project.name))) {
  if (!anim.isDirectory()) continue;
  const dir = join(outDir, project.name, anim.name);
  let listed = null;
  try {
    const a = JSON.parse(readFileSync(join(dir, "animation.json"), "utf8"));
    // a version may live in a retry folder (dir "v1-viewer1") that still leans on its number's first folder ("v1"): the NUMBER is what is referenced
    listed = new Set((a.versions ?? []).flatMap((v, i) => [String(v?.n ?? i + 1), String(i + 1), ...(typeof v?.dir === "string" ? [v.dir.match(/^v(\d+)/)?.[1] ?? ""] : [])]));
  } catch { /* no animation.json: nothing is known about this folder, so nothing here is a leftover */ }
  for (const entry of dirs(dir)) {
    const p = join(dir, entry.name);
    if (entry.isFile()) { if (entry.name.endsWith(".part.json") && old(p)) parts.push(p); continue; }
    if (!/^v\d+/.test(entry.name)) { unknown.push(p); continue; }
    versions += 1;
    const number = entry.name.match(/^v(\d+)/)?.[1] ?? "";
    if (listed && !listed.has(number) && old(p)) unlisted.push(p); else kept += 1;
    for (const f of dirs(p)) if (f.isFile() && f.name.endsWith(".part.json") && old(join(p, f.name))) parts.push(join(p, f.name));
  }
}
console.log(`out: ${outDir}`);
console.log(`version folders: ${versions} (kept: ${kept})`);
console.log(`WOULD remove ${parts.length} *.part.json file(s):`); parts.forEach((p) => console.log("  " + p));
console.log(`WOULD remove ${unlisted.length} unlisted version folder(s) (older than a day):`); unlisted.forEach((p) => console.log("  " + p));
console.log(`left alone, unknown names (${unknown.length}):`); unknown.slice(0, 20).forEach((p) => console.log("  " + p));
console.log("DRY RUN - nothing was removed.");
