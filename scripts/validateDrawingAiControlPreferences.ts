export {};

type LocalStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const storage = new Map<string, string>();

const localStorageMock: LocalStorageLike = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => {
    storage.set(key, value);
  },
  removeItem: (key) => {
    storage.delete(key);
  },
};

Object.assign(globalThis, {
  window: {
    localStorage: localStorageMock,
  },
});

const drawingAiControlPreferencesModuleUrl = new URL("../src/lib/ai/drawingAiControlPreferences.ts", import.meta.url);

const {
  DEFAULT_DRAWING_AI_CONTROL_PREFERENCES,
  readDrawingAiControlPreferences,
  writeDrawingAiControlPreferences,
} = await import(drawingAiControlPreferencesModuleUrl.href);

const defaults = readDrawingAiControlPreferences();

writeDrawingAiControlPreferences({
  reasoningLevel: "high",
  taskType: "generate-frames",
});
const restoredSelection = readDrawingAiControlPreferences();

localStorageMock.setItem(
  "da_drawing_ai_control_preferences_v1",
  JSON.stringify({
    reasoningLevel: "wrong",
    taskType: "not-a-task",
  }),
);
const invalidStoredValueFallback = readDrawingAiControlPreferences();

const results = {
  defaultsAreStable:
    defaults.reasoningLevel === DEFAULT_DRAWING_AI_CONTROL_PREFERENCES.reasoningLevel &&
    defaults.taskType === DEFAULT_DRAWING_AI_CONTROL_PREFERENCES.taskType,
  persistedSelectionRestoresAcrossRemount:
    restoredSelection.reasoningLevel === "high" && restoredSelection.taskType === "generate-frames",
  invalidStoredValuesFallBackSafely:
    invalidStoredValueFallback.reasoningLevel === DEFAULT_DRAWING_AI_CONTROL_PREFERENCES.reasoningLevel &&
    invalidStoredValueFallback.taskType === DEFAULT_DRAWING_AI_CONTROL_PREFERENCES.taskType,
};

const allChecksPassed = Object.values(results).every(Boolean);

console.log(
  JSON.stringify(
    {
      allChecksPassed,
      results,
    },
    null,
    2,
  ),
);

if (!allChecksPassed) {
  process.exit(1);
}
