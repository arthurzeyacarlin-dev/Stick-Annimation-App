import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const require = createRequire(import.meta.url);

const prompts = [
  { key: "bone_crack_long", prompt: "generate me a bone crack sound effect that is two to three seconds long" },
  { key: "punch", prompt: "generate me a punch sound effect" },
  { key: "explosion", prompt: "generate me an explosion sound effect" },
  { key: "zipper", prompt: "generate a zipper closing sound effect" },
  { key: "volcano", prompt: "generate me a volcano sound effect" },
  { key: "wind", prompt: "generate me a wind sound effect" },
  { key: "rain", prompt: "generate me a rainy sound effect" },
  { key: "thunder", prompt: "generate me a thunderstrike sound effect" },
  { key: "sword", prompt: "generate me a sword slash sound effect" },
  { key: "footsteps", prompt: "generate me a footsteps sound effect" },
  { key: "water", prompt: "generate me a water splash sound effect" },
  { key: "combat_gods_explosion", prompt: "generate a combat gods explosion sound effect" },
  { key: "trex_roar", prompt: "generate me a t-rex roar sound effect" },
];

class NodeFileReader {
  result = null;

  error = null;

  onload = null;

  onerror = null;

  async readAsDataURL(blob) {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      this.result = `data:${blob.type || "application/octet-stream"};base64,${base64}`;
      this.onload?.();
    } catch (error) {
      this.error = error instanceof Error ? error : new Error("Audio trace failed.");
      this.onerror?.();
    }
  }
}

globalThis.FileReader = NodeFileReader;

const compileSoundModules = async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "generate-sound-trace-"));
  const outDir = path.join(tempRoot, "compiled");
  const files = [
    "src/lib/ai/frameGenerationSafety.ts",
    "src/lib/ai/drawingAiContract.ts",
    "src/lib/ai/drawingSoundAvailability.ts",
    "src/lib/ai/drawingSoundPlanner.ts",
    "src/lib/ai/drawingSoundOrchestrator.ts",
    "src/lib/ai/drawingSoundSynthesis.ts",
    "src/lib/ai/DrawingWorkspaceTask_GenerateSound.ts",
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
    {
      cwd: repoRoot,
    },
  );

  return {
    tempRoot,
    plannerModulePath: path.join(outDir, "src/lib/ai/drawingSoundPlanner.js"),
    orchestratorModulePath: path.join(outDir, "src/lib/ai/drawingSoundOrchestrator.js"),
    synthesisModulePath: path.join(outDir, "src/lib/ai/drawingSoundSynthesis.js"),
    trainingModulePath: path.join(outDir, "src/lib/ai/DrawingWorkspaceTask_GenerateSound.js"),
  };
};

const familyExampleTags = {
  "bone-break": ["bone-break", "material-distinction", "quality-behavior", "long-form"],
  punch: ["punch", "impact", "quality-behavior"],
  explosion: ["explosion", "quality-behavior"],
  volcano: ["volcano", "debris", "quality-behavior"],
  wind: ["wind", "quality-behavior", "long-form"],
  rain: ["rain", "quality-behavior", "long-form"],
  thunder: ["thunder", "quality-behavior"],
  sword: ["sword", "whoosh", "quality-behavior"],
  footsteps: ["footsteps", "quality-behavior"],
  water: ["water", "quality-behavior"],
  zipper: ["zipper", "quality-behavior", "mechanical"],
  creature: ["creature", "quality-behavior", "animal"],
};

const referenceFixtures = {
  combat_gods_explosion: [
    {
      title: "Combat Gods Battle Explosion Sound Reference",
      summary: "Epic cinematic blast with debris, dust, long readable decay, and powerful impact without muddy rumble.",
      url: "https://example.com/combat-gods-explosion",
    },
  ],
  trex_roar: [
    {
      title: "T-Rex Roar Creature Reference",
      summary: "Organic roar with breath, chest body, rasping top detail, and a shaped attack to tail contour.",
      url: "https://example.com/trex-roar",
    },
  ],
};

const buildBehaviorSummary = ({ family, profile, recipe }) => {
  if (family === "bone-break") {
    return recipe.durationSeconds >= 1.2
      ? "Bone fracture now uses a multi-stage snap/crack/runout shape instead of a tiny single-pop profile."
      : "Bone fracture keeps layered crack detail instead of a one-click pop.";
  }
  if (family === "punch") {
    return "Punch now stays contact-led with body-smack follow-through instead of a vague generic thud.";
  }
  if (family === "explosion") {
    return "Explosion preserves pressure/body/payoff structure without reintroducing shared low-growl contamination.";
  }
  if (family === "volcano") {
    return "Volcano now stays pressure/debris/ash-led instead of reading like a renamed explosion.";
  }
  if (family === "wind") {
    return "Wind now emphasizes layered moving air and gust shape instead of a flat low hum.";
  }
  if (family === "rain") {
    return profile === "window-rain-texture"
      ? "Rain now varies drop placement and supports a tighter window-like tick texture instead of same-pitch ticks."
      : "Rain now varies drop size and density instead of collapsing into a generic hiss or repeated tick.";
  }
  if (family === "thunder") {
    return "Thunder keeps flash-crack and storm-body separation instead of flattening into bland rumble.";
  }
  if (family === "sword") {
    return "Sword stays air-and-steel-led instead of a generic whoosh.";
  }
  if (family === "footsteps") {
    return "Footsteps now read as heel/sole contact sequences instead of a single dull thump.";
  }
  if (family === "water") {
    return "Water keeps slap/body/spray separation instead of a single plop.";
  }
  return "Family-specific shaping is preserved.";
};

const main = async () => {
  const { tempRoot, orchestratorModulePath, synthesisModulePath, trainingModulePath } = await compileSoundModules();

  try {
    const orchestratorModule = require(orchestratorModulePath);
    const synthesisModule = require(synthesisModulePath);
    const trainingModule = require(trainingModulePath);

    const { orchestrateGenerateSound, resolveRequestedSoundOptionCountV2 } = orchestratorModule;
    const { inspectSoundOptionRecipe, synthesizeSoundOptionToDataUrl } = synthesisModule;
    const { buildGenerateSoundTrainingAnalysisInput, selectRelevantGenerateSoundExamples } = trainingModule;

    const traces = [];

    for (const entry of prompts) {
      const analysisInput = buildGenerateSoundTrainingAnalysisInput({
        userMessage: entry.prompt,
        conversationHistory: [],
      });
      const selectedExamples = selectRelevantGenerateSoundExamples({
        userMessage: entry.prompt,
        analysisInput,
        limit: 6,
      });
      let orchestrationResult = orchestrateGenerateSound({
        userPrompt: entry.prompt,
        examples: selectedExamples,
        workspaceContext: null,
        recentSoundOptions: null,
        requestedOptionCount: resolveRequestedSoundOptionCountV2(entry.prompt),
        referenceSearchResults: [],
        targetFrameNumber: null,
      });
      if (orchestrationResult.referenceLookupQuery && referenceFixtures[entry.key]) {
        orchestrationResult = orchestrateGenerateSound({
          userPrompt: entry.prompt,
          examples: selectedExamples,
          workspaceContext: null,
          recentSoundOptions: null,
          requestedOptionCount: resolveRequestedSoundOptionCountV2(entry.prompt),
          referenceSearchResults: referenceFixtures[entry.key],
          targetFrameNumber: null,
        });
      }
      const optionSet = {
        family: orchestrationResult.soundPlan?.soundFamily ?? orchestrationResult.analysis.primaryFamily ?? "generic",
        recommendedIndex: 1,
        fallbackUsed: orchestrationResult.fallbackUsed,
        soundOptions: orchestrationResult.soundOptions ?? [],
      };
      const generatedOptions = [];

      for (const option of optionSet.soundOptions) {
        let previewGenerationSucceeded = false;
        let previewError = null;

        try {
          await synthesizeSoundOptionToDataUrl(option);
          previewGenerationSucceeded = true;
        } catch (error) {
          previewError = error instanceof Error ? error.message : String(error);
        }

        const recipe = inspectSoundOptionRecipe(option);
        generatedOptions.push({
          title: option.title,
          description: option.description,
          timingFeel: option.timingFeel,
          intensityFeel: option.intensityFeel,
          durationSeconds: option.durationSeconds ?? null,
          negativeConstraints: option.negativeConstraints ?? null,
          soundFamily: option.soundFamily ?? null,
          soundProfile: option.soundProfile ?? null,
          previewGenerationSucceeded,
          previewError,
          finalRecipeSummary: recipe,
        });
      }

      const recommendedOption =
        optionSet.soundOptions[Math.max(0, Math.min(optionSet.soundOptions.length - 1, optionSet.recommendedIndex - 1))] ??
        optionSet.soundOptions[0] ??
        null;
      const recommendedRecipe = recommendedOption ? inspectSoundOptionRecipe(recommendedOption) : null;
      const recommendedPreviewResult = generatedOptions.find((option) => option.title === recommendedOption?.title) ?? null;
      const relevantTags = familyExampleTags[optionSet.family] ?? [];
      const examplesInfluencedResult = selectedExamples.some(
        (example) =>
          example.tags.some((tag) => relevantTags.includes(tag)) ||
          example.category.includes(optionSet.family) ||
          example.tags.includes("quality-behavior"),
      );

      traces.push({
        key: entry.key,
        prompt: entry.prompt,
        selectedExampleIds: selectedExamples.map((example) => example.id),
        selectedExampleCategories: selectedExamples.map((example) => example.category),
        examplesInfluencedResult,
        generatedOptions,
        classifiedSoundFamily: optionSet.family,
        chosenRecommendedSoundProfile: recommendedOption?.soundProfile ?? null,
        fallbackUsed: optionSet.fallbackUsed,
        previewGenerationSucceeded: recommendedPreviewResult?.previewGenerationSucceeded ?? false,
        referenceLookupQuery: orchestrationResult.referenceLookupQuery,
        referenceUsed: orchestrationResult.referenceNote?.lookupUsed ?? false,
        whatChangedInBehavior: recommendedRecipe
          ? buildBehaviorSummary({
              family: optionSet.family,
              profile: recommendedOption?.soundProfile ?? null,
              recipe: recommendedRecipe,
            })
          : "No recommended recipe available.",
        finalRecipeSummary: recommendedRecipe,
      });
    }

    const recommendedSignatureMap = new Map();
    traces.forEach((trace) => {
      const signature = trace.finalRecipeSummary?.signature ?? "missing-signature";
      recommendedSignatureMap.set(signature, [...(recommendedSignatureMap.get(signature) ?? []), trace.key]);
    });

    const unrelatedDistinctKeys = new Set(["explosion", "punch", "footsteps", "thunder", "wind", "rain"]);
    const repeatedRecommendedRecipeSignaturesAcrossUnrelatedPrompts = Array.from(recommendedSignatureMap.entries())
      .filter(([, keys]) => keys.filter((key) => unrelatedDistinctKeys.has(key)).length > 1)
      .map(([signature, keys]) => ({ signature, prompts: keys.filter((key) => unrelatedDistinctKeys.has(key)) }));

    const comparisonSummary = {
      repeatedRecommendedRecipeSignaturesAcrossUnrelatedPrompts,
      boneCrackStillTooMuchLikeGenericPop: (() => {
        const boneTrace = traces.find((trace) => trace.key === "bone_crack_long");
        const signature = boneTrace?.finalRecipeSummary?.signature ?? "";
        const durationSeconds = boneTrace?.finalRecipeSummary?.durationSeconds ?? 0;
        return signature === "bone-crack:dry-snap" || durationSeconds < 1.2;
      })(),
      windStillCollapsesIntoWeakGenericOutput: (() => {
        const windTrace = traces.find((trace) => trace.key === "wind");
        return windTrace?.finalRecipeSummary?.signature === "generic" || windTrace?.classifiedSoundFamily !== "wind";
      })(),
      rainStillCollapsesIntoWeakGenericOutput: (() => {
        const rainTrace = traces.find((trace) => trace.key === "rain");
        return rainTrace?.finalRecipeSummary?.signature === "generic" || rainTrace?.classifiedSoundFamily !== "rain";
      })(),
      explosionAndVolcanoRemainDistinct: (() => {
        const explosionTrace = traces.find((trace) => trace.key === "explosion");
        const volcanoTrace = traces.find((trace) => trace.key === "volcano");
        return (
          explosionTrace?.classifiedSoundFamily !== volcanoTrace?.classifiedSoundFamily &&
          explosionTrace?.finalRecipeSummary?.signature !== volcanoTrace?.finalRecipeSummary?.signature
        );
      })(),
      punchFootstepsSwordRemainDistinct: (() => {
        const keys = ["punch", "footsteps", "sword"];
        const signatures = keys.map((key) => traces.find((trace) => trace.key === key)?.finalRecipeSummary?.signature ?? "missing");
        const families = keys.map((key) => traces.find((trace) => trace.key === key)?.classifiedSoundFamily ?? "missing");
        return new Set(signatures).size === signatures.length && new Set(families).size === families.length;
      })(),
    };

    console.log(
      JSON.stringify(
        {
          traces,
          comparisonSummary,
        },
        null,
        2,
      ),
    );

    if (
      traces.some((trace) => trace.previewGenerationSucceeded !== true) ||
      comparisonSummary.boneCrackStillTooMuchLikeGenericPop ||
      comparisonSummary.windStillCollapsesIntoWeakGenericOutput ||
      comparisonSummary.rainStillCollapsesIntoWeakGenericOutput ||
      !comparisonSummary.explosionAndVolcanoRemainDistinct ||
      !comparisonSummary.punchFootstepsSwordRemainDistinct ||
      comparisonSummary.repeatedRecommendedRecipeSignaturesAcrossUnrelatedPrompts.length > 0
    ) {
      process.exitCode = 1;
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
};

void main();
