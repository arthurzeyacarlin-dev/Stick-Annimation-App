import { getOpenAiClient } from "./client";
import { recordDevAiModelCall } from "@/src/lib/ai/devAiCostDashboard";
import type { DrawingAiReasoningEffort } from "@/src/lib/ai/drawingAiProfiles";

export const AI_TEXT_STRONG_MODEL = "gpt-5.4";
export const AI_TEXT_BALANCED_MODEL = "gpt-5.3-chat-latest";
export const AI_TEXT_ECONOMY_MODEL = "gpt-5.2";
export const AI_TEXT_MODEL = AI_TEXT_STRONG_MODEL;

export type GenerateAiTextInput = {
  prompt: string;
  instructions?: string;
  reasoningEffort?: DrawingAiReasoningEffort;
  maxOutputTokens?: number;
  model?: string;
};

export type GenerateAiObjectInput = GenerateAiTextInput & {
  schemaName: string;
  schema: Record<string, unknown>;
  maxAttempts?: number;
};

export type GenerateAiObjectMetadata = {
  retryUsed: boolean;
  parseRecovered: boolean;
  rawOutputPreview: string;
};

export type GenerateAiObjectResult<T> = {
  value: T;
  metadata: GenerateAiObjectMetadata;
};

export type GenerateAiTextResult = {
  output: string;
};

const getResponseOutputText = (
  response: Awaited<ReturnType<ReturnType<typeof getOpenAiClient>["responses"]["create"]>>,
) => ("output_text" in response && typeof response.output_text === "string" ? response.output_text : "");

const resolveReasoningEffortForModel = ({
  model,
  reasoningEffort,
}: {
  model: string;
  reasoningEffort?: DrawingAiReasoningEffort;
}) => {
  if (!reasoningEffort) {
    return undefined;
  }

  if (model === AI_TEXT_BALANCED_MODEL || /^gpt-5\.3(?:-|$)/.test(model)) {
    return "medium" satisfies DrawingAiReasoningEffort;
  }

  return reasoningEffort;
};

export const generateAiText = async ({
  prompt,
  instructions,
  reasoningEffort,
  maxOutputTokens,
  model,
}: GenerateAiTextInput): Promise<GenerateAiTextResult> => {
  const selectedModel = model ?? AI_TEXT_MODEL;
  const openAiClient = getOpenAiClient();
  const resolvedReasoningEffort = resolveReasoningEffortForModel({
    model: selectedModel,
    reasoningEffort,
  });
  const response = await openAiClient.responses.create({
    model: selectedModel,
    input: prompt,
    instructions,
    reasoning: resolvedReasoningEffort ? { effort: resolvedReasoningEffort } : undefined,
    max_output_tokens: maxOutputTokens,
  });
  const outputText = getResponseOutputText(response);

  recordDevAiModelCall({
    model: selectedModel,
    prompt,
    instructions,
    outputText,
    usage: "usage" in response ? response.usage : undefined,
  });

  return {
    output: outputText,
  };
};

const buildStructuredOutputPreview = (value: string) =>
  value.replace(/\s+/g, " ").trim().slice(0, 240);

const stripStructuredMarkdownFences = (value: string) => {
  const trimmedValue = value.trim();
  const fencedMatch = trimmedValue.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  return trimmedValue
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
};

const extractJsonObjectCandidate = (value: string) => {
  const trimmedValue = value.trim();
  const startIndex = trimmedValue.indexOf("{");
  if (startIndex < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = startIndex; index < trimmedValue.length; index += 1) {
    const character = trimmedValue[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === "\\") {
        isEscaped = true;
        continue;
      }

      if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return trimmedValue.slice(startIndex, index + 1);
      }
    }
  }

  return null;
};

const parseStructuredJsonCandidate = <T>(rawOutput: string) => {
  const trimmedOutput = rawOutput.trim();
  if (!trimmedOutput) {
    return {
      parsed: null as T | null,
      parseRecovered: false,
    };
  }

  const candidates = [trimmedOutput];
  const unfencedOutput = stripStructuredMarkdownFences(trimmedOutput);
  if (unfencedOutput && unfencedOutput !== trimmedOutput) {
    candidates.push(unfencedOutput);
  }

  const extractedFromRaw = extractJsonObjectCandidate(trimmedOutput);
  if (extractedFromRaw && !candidates.includes(extractedFromRaw)) {
    candidates.push(extractedFromRaw);
  }

  if (unfencedOutput) {
    const extractedFromUnfenced = extractJsonObjectCandidate(unfencedOutput);
    if (extractedFromUnfenced && !candidates.includes(extractedFromUnfenced)) {
      candidates.push(extractedFromUnfenced);
    }
  }

  for (const candidate of candidates) {
    try {
      return {
        parsed: JSON.parse(candidate) as T,
        parseRecovered: candidate !== trimmedOutput,
      };
    } catch {
      continue;
    }
  }

  return {
    parsed: null as T | null,
    parseRecovered: false,
  };
};

export const generateAiObject = async <T>({
  prompt,
  instructions,
  reasoningEffort,
  maxOutputTokens,
  schemaName,
  schema,
  model,
  maxAttempts = 2,
}: GenerateAiObjectInput): Promise<GenerateAiObjectResult<T>> => {
  const selectedModel = model ?? AI_TEXT_MODEL;
  const openAiClient = getOpenAiClient();
  const resolvedReasoningEffort = resolveReasoningEffortForModel({
    model: selectedModel,
    reasoningEffort,
  });
  const totalAttempts = Math.max(1, Math.min(2, Math.trunc(maxAttempts)));
  let retryUsed = false;
  let lastRawOutput = "";
  let lastFailureReason = "Structured AI response failed.";

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    try {
      const response = await openAiClient.responses.create({
        model: selectedModel,
        input: prompt,
        instructions,
        reasoning: resolvedReasoningEffort ? { effort: resolvedReasoningEffort } : undefined,
        max_output_tokens: maxOutputTokens,
        text: {
          format: {
            type: "json_schema",
            name: schemaName,
            schema,
            strict: true,
          },
          verbosity: "low",
        },
      });

      lastRawOutput = getResponseOutputText(response);
      recordDevAiModelCall({
        model: selectedModel,
        prompt,
        instructions,
        outputText: lastRawOutput,
        usage: "usage" in response ? response.usage : undefined,
      });
      const { parsed, parseRecovered: recovered } = parseStructuredJsonCandidate<T>(lastRawOutput);
      if (parsed) {
        return {
          value: parsed,
          metadata: {
            retryUsed,
            parseRecovered: recovered,
            rawOutputPreview: buildStructuredOutputPreview(lastRawOutput),
          },
        };
      }

      lastFailureReason = lastRawOutput.trim()
        ? "Structured AI response could not be parsed as JSON."
        : "Structured AI response was empty.";
      console.warn("Structured AI generation returned invalid output.", {
        schemaName,
        attempt: attempt + 1,
        retryUsed,
        rawOutputPreview: buildStructuredOutputPreview(lastRawOutput),
        rawOutput: lastRawOutput,
      });
    } catch (error) {
      lastFailureReason =
        error instanceof Error ? error.message : "Structured AI request failed before returning output.";
      console.warn("Structured AI request failed.", {
        schemaName,
        attempt: attempt + 1,
        retryUsed,
        error: error instanceof Error ? error.message : error,
      });
    }

    if (attempt < totalAttempts - 1) {
      retryUsed = true;
      continue;
    }
  }

  console.error("Structured AI generation failed after retry.", {
    schemaName,
    retryUsed,
    parseRecovered: false,
    rawOutputPreview: buildStructuredOutputPreview(lastRawOutput),
    rawOutput: lastRawOutput,
    failureReason: lastFailureReason,
  });

  const structuredError = Object.assign(new Error(lastFailureReason), {
    rawOutputPreview: buildStructuredOutputPreview(lastRawOutput),
    retryUsed,
    parseRecovered: false,
  });

  throw structuredError;
};
