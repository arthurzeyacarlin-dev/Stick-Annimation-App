import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const apiBaseUrl = process.env.GENERATE_SOUNDS_ROUTE_URL ?? "http://localhost:3000";

const prompts = [
  "please generate me an explosion sound effect",
  "generate me a punch sound effect",
  "generate me a footsteps sound effect",
];

class NodeFileReader {
  result = null;
  error = null;
  onload = null;
  onerror = null;

  async readAsDataURL(blob) {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
      this.onload?.();
    } catch (error) {
      this.error = error instanceof Error ? error : new Error("Preview encoding failed.");
      this.onerror?.();
    }
  }
}

globalThis.FileReader = NodeFileReader;

const compileSoundModules = async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "generate-sounds-route-"));
  const outDir = path.join(tempRoot, "compiled");
  const files = [
    "src/lib/ai/frameGenerationSafety.ts",
    "src/lib/ai/drawingAiContract.ts",
    "src/lib/ai/drawingSoundAvailability.ts",
    "src/lib/ai/drawingSoundSynthesis.ts",
  ].map((relativePath) => path.join(repoRoot, relativePath));

  await execFileAsync(
    "npx",
    [
      "tsc",
      "--pretty",
      "false",
      "--outDir",
      outDir,
      "--rootDir",
      repoRoot,
      "--module",
      "nodenext",
      "--moduleResolution",
      "nodenext",
      "--target",
      "es2022",
      "--lib",
      "es2022,dom",
      "--skipLibCheck",
      "true",
      ...files,
    ],
    { cwd: repoRoot },
  );

  return {
    tempRoot,
    contractModulePath: path.join(outDir, "src/lib/ai/drawingAiContract.js"),
    synthesisModulePath: path.join(outDir, "src/lib/ai/drawingSoundSynthesis.js"),
  };
};

const parseJsonSafely = async (response) => {
  const text = await response.text();
  try {
    return { json: JSON.parse(text), rawText: text };
  } catch {
    return { json: null, rawText: text };
  }
};

const main = async () => {
  const { tempRoot, contractModulePath, synthesisModulePath } = await compileSoundModules();

  try {
    const { normalizeDrawingAiResponse } = require(contractModulePath);
    const { synthesizeSoundOptionToDataUrl } = require(synthesisModulePath);

    const results = [];

    for (const prompt of prompts) {
      const response = await fetch(`${apiBaseUrl}/api/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          shouldSearch: false,
          reasoningLevel: "medium",
          taskType: "generate-sounds",
          conversationHistory: [],
          followUpMemory: [],
          activeFollowUp: null,
          followUpAnswerSource: null,
          followUpInteractionKind: null,
          workspaceContext: null,
          recentSoundOptions: null,
        }),
      });

      const { json, rawText } = await parseJsonSafely(response);
      const normalizedResponse =
        json !== null
          ? normalizeDrawingAiResponse(json, {
              fallbackOutput: "Route validation fallback output.",
              fallbackTaskType: "generate-sounds",
              fallbackReasoningLevel: "medium",
              logContext: "validateGenerateSoundsRoute",
            })
          : null;

      const soundOptions = normalizedResponse?.soundOptions ?? null;
      const previewChecks = [];
      if (Array.isArray(soundOptions)) {
        for (const option of soundOptions) {
          try {
            await synthesizeSoundOptionToDataUrl(option);
            previewChecks.push({ title: option.title, ok: true, error: null });
          } catch (error) {
            previewChecks.push({
              title: option.title,
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      const warnings = normalizedResponse?.warnings ?? [];
      results.push({
        prompt,
        status: response.status,
        routeReturned200: response.status === 200,
        soundOptionsReturned: Array.isArray(soundOptions) && soundOptions.length > 0,
        optionCount: Array.isArray(soundOptions) ? soundOptions.length : 0,
        previewGenerationSucceeded: previewChecks.length > 0 && previewChecks.every((check) => check.ok),
        repairPathUsed: warnings.some((warning) => /Dropped .* malformed sound option/i.test(warning)),
        safeFallbackUsed: warnings.some((warning) => /safe fallback/i.test(warning)),
        warnings,
        previewChecks,
        rawTextPreview: rawText.slice(0, 240),
      });
    }

    console.log(JSON.stringify({ apiBaseUrl, results }, null, 2));

    if (
      results.some(
        (result) =>
          !result.routeReturned200 ||
          !result.soundOptionsReturned ||
          !result.previewGenerationSucceeded,
      )
    ) {
      process.exitCode = 1;
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
};

void main();
