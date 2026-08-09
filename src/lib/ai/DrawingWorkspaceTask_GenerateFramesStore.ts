import {
  GENERATE_FRAMES_LLM_TRAINING_EXAMPLES,
  formatGenerateFramesExamplesForPrompt,
  selectRelevantGenerateFramesExamples,
  type GenerateFramesExample,
} from "./DrawingWorkspaceTask_GenerateFrames";
import type { GenerateFramesRuntimeAnalysis } from "./generateFramesRuntime";

/**
 * Generate Frames is currently prepared with a local training set only.
 * We keep the same retrieval shape as Generate Plans so this mode can
 * evolve cleanly later without introducing placeholder persistence now.
 */

export const getGenerateFramesExamples = async (): Promise<GenerateFramesExample[]> => GENERATE_FRAMES_LLM_TRAINING_EXAMPLES;

export const getRelevantGenerateFramesExamples = async ({
  userMessage,
  analysisInput,
  limit = 6,
  runtimeAnalysis,
}: {
  userMessage: string;
  analysisInput: string;
  limit?: number;
  runtimeAnalysis?: GenerateFramesRuntimeAnalysis;
}) => {
  const examples = await getGenerateFramesExamples();
  return selectRelevantGenerateFramesExamples({
    examples,
    userMessage,
    analysisInput,
    limit,
    runtimeAnalysis,
  });
};

export const getRelevantGenerateFramesExamplesPromptBlock = async ({
  userMessage,
  analysisInput,
  limit = 6,
  runtimeAnalysis,
}: {
  userMessage: string;
  analysisInput: string;
  limit?: number;
  runtimeAnalysis?: GenerateFramesRuntimeAnalysis;
}) => {
  const examples = await getRelevantGenerateFramesExamples({
    userMessage,
    analysisInput,
    limit,
    runtimeAnalysis,
  });

  return {
    examples,
    formatted: formatGenerateFramesExamplesForPrompt(examples),
  };
};
