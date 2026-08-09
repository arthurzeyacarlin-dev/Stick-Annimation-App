import type { DrawingAiResponse } from "./drawingAiContract";
import {
  DRAWING_AI_TEMPORARILY_DISABLED_MESSAGE,
  buildTemporarilyDisabledTaskResponseFields,
} from "./drawingAiTaskAvailability";

export const SOUND_GENERATION_ENABLED = false;
export const SOUND_GENERATION_V2_ENABLED = false;

export const SOUND_GENERATION_DISABLED_MESSAGE = DRAWING_AI_TEMPORARILY_DISABLED_MESSAGE;

export const isSoundGenerationEnabled = () => SOUND_GENERATION_ENABLED && SOUND_GENERATION_V2_ENABLED;

export const buildGenerateSoundsDisabledResponseFields = (): Pick<
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
> => buildTemporarilyDisabledTaskResponseFields();
