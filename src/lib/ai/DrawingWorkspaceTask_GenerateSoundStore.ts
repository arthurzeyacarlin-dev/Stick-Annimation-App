import {
  GENERATE_SOUND_LLM_TRAINING_EXAMPLES,
  formatGenerateSoundExamplesForPrompt,
  selectRelevantGenerateSoundExamples,
  type GenerateSoundExample,
} from "./DrawingWorkspaceTask_GenerateSound";

/**
 * Generate Sound uses a local training set for now.
 * The retrieval shape matches the other task modules so we can
 * add persistence later without changing the live task flow.
 */

export const getGenerateSoundExamples = async (): Promise<GenerateSoundExample[]> => GENERATE_SOUND_LLM_TRAINING_EXAMPLES;

export const getRelevantGenerateSoundExamples = async ({
  userMessage,
  analysisInput,
  limit = 6,
}: {
  userMessage: string;
  analysisInput: string;
  limit?: number;
}) => {
  const examples = await getGenerateSoundExamples();
  return selectRelevantGenerateSoundExamples({
    examples,
    userMessage,
    analysisInput,
    limit,
  });
};

export const getRelevantGenerateSoundExamplesPromptBlock = async ({
  userMessage,
  analysisInput,
  limit = 6,
}: {
  userMessage: string;
  analysisInput: string;
  limit?: number;
}) => {
  const examples = await getRelevantGenerateSoundExamples({
    userMessage,
    analysisInput,
    limit,
  });

  return {
    examples,
    formatted: formatGenerateSoundExamplesForPrompt(examples),
  };
};
