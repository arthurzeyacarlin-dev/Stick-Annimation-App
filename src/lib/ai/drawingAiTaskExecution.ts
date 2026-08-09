import {
  isDrawingAiVoicePlaceholderSoundOption,
} from "./drawingAiContract";
import type {
  DrawingAiActionPlan,
  DrawingAiFollowUpMode,
  DrawingAiSoundOption,
  DrawingAiTaskExecution,
  DrawingAiWorkspaceContext,
} from "./drawingAiContract";
import {
  clampRequestedFrameCount,
  inferDrawingAiFrameRequestKind,
  resolveRequestedFrameCount,
} from "./frameGenerationSafety";

const FRAME_CONTINUATION_PATTERN =
  /\b(continue|same project|same scene|same animation|same sequence|same character|keep the same|next frame|after that|then he|then she|now make|animate .* now|turn this .* into frames|make the frames now)\b/i;
const FRAME_CLEANUP_PATTERN = /\b(clean up|cleanup|preserve the pose|only change|fix it|redo it|don't redraw|do not redraw)\b/i;
const FRAME_REFINEMENT_PATTERN =
  /\b(refine|refinement|smooth this out|smooth it out|smooth the animation|make it smoother|same animation but|same bounce but|keep the same bounce but|cleaner|polish it|disintegrat(?:e|ing)|dissipat(?:e|ing)|fade(?: it)? (?:away|out)|fade away|fade out)\b/i;
const FRAME_STYLE_EDIT_PATTERN = /\b(pixely|pixelly|pixel-y|arcadey|arcade-y|retro|chunkier)\b/i;
const FRAME_EDIT_CONTINUATION_PATTERN =
  /\b(make it|make the|make him|make her|make them|add|remove|change|tweak|refine|polish|bigger|larger|smaller|poisonous|toxic|green|spiky|jagged|shockwave|dusty|dust|smoke|toward the camera|smoother|faster|impact|steps?|harder|heavier|weightier|cartoony|more cartoon|runner later|come out later|hit harder|scroll|background move|move the background|centered|stay centered|disintegrat(?:e|ing)|dissipat(?:e|ing)|fade(?: it)? (?:away|out)|fade away|fade out)\b/i;
const FRAME_SEQUENCE_PATTERN =
  /\b(animation|animate|sequence|timeline frames|short sequence|run in|walk in|bounce|rolling|falling|stumble|sway|bob|then recover|then land)\b/i;
const FRAME_UNSUPPORTED_FALLBACK_PATTERN =
  /\bgenerate frames runtime fallback is disabled during the cleanup reset\b/i;

const PLAN_REFINEMENT_PATTERN =
  /\b(continue this but better|make it better|make it cooler|refine|tighten|fix the middle|same plan|build on this|keep the opening|keep the ending)\b/i;
const PLAN_CONTINUATION_PATTERN =
  /\b(continue|same project|same scene|same story|same plan|current plan|add another beat|next beat|after that)\b/i;

const SOUND_CONTINUATION_PATTERN =
  /\b(continue|same project|same sound family|same vibe|same one|same portal|same hit|same ambience|next beat|second hit|third hit|follow-up)\b/i;
const SOUND_REVISION_PATTERN =
  /\b(harder|heavier|shorter|longer|darker|brighter|cleaner|less tail|more tail|more bass|less bass|less harsh|more cartoony|less cartoony|redo|try again|fix it|same sound but)\b/i;
const SOUND_TIMING_PATTERN =
  /\b(exactly when|right when|before .* connects|on frame impact|on the lock click|on frame one|on frame 1|on this frame|right here|currently on|under the whole shot|second step quieter|timed to)\b/i;
const SOUND_FRAME_ATTACH_PATTERN =
  /\b(on frame one|on frame 1|on this frame|right here|currently on|first frame|attach to frame|put .* on frame|place .* on frame|use .* on frame)\b/i;
const SOUND_OPTION_IMPORT_PATTERN =
  /\b(?:import|use|put|attach|place)\s+(?:option|sound)?\s*\d+\b.*\bframe\s*\d+\b/i;

const resolveGenerateFramesApplyMode = (frameCount: number | null): "none" | "single-frame" | "multi-frame" => {
  if (frameCount == null || frameCount <= 0) {
    return "none";
  }

  return frameCount > 1 ? "multi-frame" : "single-frame";
};

export const buildGeneratePlansExecutionSummary = ({
  prompt,
  followUpMode,
}: {
  prompt: string;
  followUpMode: DrawingAiFollowUpMode;
}): DrawingAiTaskExecution => {
  const isQuestionNeeded = followUpMode === "question-box";
  const isRefinement = !isQuestionNeeded && (PLAN_REFINEMENT_PATTERN.test(prompt) || PLAN_CONTINUATION_PATTERN.test(prompt));

  return {
    taskType: "generate-plans",
    kind: isQuestionNeeded ? "question-needed" : isRefinement ? "refinement" : "completed-plan",
    status: isQuestionNeeded ? "question-needed" : isRefinement ? "refinement" : "completed-plan",
    continuation: PLAN_CONTINUATION_PATTERN.test(prompt),
  };
};

export const buildGenerateFramesExecutionSummary = ({
  prompt,
  response,
  followUpMode,
  workspaceContext,
  generatedFrameCount = null,
  safeFallbackUsed = false,
}: {
  prompt: string;
  response: string;
  followUpMode: DrawingAiFollowUpMode;
  workspaceContext?: DrawingAiWorkspaceContext | null;
  generatedFrameCount?: number | null;
  safeFallbackUsed?: boolean;
}): DrawingAiTaskExecution => {
  const requestKind = inferDrawingAiFrameRequestKind(prompt);
  const safeFrameCount =
    generatedFrameCount == null
      ? resolveRequestedFrameCount(prompt)
      : clampRequestedFrameCount(generatedFrameCount);
  const hasBitmapContext = Boolean(workspaceContext?.currentFrameHasBitmap);
  const isContinuationContext =
    requestKind === "continuation" ||
    FRAME_CONTINUATION_PATTERN.test(prompt) ||
    (hasBitmapContext &&
      (FRAME_REFINEMENT_PATTERN.test(prompt) ||
        FRAME_STYLE_EDIT_PATTERN.test(prompt) ||
        FRAME_EDIT_CONTINUATION_PATTERN.test(prompt)));

  if (followUpMode === "question-box") {
    return {
      taskType: "generate-frames",
      kind: "question-needed",
      status: safeFallbackUsed ? "failed-safe" : "question-needed",
      continuation: isContinuationContext,
      supportLevel: "full",
      applyMode: "none",
      estimatedFrameCount: null,
    };
  }

  if (FRAME_UNSUPPORTED_FALLBACK_PATTERN.test(response)) {
    return {
      taskType: "generate-frames",
      kind: "unsupported",
      status: safeFallbackUsed ? "failed-safe" : "unsupported",
      continuation: isContinuationContext,
      supportLevel: "full",
      applyMode: "none",
      estimatedFrameCount: null,
    };
  }

  if (requestKind === "in-between") {
    return {
      taskType: "generate-frames",
      kind: "in-between",
      status: safeFallbackUsed
        ? "failed-safe"
        : FRAME_STYLE_EDIT_PATTERN.test(prompt)
          ? "partial-support"
          : "refinement",
      continuation: true,
      supportLevel: FRAME_STYLE_EDIT_PATTERN.test(prompt) ? "partial" : "full",
      applyMode: "single-frame",
      estimatedFrameCount: 1,
    };
  }

  if (FRAME_CLEANUP_PATTERN.test(prompt) && Boolean(workspaceContext?.currentFrameHasBitmap)) {
    return {
      taskType: "generate-frames",
      kind: "cleanup",
      status: safeFallbackUsed ? "failed-safe" : "partial-support",
      continuation: true,
      supportLevel: "partial",
      applyMode: "single-frame",
      estimatedFrameCount: 1,
    };
  }

  if (FRAME_STYLE_EDIT_PATTERN.test(prompt)) {
    return {
      taskType: "generate-frames",
      kind: "style-edit",
      status: safeFallbackUsed
        ? "failed-safe"
        : FRAME_SEQUENCE_PATTERN.test(prompt) || Boolean(workspaceContext?.currentFrameHasBitmap)
          ? "partial-support"
          : "refinement",
      continuation: isContinuationContext,
      supportLevel: safeFrameCount > 1 || Boolean(workspaceContext?.currentFrameHasBitmap) ? "partial" : "full",
      applyMode: resolveGenerateFramesApplyMode(safeFrameCount),
      estimatedFrameCount: safeFrameCount,
    };
  }

  if (FRAME_REFINEMENT_PATTERN.test(prompt)) {
    return {
      taskType: "generate-frames",
      kind: "refinement",
      status: safeFallbackUsed
        ? "failed-safe"
        : FRAME_SEQUENCE_PATTERN.test(prompt)
          ? "partial-support"
          : "refinement",
      continuation: true,
      supportLevel: safeFrameCount > 1 ? "partial" : "full",
      applyMode: resolveGenerateFramesApplyMode(safeFrameCount),
      estimatedFrameCount: safeFrameCount,
    };
  }

  if (safeFrameCount > 1 || FRAME_SEQUENCE_PATTERN.test(prompt) || /\bshort .* sequence\b/i.test(response)) {
    return {
      taskType: "generate-frames",
      kind: isContinuationContext ? "continuation" : "multi-frame",
      status: safeFallbackUsed ? "failed-safe" : "prepared-command",
      continuation: isContinuationContext,
      supportLevel: "full",
      applyMode: resolveGenerateFramesApplyMode(safeFrameCount),
      estimatedFrameCount: safeFrameCount,
    };
  }

  return {
    taskType: "generate-frames",
    kind: isContinuationContext ? "continuation" : "single-frame",
    status: safeFallbackUsed ? "failed-safe" : "prepared-command",
    continuation: isContinuationContext,
    supportLevel: "full",
    applyMode: "single-frame",
    estimatedFrameCount: 1,
  };
};

export const buildGenerateSoundsExecutionSummary = ({
  prompt,
  followUpMode,
  soundOptions,
  actionPlan = null,
  safeFallbackUsed = false,
}: {
  prompt: string;
  followUpMode: DrawingAiFollowUpMode;
  soundOptions: DrawingAiSoundOption[] | null;
  actionPlan?: DrawingAiActionPlan;
  safeFallbackUsed?: boolean;
}): DrawingAiTaskExecution => {
  if (followUpMode === "question-box") {
    return {
      taskType: "generate-sounds",
      kind: "question-needed",
      status: safeFallbackUsed ? "failed-safe" : "question-needed",
      continuation: SOUND_CONTINUATION_PATTERN.test(prompt),
      optionCount: null,
    };
  }

  if (actionPlan?.type === "engine-command" && actionPlan.action === "attach-sound-option-to-frame" && actionPlan.soundOption) {
    if (isDrawingAiVoicePlaceholderSoundOption(actionPlan.soundOption)) {
      return {
        taskType: "generate-sounds",
        kind: "voice-request-placeholder",
        status: "partial-support",
        continuation: SOUND_CONTINUATION_PATTERN.test(prompt),
        optionCount: 1,
      };
    }

    return {
      taskType: "generate-sounds",
      kind: SOUND_OPTION_IMPORT_PATTERN.test(prompt) ? "imported-option-to-frame" : "attached-to-frame",
      status: "prepared-command",
      continuation: true,
      optionCount: 1,
    };
  }

  if ((soundOptions?.length ?? 0) === 1 && soundOptions?.[0] && isDrawingAiVoicePlaceholderSoundOption(soundOptions[0])) {
    return {
      taskType: "generate-sounds",
      kind: "voice-request-placeholder",
      status: safeFallbackUsed ? "failed-safe" : "partial-support",
      continuation: SOUND_CONTINUATION_PATTERN.test(prompt),
      optionCount: 1,
    };
  }

  if (SOUND_TIMING_PATTERN.test(prompt)) {
    return {
      taskType: "generate-sounds",
      kind: "timing-cue",
      status: safeFallbackUsed ? "failed-safe" : "completed-sound",
      continuation: SOUND_CONTINUATION_PATTERN.test(prompt),
      optionCount: soundOptions?.length ?? null,
    };
  }

  if (SOUND_REVISION_PATTERN.test(prompt)) {
    return {
      taskType: "generate-sounds",
      kind: "revised-sound",
      status: safeFallbackUsed ? "failed-safe" : "refinement",
      continuation: true,
      optionCount: soundOptions?.length ?? null,
    };
  }

  if ((soundOptions?.length ?? 0) > 1) {
    return {
      taskType: "generate-sounds",
      kind: "options",
      status: safeFallbackUsed ? "failed-safe" : "completed-sound",
      continuation: SOUND_CONTINUATION_PATTERN.test(prompt),
      optionCount: soundOptions?.length ?? null,
    };
  }

  return {
    taskType: "generate-sounds",
    kind:
      SOUND_CONTINUATION_PATTERN.test(prompt)
        ? "continuation"
        : SOUND_FRAME_ATTACH_PATTERN.test(prompt)
          ? "timing-cue"
          : "single-sound",
    status: safeFallbackUsed
      ? "failed-safe"
      : SOUND_CONTINUATION_PATTERN.test(prompt)
        ? "refinement"
        : "completed-sound",
    continuation: SOUND_CONTINUATION_PATTERN.test(prompt),
    optionCount: soundOptions?.length ?? null,
  };
};

export const buildOtherExecutionSummary = ({
  prompt,
  actionPlan,
}: {
  prompt: string;
  actionPlan: DrawingAiActionPlan;
}): DrawingAiTaskExecution => ({
  taskType: "other",
  kind: actionPlan
    ? "prepared-command"
    : /\b(can't|cannot|unsupported|not available)\b/i.test(prompt)
      ? "unsupported"
      : "question-needed",
  status: actionPlan
    ? "prepared-command"
    : /\b(can't|cannot|unsupported|not available)\b/i.test(prompt)
      ? "unsupported"
      : "question-needed",
  continuation:
    /\b(same project|same workspace|already imported|already made|keep the current project|fix my project structure|same command chain|continue this)\b/i.test(
      prompt,
    ),
});
