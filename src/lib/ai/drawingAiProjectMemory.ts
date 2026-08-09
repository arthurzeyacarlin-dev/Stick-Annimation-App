import type {
  DrawingAiGeneratedFramePlan,
  DrawingAiGenerateFramesState,
  DrawingAiProjectInteractionMode,
  DrawingAiProjectMemory,
  DrawingAiProjectStoryState,
  DrawingAiTaskExecution,
  DrawingAiTaskType,
} from "./drawingAiContract.ts";

const normalizeProjectScopeId = (projectId: string | null | undefined) => {
  if (typeof projectId !== "string") {
    return null;
  }

  const trimmedProjectId = projectId.trim();
  return trimmedProjectId.length > 0 ? trimmedProjectId : null;
};

type DrawingAiProjectScopeOptions = {
  allowForeignProjectRebind?: boolean;
};

const DISCUSS_PROMPT_PATTERN =
  /\?|(?:\bwhat do you think\b|\bany ideas\b|\bbrainstorm\b|\bhelp me decide\b|\bwhich is better\b|\bwhat would look better\b|\bshould (?:i|we)\b|\badvice\b|\btips\b|\boptions\b|\bideas for\b)/i;
const CONTINUE_PROMPT_PATTERN =
  /\b(continue|continue from here|continue from the current drawing|continue the current drawing|keep going|next frame|next beat|after that|after this|then (?:he|she|they)|same scene|same animation|same project|keep the same)\b/i;
const TWEAK_PROMPT_PATTERN =
  /\b(make it|make them|make him|make her|make this|make the|change|tweak|refine|polish|only change|keep everything else|add |remove |adjust|swap|recolor|turn the|the (?:black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey) one|the (?:black|white|red|blue|green|yellow|orange|purple|pink|brown|gray|grey) stick(?:\s|-)?figure|solid head|filled head|no face|no visible face|guard stance|ready stance|fight(?:ing)? stance|face each other|facing each other|move .* left|move .* right|taller|bigger|smaller)\b/i;

const summarizeSubjects = (state: DrawingAiGenerateFramesState) => {
  if (state.subjects.length === 0) {
    return state.subjectType;
  }

  return state.subjects
    .map((subject) => {
      const colorPrefix = subject.color ? `${subject.color} ` : "";
      const detailSuffix =
        subject.details && subject.details.length > 0 && !subject.label?.toLowerCase().includes(`with ${subject.details[0]}`)
          ? ` with ${subject.details.join(" and ")}`
          : "";
      const label = `${subject.label?.trim() || subject.type}${detailSuffix}`.trim();
      return `${subject.side} ${colorPrefix}${label}`.trim();
    })
    .join(", ");
};

const summarizeGenerateFramesState = (state: DrawingAiGenerateFramesState) => {
  const parts: string[] = [];

  if (state.motionType !== "unknown") {
    parts.push(state.motionType);
  } else {
    parts.push(state.subjectType);
  }

  const subjectSummary = summarizeSubjects(state);
  if (subjectSummary) {
    parts.push(`subjects ${subjectSummary}`);
  }

  if (state.sceneSetting) {
    parts.push(`setting ${state.sceneSetting}`);
  }

  if (state.sceneDescriptors.length > 0) {
    parts.push(`scene ${state.sceneDescriptors.join(", ")}`);
  }

  if ((state.sceneElements ?? []).length > 0) {
    parts.push(`elements ${(state.sceneElements ?? []).join(", ")}`);
  }

  if ((state.focusTargets ?? []).length > 0) {
    parts.push(`focus ${(state.focusTargets ?? []).join(", ")}`);
  }

  if ((state.actionKeywords ?? []).length > 0) {
    parts.push(`actions ${(state.actionKeywords ?? []).join(", ")}`);
  }

  if (state.buildDirection) {
    parts.push(`direction ${state.buildDirection}`);
  }

  if (state.modifiers.length > 0) {
    parts.push(`mods ${state.modifiers.join(", ")}`);
  }

  return parts.join(" | ");
};

const appendRecentEdit = (existingEdits: readonly string[], prompt: string) => {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    return existingEdits.slice(-6);
  }

  const nextEdits = [...existingEdits];
  if (nextEdits[nextEdits.length - 1] !== trimmedPrompt) {
    nextEdits.push(trimmedPrompt);
  }

  return nextEdits.slice(-6);
};

const uniqueStrings = (values: readonly string[]) => [...new Set(values.filter((value) => value.length > 0))];

const summarizeStoryCastRegistry = (state: DrawingAiGenerateFramesState | null) => {
  if (!state) {
    return [];
  }

  return uniqueStrings(
    state.subjects
      .filter((subject) => subject.type !== "background")
      .map((subject) => {
        const sidePrefix = subject.side !== "center" ? `${subject.side} ` : "";
        const colorPrefix = subject.color ? `${subject.color} ` : "";
        const label = (subject.label?.trim() || subject.type).trim();
        return `${sidePrefix}${colorPrefix}${label}`.replace(/\s+/g, " ").trim();
      }),
  ).slice(0, 8);
};

const summarizeSceneForStoryState = (state: DrawingAiGenerateFramesState | null) => {
  if (!state) {
    return null;
  }

  const parts: string[] = [];
  if (state.sceneSetting) {
    parts.push(state.sceneSetting);
  }
  if (state.sceneDescriptors.length > 0) {
    parts.push(state.sceneDescriptors.slice(0, 2).join(", "));
  }

  const castSummary = summarizeStoryCastRegistry(state);
  if (castSummary.length > 0) {
    parts.push(castSummary.slice(0, 3).join(", "));
  }

  const summary = parts.join(" | ").trim();
  return summary.length > 0 ? summary : null;
};

const appendRecentSceneSummary = (existingSummaries: readonly string[], nextSummary: string | null) => {
  if (!nextSummary) {
    return existingSummaries.slice(-6);
  }

  const trimmedSummary = nextSummary.trim();
  if (trimmedSummary.length === 0) {
    return existingSummaries.slice(-6);
  }

  const nextSummaries = existingSummaries.filter((summary) => summary !== trimmedSummary);
  nextSummaries.push(trimmedSummary);
  return nextSummaries.slice(-6);
};

const mergeStoryState = (
  preferredStoryState: DrawingAiProjectStoryState | null | undefined,
  fallbackStoryState: DrawingAiProjectStoryState | null | undefined,
): DrawingAiProjectStoryState | null => {
  if (!preferredStoryState && !fallbackStoryState) {
    return null;
  }

  return {
    currentStoryGoal:
      preferredStoryState?.currentStoryGoal ?? fallbackStoryState?.currentStoryGoal ?? null,
    openSequenceArc:
      preferredStoryState?.openSequenceArc ?? fallbackStoryState?.openSequenceArc ?? null,
    castRegistry:
      preferredStoryState != null && preferredStoryState.castRegistry.length > 0
        ? preferredStoryState.castRegistry
        : fallbackStoryState?.castRegistry ?? [],
    styleAnchors: uniqueStrings([
      ...(fallbackStoryState?.styleAnchors ?? []),
      ...(preferredStoryState?.styleAnchors ?? []),
    ]).slice(0, 8),
    recentSceneSummaries:
      preferredStoryState != null && preferredStoryState.recentSceneSummaries.length > 0
        ? preferredStoryState.recentSceneSummaries
        : fallbackStoryState?.recentSceneSummaries ?? [],
  };
};

const buildUpdatedStoryState = ({
  existingMemory,
  generateFramesState,
  currentGoal,
}: {
  existingMemory: DrawingAiProjectMemory | null;
  generateFramesState: DrawingAiGenerateFramesState | null;
  currentGoal: string | null;
}): DrawingAiProjectStoryState | null => {
  const existingStoryState = existingMemory?.storyState ?? null;
  if (!existingStoryState && !generateFramesState) {
    return null;
  }

  const castRegistry =
    generateFramesState != null
      ? summarizeStoryCastRegistry(generateFramesState)
      : existingStoryState?.castRegistry ?? [];
  const styleAnchors = uniqueStrings([
    ...(existingStoryState?.styleAnchors ?? []),
    ...(generateFramesState?.executionGuidance?.stylePrinciples ?? []),
  ]).slice(0, 8);
  const nextSceneSummary =
    generateFramesState != null &&
    (generateFramesState.shotScope === "create-first-shot" ||
      generateFramesState.shotScope === "new-shot-same-project" ||
      (existingStoryState?.recentSceneSummaries.length ?? 0) === 0)
      ? summarizeSceneForStoryState(generateFramesState)
      : null;

  return {
    currentStoryGoal: currentGoal ?? existingStoryState?.currentStoryGoal ?? null,
    openSequenceArc:
      generateFramesState?.buildDirection ??
      existingStoryState?.openSequenceArc ??
      null,
    castRegistry,
    styleAnchors,
    recentSceneSummaries: appendRecentSceneSummary(
      existingStoryState?.recentSceneSummaries ?? [],
      nextSceneSummary,
    ),
  };
};

const mergeProjectMemoryPreservingAcceptedState = (
  preferredMemory: DrawingAiProjectMemory,
  fallbackMemory: DrawingAiProjectMemory | null,
) => {
  if (!fallbackMemory) {
    return preferredMemory;
  }

  return {
    ...preferredMemory,
    currentGoal: preferredMemory.currentGoal ?? fallbackMemory.currentGoal ?? null,
    contextSummary: preferredMemory.contextSummary ?? fallbackMemory.contextSummary ?? null,
    recentEdits:
      preferredMemory.recentEdits.length > 0 ? preferredMemory.recentEdits : fallbackMemory.recentEdits,
    storyState: mergeStoryState(preferredMemory.storyState, fallbackMemory.storyState),
    generateFramesState: preferredMemory.generateFramesState ?? fallbackMemory.generateFramesState ?? null,
  };
};

const inferInteractionMode = ({
  prompt,
  taskType,
  execution,
  generatedFramePlan,
}: {
  prompt: string;
  taskType: DrawingAiTaskType;
  execution: DrawingAiTaskExecution | null;
  generatedFramePlan: DrawingAiGeneratedFramePlan | null;
}): DrawingAiProjectInteractionMode => {
  if (DISCUSS_PROMPT_PATTERN.test(prompt) && generatedFramePlan == null) {
    return "discuss";
  }

  if (
    taskType === "generate-frames" &&
    (TWEAK_PROMPT_PATTERN.test(prompt) ||
      execution?.taskType === "generate-frames" &&
        (execution.kind === "refinement" || execution.kind === "style-edit" || execution.kind === "cleanup"))
  ) {
    return "tweak";
  }

  if (
    CONTINUE_PROMPT_PATTERN.test(prompt) ||
    (execution?.taskType === "generate-frames" && execution.continuation)
  ) {
    return "continue";
  }

  if (taskType === "other" && DISCUSS_PROMPT_PATTERN.test(prompt)) {
    return "discuss";
  }

  return "create";
};

const resolveCurrentGoal = ({
  existingMemory,
  prompt,
  interactionMode,
  generateFramesState,
}: {
  existingMemory: DrawingAiProjectMemory | null;
  prompt: string;
  interactionMode: DrawingAiProjectInteractionMode;
  generateFramesState: DrawingAiGenerateFramesState | null;
}) => {
  if (interactionMode === "create") {
    return prompt.trim() || (existingMemory?.currentGoal ?? null);
  }

  if (existingMemory?.currentGoal) {
    return existingMemory.currentGoal;
  }

  if (generateFramesState) {
    return summarizeGenerateFramesState(generateFramesState);
  }

  return prompt.trim() || null;
};

export const chooseNewerDrawingAiProjectMemory = (
  currentMemory: DrawingAiProjectMemory | null,
  nextMemory: DrawingAiProjectMemory | null,
  expectedProjectId: string | null = null,
) => {
  const normalizedExpectedProjectId = normalizeProjectScopeId(expectedProjectId);
  const scopedCurrentMemory = scopeDrawingAiProjectMemoryToProject(currentMemory, normalizedExpectedProjectId);
  const scopedNextMemory = scopeDrawingAiProjectMemoryToProject(nextMemory, normalizedExpectedProjectId);

  if (!scopedCurrentMemory) {
    return scopedNextMemory;
  }

  if (!scopedNextMemory) {
    return scopedCurrentMemory;
  }

  const currentTime = Date.parse(scopedCurrentMemory.lastUpdatedAt);
  const nextTime = Date.parse(scopedNextMemory.lastUpdatedAt);

  if (!Number.isFinite(currentTime)) {
    return mergeProjectMemoryPreservingAcceptedState(scopedNextMemory, scopedCurrentMemory);
  }

  if (!Number.isFinite(nextTime)) {
    return mergeProjectMemoryPreservingAcceptedState(scopedCurrentMemory, scopedNextMemory);
  }

  return nextTime >= currentTime
    ? mergeProjectMemoryPreservingAcceptedState(scopedNextMemory, scopedCurrentMemory)
    : mergeProjectMemoryPreservingAcceptedState(scopedCurrentMemory, scopedNextMemory);
};

export const bindDrawingAiGenerateFramesStateToProject = (
  state: DrawingAiGenerateFramesState | null | undefined,
  projectId: string | null | undefined,
) =>
  scopeDrawingAiGenerateFramesStateToProject(state, projectId, {
    allowForeignProjectRebind: true,
  });

export const scopeDrawingAiGenerateFramesStateToProject = (
  state: DrawingAiGenerateFramesState | null | undefined,
  projectId: string | null | undefined,
  options: DrawingAiProjectScopeOptions = {},
) => {
  if (!state) {
    return null;
  }

  const normalizedProjectId = normalizeProjectScopeId(projectId);
  const normalizedStateProjectId = normalizeProjectScopeId(state.ownerProjectId);
  if (
    options.allowForeignProjectRebind !== true &&
    normalizedStateProjectId !== null &&
    normalizedStateProjectId !== normalizedProjectId
  ) {
    return null;
  }

  if (normalizedStateProjectId === normalizedProjectId) {
    return state;
  }

  return {
    ...state,
    ownerProjectId: normalizedProjectId,
  };
};

export const bindDrawingAiProjectMemoryToProject = (
  memory: DrawingAiProjectMemory | null | undefined,
  projectId: string | null | undefined,
) =>
  scopeDrawingAiProjectMemoryToProject(memory, projectId, {
    allowForeignProjectRebind: true,
  });

export const scopeDrawingAiProjectMemoryToProject = (
  memory: DrawingAiProjectMemory | null | undefined,
  projectId: string | null | undefined,
  options: DrawingAiProjectScopeOptions = {},
) => {
  if (!memory) {
    return null;
  }

  const normalizedProjectId = normalizeProjectScopeId(projectId);
  const normalizedMemoryProjectId = normalizeProjectScopeId(memory.ownerProjectId);
  if (
    options.allowForeignProjectRebind !== true &&
    normalizedMemoryProjectId !== null &&
    normalizedMemoryProjectId !== normalizedProjectId
  ) {
    return null;
  }

  const scopedGenerateFramesState = scopeDrawingAiGenerateFramesStateToProject(
    memory.generateFramesState,
    normalizedProjectId,
    options,
  );
  if (memory.generateFramesState != null && scopedGenerateFramesState == null) {
    return null;
  }

  if (normalizedMemoryProjectId === normalizedProjectId && scopedGenerateFramesState === memory.generateFramesState) {
    return memory;
  }

  return {
    ...memory,
    ownerProjectId: normalizedProjectId,
    generateFramesState: scopedGenerateFramesState,
  };
};

export const doesDrawingAiProjectMemoryMatchProject = (
  memory: DrawingAiProjectMemory | null | undefined,
  projectId: string | null | undefined,
) => {
  if (!memory) {
    return false;
  }

  return normalizeProjectScopeId(memory.ownerProjectId) === normalizeProjectScopeId(projectId);
};

export const doesDrawingAiGenerateFramesStateMatchProject = (
  state: DrawingAiGenerateFramesState | null | undefined,
  projectId: string | null | undefined,
) => {
  if (!state) {
    return false;
  }

  return normalizeProjectScopeId(state.ownerProjectId) === normalizeProjectScopeId(projectId);
};

export const buildUpdatedDrawingAiProjectMemory = ({
  existingMemory = null,
  prompt,
  taskType,
  execution = null,
  generatedFramePlan = null,
  generateFramesState = null,
  projectId = null,
}: {
  existingMemory?: DrawingAiProjectMemory | null;
  prompt: string;
  taskType: DrawingAiTaskType;
  execution?: DrawingAiTaskExecution | null;
  generatedFramePlan?: DrawingAiGeneratedFramePlan | null;
  generateFramesState?: DrawingAiGenerateFramesState | null;
  projectId?: string | null;
}): DrawingAiProjectMemory => {
  const interactionMode = inferInteractionMode({
    prompt,
    taskType,
    execution,
    generatedFramePlan,
  });
  const normalizedProjectId = normalizeProjectScopeId(projectId);
  const scopedExistingMemory = scopeDrawingAiProjectMemoryToProject(existingMemory, normalizedProjectId);
  const resolvedGenerateFramesState = scopeDrawingAiGenerateFramesStateToProject(
    generateFramesState ?? scopedExistingMemory?.generateFramesState ?? null,
    normalizedProjectId,
  );
  const currentGoal = resolveCurrentGoal({
    existingMemory: scopedExistingMemory,
    prompt,
    interactionMode,
    generateFramesState: resolvedGenerateFramesState,
  });
  const storyState = buildUpdatedStoryState({
    existingMemory: scopedExistingMemory,
    generateFramesState: resolvedGenerateFramesState,
    currentGoal,
  });

  return {
    version: 1,
    ownerProjectId: normalizedProjectId,
    taskType,
    interactionMode,
    currentGoal,
    contextSummary:
      resolvedGenerateFramesState
        ? summarizeGenerateFramesState(resolvedGenerateFramesState)
        : scopedExistingMemory?.contextSummary ?? null,
    lastPrompt: prompt.trim() || (scopedExistingMemory?.lastPrompt ?? null),
    lastUpdatedAt: new Date().toISOString(),
    recentEdits:
      interactionMode === "create"
        ? []
        : resolvedGenerateFramesState?.recentEdits ??
          appendRecentEdit(scopedExistingMemory?.recentEdits ?? [], prompt),
    storyState,
    generateFramesState: resolvedGenerateFramesState,
  };
};
