import {
  isDrawingAiReasoningLevel,
  isDrawingAiTaskType,
  type DrawingAiReasoningLevel,
  type DrawingAiTaskType,
} from "./drawingAiContract.ts";

const DRAWING_AI_CONTROL_PREFERENCES_STORAGE_KEY = "da_drawing_ai_control_preferences_v1";

export type DrawingAiControlPreferences = {
  reasoningLevel: DrawingAiReasoningLevel;
  taskType: DrawingAiTaskType;
};

export const DEFAULT_DRAWING_AI_CONTROL_PREFERENCES: DrawingAiControlPreferences = {
  reasoningLevel: "medium",
  taskType: "generate-plans",
};

const isBrowser = () => typeof window !== "undefined";

export const readDrawingAiControlPreferences = (): DrawingAiControlPreferences => {
  if (!isBrowser()) {
    return DEFAULT_DRAWING_AI_CONTROL_PREFERENCES;
  }

  try {
    const rawValue = window.localStorage.getItem(DRAWING_AI_CONTROL_PREFERENCES_STORAGE_KEY);
    if (!rawValue) {
      return DEFAULT_DRAWING_AI_CONTROL_PREFERENCES;
    }

    const parsedValue = JSON.parse(rawValue) as {
      reasoningLevel?: unknown;
      taskType?: unknown;
    } | null;

    return {
      reasoningLevel: isDrawingAiReasoningLevel(parsedValue?.reasoningLevel)
        ? parsedValue.reasoningLevel
        : DEFAULT_DRAWING_AI_CONTROL_PREFERENCES.reasoningLevel,
      taskType: isDrawingAiTaskType(parsedValue?.taskType)
        ? parsedValue.taskType
        : DEFAULT_DRAWING_AI_CONTROL_PREFERENCES.taskType,
    };
  } catch {
    return DEFAULT_DRAWING_AI_CONTROL_PREFERENCES;
  }
};

export const writeDrawingAiControlPreferences = (preferences: DrawingAiControlPreferences) => {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(
    DRAWING_AI_CONTROL_PREFERENCES_STORAGE_KEY,
    JSON.stringify({
      reasoningLevel: preferences.reasoningLevel,
      taskType: preferences.taskType,
    }),
  );
};
