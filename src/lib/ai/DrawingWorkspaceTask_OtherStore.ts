import {
  GENERATE_OTHER_INTENT_EXAMPLES,
  GENERATE_OTHER_LLM_TRAINING_EXAMPLES,
  formatOtherExamplesForPrompt,
  formatOtherIntentExamplesForPrompt,
  selectRelevantOtherExamples,
  type OtherTaskExample,
  type OtherTaskIntentExample,
} from "./DrawingWorkspaceTask_Other";

/**
 * Task Other uses a local training set for now.
 * The retrieval shape mirrors the other task modules so the live route
 * can treat it as a first-class command-routing task without overbuilding storage yet.
 */

export const getOtherExamples = async (): Promise<OtherTaskExample[]> => GENERATE_OTHER_LLM_TRAINING_EXAMPLES;

export const getOtherIntentExamples = async (): Promise<OtherTaskIntentExample[]> => GENERATE_OTHER_INTENT_EXAMPLES;

export const getRelevantOtherExamples = async ({
  userMessage,
  analysisInput,
  limit = 6,
}: {
  userMessage: string;
  analysisInput: string;
  limit?: number;
}) => {
  const examples = await getOtherExamples();
  return selectRelevantOtherExamples({
    examples,
    userMessage,
    analysisInput,
    limit,
  });
};

export const getRelevantOtherExamplesPromptBlock = async ({
  userMessage,
  analysisInput,
  limit = 6,
}: {
  userMessage: string;
  analysisInput: string;
  limit?: number;
}) => {
  const examples = await getRelevantOtherExamples({
    userMessage,
    analysisInput,
    limit,
  });

  return {
    examples,
    formatted: formatOtherExamplesForPrompt(examples),
  };
};

export const getOtherIntentExamplesPromptBlock = async () => {
  const examples = await getOtherIntentExamples();

  return {
    examples,
    formatted: formatOtherIntentExamplesForPrompt(examples),
  };
};
