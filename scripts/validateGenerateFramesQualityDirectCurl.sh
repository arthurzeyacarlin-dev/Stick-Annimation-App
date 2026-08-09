#!/bin/zsh

set -euo pipefail

VALIDATE_AI_URL="${VALIDATE_AI_URL:-http://127.0.0.1:3002/api/ai}"
VALIDATE_GFQ_FILTER="${VALIDATE_GFQ_FILTER:-}"
OUTPUT_DIR="${VALIDATE_GFQ_OUTPUT_DIR:-/tmp/generate-frames-direct-curl}"

mkdir -p "$OUTPUT_DIR"

prompts=(
  "Generate a stick figure jumping and doing a round kick."
  "Generate two stick figures fighting in a cave."
  "Generate a background with mountain ranges, plains, trees, boulders, and a waterfall."
  "Generate me a smoke bomb."
  "Generate lightning."
  "Generate an explosion."
  "Generate me a stick figure."
  "I want to create a stick figure fight eventually but not right now."
)

matches_filter() {
  local label="$1"
  if [[ -z "$VALIDATE_GFQ_FILTER" ]]; then
    return 0
  fi

  local local_label="${label:l}"
  local local_filter="${VALIDATE_GFQ_FILTER:l}"
  [[ "$local_label" == *"$local_filter"* ]]
}

build_payload() {
  local prompt="$1"
  PROMPT_VALUE="$prompt" node <<'NODE'
const prompt = process.env.PROMPT_VALUE ?? "";
const payload = {
  prompt,
  taskType: "generate-frames",
  reasoningLevel: "medium",
  shouldSearch: true,
  conversationHistory: [],
  followUpMemory: [],
  workspaceContext: {
    projectId: null,
    projectTitle: "Test",
    activeLayerId: "layer-1",
    activeLayerName: "Layer 1",
    totalLayers: 1,
    activeTool: "brush",
    timelineFps: 12,
    authoredFrameCount: 1,
    currentFrameIndex: 0,
    selectedTimelineIndex: 0,
    currentFrameHasBitmap: false,
    currentFrameBounds: null,
    previousFilledFrameIndex: null,
    nextFilledFrameIndex: null,
    currentFrameSound: null,
    selectedFrameSound: null,
    hasOffCameraAuthoringArea: true,
    cameraAreaDescription: "white camera area with dark authoring surround",
    canvasWidth: 1024,
    canvasHeight: 1024,
  },
  recentSoundOptions: [],
  generateFramesState: null,
  projectAiMemory: null,
};
process.stdout.write(JSON.stringify(payload));
NODE
}

build_continuation_payload() {
  local prompt="$1"
  local initial_response_file="$2"
  PROMPT_VALUE="$prompt" INITIAL_RESPONSE_FILE="$initial_response_file" node <<'NODE'
const fs = require("fs");
const prompt = process.env.PROMPT_VALUE ?? "";
const initialResponsePath = process.env.INITIAL_RESPONSE_FILE ?? "";
const initialResponse = JSON.parse(fs.readFileSync(initialResponsePath, "utf8"));
const payload = {
  prompt,
  taskType: "generate-frames",
  reasoningLevel: "medium",
  shouldSearch: true,
  conversationHistory: [],
  followUpMemory: [],
  workspaceContext: {
    projectId: null,
    projectTitle: "Test",
    activeLayerId: "layer-1",
    activeLayerName: "Layer 1",
    totalLayers: 1,
    activeTool: "brush",
    timelineFps: 12,
    authoredFrameCount: 1,
    currentFrameIndex: 0,
    selectedTimelineIndex: 0,
    currentFrameHasBitmap: false,
    currentFrameBounds: null,
    previousFilledFrameIndex: null,
    nextFilledFrameIndex: null,
    currentFrameSound: null,
    selectedFrameSound: null,
    hasOffCameraAuthoringArea: true,
    cameraAreaDescription: "white camera area with dark authoring surround",
    canvasWidth: 1024,
    canvasHeight: 1024,
  },
  recentSoundOptions: [],
  generateFramesState: initialResponse.generateFramesState ?? null,
  projectAiMemory: initialResponse.projectAiMemory ?? null,
};
process.stdout.write(JSON.stringify(payload));
NODE
}

summarize_response() {
  local response_file="$1"
  RESPONSE_FILE="$response_file" node <<'NODE'
const fs = require("fs");
const responsePath = process.env.RESPONSE_FILE;
const response = JSON.parse(fs.readFileSync(responsePath, "utf8"));
const frames = response.generatedFramePlan?.frames ?? [];
const summary = {
  executionStatus: response.execution?.status ?? null,
  requestKind: response.generatedFramePlan?.requestKind ?? null,
  frameCount: frames.length,
  subjectType: response.generateFramesState?.subjectType ?? null,
  motionType: response.generateFramesState?.motionType ?? null,
  focusTargets: response.generateFramesState?.focusTargets ?? [],
  behaviorType: response.generatedFramePlan?.workspaceIntent?.behaviorType ?? null,
  targetLayerIntent: response.generatedFramePlan?.workspaceIntent?.targetLayerIntent ?? null,
  searchUsed: response.searchUsed ?? null,
  firstPose: frames[0]?.pose ?? null,
  lastPose: frames.at(-1)?.pose ?? null,
  warnings: response.warnings ?? [],
};
process.stdout.write(JSON.stringify(summary, null, 2));
NODE
}

send_payload() {
  local label="$1"
  local payload="$2"
  local response_file="$3"
  local started_at="$4"

  if ! curl -sS -X POST "$VALIDATE_AI_URL" -H 'content-type: application/json' --data-raw "$payload" >"$response_file"; then
    local elapsed=$((SECONDS - started_at))
    echo "FAIL Checking: $label (${elapsed}s)"
    echo "  Direct curl probe failed against $VALIDATE_AI_URL"
    exit 1
  fi
}

run_prompt_case() {
  local prompt="$1"
  local label="$prompt"
  if ! matches_filter "$label"; then
    return
  fi

  case_index=$((case_index + 1))
  response_file="$OUTPUT_DIR/case-${case_index}.json"
  payload="$(build_payload "$prompt")"
  start_seconds=$SECONDS

  echo "START Checking: $label"
  send_payload "$label" "$payload" "$response_file" "$start_seconds"

  summarize_response "$response_file"
  elapsed=$((SECONDS - start_seconds))
  echo "END Checking: $label (${elapsed}s)"
}

run_continuation_case() {
  local label="Continuation: waterfall emphasis on same background"
  local initial_prompt="Generate a background with mountain ranges, plains, trees, boulders, and a waterfall."
  local followup_prompt="Keep the same background but make the waterfall more prominent."

  if ! matches_filter "$label $initial_prompt $followup_prompt"; then
    return
  fi

  local started_at=$SECONDS
  local initial_file="$OUTPUT_DIR/continuation-initial.json"
  local followup_file="$OUTPUT_DIR/continuation-followup.json"
  local initial_payload
  local followup_payload

  echo "START Checking sequence: $initial_prompt -> $followup_prompt"
  initial_payload="$(build_payload "$initial_prompt")"
  send_payload "$initial_prompt" "$initial_payload" "$initial_file" "$started_at"
  echo "Initial summary:"
  summarize_response "$initial_file"

  followup_payload="$(build_continuation_payload "$followup_prompt" "$initial_file")"
  send_payload "$followup_prompt" "$followup_payload" "$followup_file" "$started_at"
  echo "Follow-up summary:"
  summarize_response "$followup_file"

  local elapsed=$((SECONDS - started_at))
  echo "END Checking sequence: $initial_prompt -> $followup_prompt (${elapsed}s)"
}

case_index=0
for prompt in "${prompts[@]}"; do
  run_prompt_case "$prompt"
done

run_continuation_case
