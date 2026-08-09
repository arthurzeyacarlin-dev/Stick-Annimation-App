import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const expectedDisabledMessage = "This task is temporarily unavailable right now.";

const taskCases = [
  {
    label: "generate-frames",
    body: {
      prompt: "generate 1 frame of a stick figure waving",
      taskType: "generate-frames",
    },
  },
  {
    label: "generate-sounds",
    body: {
      prompt: "generate me an explosion sound effect",
      taskType: "generate-sounds",
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

const compileValidationModules = async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "drawing-ai-task-shutdown-"));
  const outDir = path.join(tempRoot, "compiled");
  const files = [
    "src/lib/ai/frameGenerationSafety.ts",
    "src/lib/ai/drawingAiContract.ts",
    "src/lib/ai/drawingAiTaskAvailability.ts",
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

const checkFileExists = async (relativePath) => {
  try {
    await access(path.join(repoRoot, relativePath));
    return true;
  } catch {
    return false;
  }
};

const main = async () => {
  const { tempRoot, contractModulePath, synthesisModulePath } = await compileValidationModules();

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

    const taskResults = [];
    for (const taskCase of taskCases) {
      const response = await postAiRoute(taskCase.body);
      const { json, rawText } = await parseJsonSafely(response);
      const normalizedResponse =
        json !== null
          ? normalizeDrawingAiResponse(json, {
              fallbackOutput: "Task shutdown validation fallback output.",
              fallbackTaskType: taskCase.body.taskType,
              fallbackReasoningLevel: "medium",
              logContext: "validateDrawingAiTaskShutdown",
            })
          : null;

      taskResults.push({
        label: taskCase.label,
        status: response.status,
        routeReturnedSuccessfully: response.status === 200,
        exactMessageOnly: normalizedResponse?.output === expectedDisabledMessage,
        followUpMode: normalizedResponse?.followUpMode ?? null,
        generatedFramePlanReturned: normalizedResponse?.generatedFramePlan != null,
        soundOptionsReturned:
          Array.isArray(normalizedResponse?.soundOptions) && normalizedResponse.soundOptions.length > 0,
        actionPlanReturned: normalizedResponse?.actionPlan != null,
        rawTextPreview: rawText.slice(0, 240),
      });
    }

    let synthDisabledMessage = null;
    try {
      await synthesizeSoundOptionToDataUrl({
        id: "disabled-preview-check",
        title: "Explosion Test",
        description: "Explosion preview should stay blocked while task execution is disabled.",
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

    const drawingAiPanelSource = await readFile(
      path.join(repoRoot, "src/components/workspace/ai/DrawingAiPanel.tsx"),
      "utf8",
    );
    const routeSource = await readFile(path.join(repoRoot, "app/api/ai/route.ts"), "utf8");

    const sourceChecks = {
      taskButtonsPresent:
        drawingAiPanelSource.includes('label: "Generate Plans"') &&
        drawingAiPanelSource.includes('label: "Generate Frames"') &&
        drawingAiPanelSource.includes('label: "Generate Sounds"') &&
        drawingAiPanelSource.includes('label: "Other"'),
      soundShellPresent:
        drawingAiPanelSource.includes("Sound Effect {optionIndex + 1}") &&
        drawingAiPanelSource.includes("draggable={isSoundGenerationEnabled()}") &&
        drawingAiPanelSource.includes("Click to preview. Drag to the timeline to attach."),
      followUpUiPresent:
        drawingAiPanelSource.includes("const handleFollowUpOptionClick") &&
        drawingAiPanelSource.includes("const handleFollowUpContinue") &&
        drawingAiPanelSource.includes('followUpMode === "question-box"'),
      normalConversationPathPresent:
        routeSource.includes('if (taskIntentClassification.kind !== "task")') &&
        routeSource.includes('"non-task-conversation"'),
      temporaryShutdownGuardPresent:
        routeSource.includes("shouldReturnTemporarilyDisabledTaskResponse") &&
        routeSource.includes('"task-execution-temporarily-disabled"'),
    };

    const exampleChecks = {
      generatePlansExamplesPresent: await checkFileExists("src/lib/ai/plansTraining.ts"),
      generateFramesExamplesPresent: await checkFileExists("src/lib/ai/DrawingWorkspaceTask_GenerateFrames.ts"),
      generateSoundsExamplesPresent: await checkFileExists("src/lib/ai/DrawingWorkspaceTask_GenerateSound.ts"),
      otherExamplesPresent: await checkFileExists("src/lib/ai/DrawingWorkspaceTask_Other.ts"),
    };

    const result = {
      validationMode: "built-route-and-source-checks",
      expectedDisabledMessage,
      taskResults,
      synthDisabledMessage,
      sourceChecks,
      exampleChecks,
    };

    console.log(JSON.stringify(result, null, 2));

    const taskFailures = taskResults.some(
      (entry) =>
        !entry.routeReturnedSuccessfully ||
        !entry.exactMessageOnly ||
        entry.followUpMode !== "none" ||
        entry.generatedFramePlanReturned ||
        entry.soundOptionsReturned ||
        entry.actionPlanReturned,
    );
    const sourceFailures = Object.values(sourceChecks).some((value) => value !== true);
    const exampleFailures = Object.values(exampleChecks).some((value) => value !== true);

    if (taskFailures || synthDisabledMessage !== expectedDisabledMessage || sourceFailures || exampleFailures) {
      process.exitCode = 1;
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
};

void main();
