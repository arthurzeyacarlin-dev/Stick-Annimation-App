import type { DrawingAiResponse, DrawingAiTaskType } from "./drawingAiContract";

export const DRAWING_AI_TEMPORARILY_DISABLED_MESSAGE = "This task is temporarily unavailable right now.";

const TEMPORARILY_DISABLED_TASK_TYPES: readonly DrawingAiTaskType[] = [
  "generate-plans",
  "generate-sounds",
  "other",
];

export const isDrawingAiTaskExecutionTemporarilyDisabled = (taskType: DrawingAiTaskType) =>
  TEMPORARILY_DISABLED_TASK_TYPES.includes(taskType);

export const buildTemporarilyDisabledTaskResponseFields = (): Pick<
  DrawingAiResponse,
  | "output"
  | "questionCardKind"
  | "followUpMode"
  | "followUpQuestion"
  | "followUpMultiSelect"
  | "followUpOptions"
  | "generatedFramePlan"
  | "soundOptions"
  | "actionPlan"
> => ({
  output: DRAWING_AI_TEMPORARILY_DISABLED_MESSAGE,
  questionCardKind: null,
  followUpMode: "none",
  followUpQuestion: null,
  followUpMultiSelect: null,
  followUpOptions: null,
  generatedFramePlan: null,
  soundOptions: null,
  actionPlan: null,
});
