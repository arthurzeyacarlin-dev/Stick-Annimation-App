import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function phase1Environment(label: string) {
  const root = resolve("output/spec-0012/phase-1-correction/environment");
  mkdirSync(root, { recursive: true });
  const fixture = JSON.parse(readFileSync("scripts/fixtures/spec0001-browser/v1/next-font-google-response.json", "utf8"));
  const responses: Record<string, string> = {};
  for (const response of fixture.responses) {
    responses[response.url] = response.faces.map((face: { file: string; sha256: string; subset: string; unicodeRange: string }) => {
      const bytes = readFileSync(face.file);
      assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`, face.sha256);
      return `/* ${face.subset} */\n@font-face { font-family: '${response.family}'; font-style: normal; font-weight: 100 900; font-display: swap; src: url(${resolve(face.file)}) format('woff2'); unicode-range: ${face.unicodeRange}; }`;
    }).join("\n");
  }
  const fontPath = resolve(root, "font-responses.cjs");
  writeFileSync(fontPath, `module.exports = ${JSON.stringify(responses)};\n`);
  const ledger = resolve(root, `${label}-network.jsonl`);
  writeFileSync(ledger, "");
  return {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontPath,
    OPENAI_API_KEY: "",
    SUPABASE_URL: "",
    SUPABASE_ANON_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    SPEC0001_NETWORK_LEDGER: ledger,
    // This correction worktree uses the canonical ignored dependency tree by symlink.
    // Bind the guard to the resolved package root so Next's own worker fork stays local.
    SPEC0001_REPOSITORY_ROOT: dirname(realpathSync("node_modules")),
    NODE_OPTIONS: `--require=${resolve("scripts/spec0001-browser/networkDeny.cjs")}`,
  };
}
