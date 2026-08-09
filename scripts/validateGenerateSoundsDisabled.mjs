import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const expectedDisabledMessage = "This task is temporarily unavailable right now.";

const soundPrompts = [
  "please generate me an explosion sound effect",
  "generate me a punch sound effect",
  "generate me a footsteps sound effect",
  "generate me a bone crack sound effect",
];

const sanityChecks = [
  {
    label: "generate-frames",
    body: {
      prompt: "generate 1 frame of a stick figure waving",
      taskType: "generate-frames",
    },
  },
  {
    label: "generate-plans",
    body: {
      prompt: "make a short animation plan for a character jumping over a rock",
      taskType: "generate-plans",
    },
  },
  {
    label: "other",
    body: {
      prompt: "save project",
      taskType: "other",
    },
  },
];

const compileSoundModules = async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "generate-sounds-disabled-"));
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
    process.env.OPENAI_API_KEY ||= "dummy";

    const { normalizeDrawingAiResponse } = require(contractModulePath);
    const { synthesizeSoundOptionToDataUrl } = require(synthesisModulePath);
    const builtRoute = require(path.join(repoRoot, ".next/server/app/api/ai/route.js"));
    const postAiRoute = async (body) =>
      builtRoute.routeModule.userland.POST(
        new Request("http://localhost/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shouldSearch: false,
            reasoningLevel: "medium",
            conversationHistory: [],
            followUpMemory: [],
            activeFollowUp: null,
            followUpAnswerSource: null,
            followUpInteractionKind: null,
            workspaceContext: null,
            recentSoundOptions: null,
            ...body,
          }),
        }),
      );

    const soundResults = [];
    for (const prompt of soundPrompts) {
      const response = await postAiRoute({
        prompt,
        taskType: "generate-sounds",
      });
      const { json, rawText } = await parseJsonSafely(response);
      const normalizedResponse =
        json !== null
          ? normalizeDrawingAiResponse(json, {
              fallbackOutput: "Generate Sounds disabled validation fallback output.",
              fallbackTaskType: "generate-sounds",
              fallbackReasoningLevel: "medium",
              logContext: "validateGenerateSoundsDisabled",
            })
          : null;

      soundResults.push({
        prompt,
        status: response.status,
        routeReturnedSuccessfully: response.status === 200,
        exactMessageOnly: normalizedResponse?.output === expectedDisabledMessage,
        soundOptionsReturned: Array.isArray(normalizedResponse?.soundOptions) && normalizedResponse.soundOptions.length > 0,
        actionPlanReturned: normalizedResponse?.actionPlan != null,
        followUpMode: normalizedResponse?.followUpMode ?? null,
        rawTextPreview: rawText.slice(0, 240),
      });
    }

    let synthDisabledMessage = null;
    try {
      await synthesizeSoundOptionToDataUrl({
        id: "disabled-preview-check",
        title: "Explosion Test",
        description: "Explosion preview should be blocked while sound generation is disabled.",
        timingFeel: null,
        intensityFeel: null,
        durationSeconds: null,
        negativeConstraints: null,
        contentType: "sfx",
        speechText: null,
        soundFamily: "explosion",
        soundProfile: "heavy-clean-blast",
      });
    } catch (error) {
      synthDisabledMessage = error instanceof Error ? error.message : String(error);
    }

    const sanityResults = [];
    for (const check of sanityChecks) {
      try {
        const response = await postAiRoute(check.body);
        sanityResults.push({
          label: check.label,
          status: response.status,
          routeReturnedSuccessfully: response.status === 200,
        });
      } catch (error) {
        sanityResults.push({
          label: check.label,
          status: null,
          routeReturnedSuccessfully: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const result = {
      validationMode: "direct-built-route",
      expectedDisabledMessage,
      soundResults,
      synthDisabledMessage,
      sanityResults,
    };

    console.log(JSON.stringify(result, null, 2));

    if (
      soundResults.some(
        (entry) =>
          !entry.routeReturnedSuccessfully ||
          !entry.exactMessageOnly ||
          entry.soundOptionsReturned ||
          entry.actionPlanReturned ||
          entry.followUpMode !== "none",
      ) ||
      synthDisabledMessage !== expectedDisabledMessage
    ) {
      process.exitCode = 1;
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
};

void main();
