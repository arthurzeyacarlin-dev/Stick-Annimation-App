import {
  DRAWING_AI_FALLBACK_OUTPUT,
  DRAWING_AI_EDITED_FOLLOW_UP_FALLBACK_OUTPUT,
  DRAWING_AI_FINAL_PLAN_FALLBACK_OUTPUT,
  DRAWING_AI_FOLLOW_UP_FALLBACK_OUTPUT,
  DEFAULT_DRAWING_AI_REASONING_LEVEL,
  DEFAULT_DRAWING_AI_TASK_TYPE,
  isDrawingAiActiveFollowUp,
  isDrawingAiConversationMessage,
  isDrawingAiFollowUpAnswerSource,
  sanitizeDrawingAiGenerateFramesState,
  sanitizeDrawingAiProjectMemory,
  isDrawingAiFollowUpInteractionKind,
  isDrawingAiFollowUpMemoryItem,
  isDrawingAiReasoningLevel,
  isDrawingAiSoundFamily,
  isDrawingAiSoundOption,
  isDrawingAiTaskType,
  isDrawingAiWorkspaceType,
  isDrawingAiWorkspaceContext,
  normalizeDrawingAiFollowUpMemory,
  normalizeDrawingAiResponse,
  type DrawingAiActiveFollowUp,
  type DrawingAiConversationMessage,
  type DrawingAiGenerateFramesState,
  type DrawingAiGeneratedFrameToolIntent,
  type DrawingAiFollowUpAnswerSource,
  type DrawingAiGeneratedFrameWorkspaceIntent,
  type DrawingAiFollowUpInteractionKind,
  type DrawingAiFollowUpMemoryItem,
  type DrawingAiGuidedPlanningSceneType,
  type DrawingAiGuidedPlanningState,
  type DrawingAiGuidedPlanningStatus,
  type DrawingAiProjectMemory,
  type DrawingAiReasoningLevel,
  type DrawingAiResponse,
  type DrawingAiSoundOption,
  type DrawingAiTaskType,
  type DrawingAiWorkspaceType,
  type DrawingAiWorkspaceContext,
} from "@/src/lib/ai/drawingAiContract";
import {
  appendDevAiCostLogEntry,
  getCurrentDevAiRequestUsageSummary,
  isDevAiCostDashboardEnabledForRequestHost,
  startDevAiCostRequestScope,
} from "@/src/lib/ai/devAiCostDashboard";
import {
  buildUpdatedDrawingAiProjectMemory,
  doesDrawingAiGenerateFramesStateMatchProject,
  doesDrawingAiProjectMemoryMatchProject,
  scopeDrawingAiGenerateFramesStateToProject,
  scopeDrawingAiProjectMemoryToProject,
} from "@/src/lib/ai/drawingAiProjectMemory";
import {
  clampRequestedFrameCount,
  clampFrameDraftsToRequest,
  inferDrawingAiFrameRequestKind,
  resolveRequestedFrameCount,
} from "@/src/lib/ai/frameGenerationSafety";
import {
  assessGenerateFramesSearchCoverage,
  analyzeGenerateFramesRequest,
  buildGenerateFramesSearchDecision,
  buildGenerateFramesDeterministicDrafts,
  buildGenerateFramesFallbackOutput,
  buildUpdatedGenerateFramesState,
  isGenerateFramesHardNoPlanBlocker,
  isGenerateFramesQuestionAllowed,
  strengthenGenerateFramesContinuationAnalysis,
  validateGenerateFramesDrafts,
  type GenerateFramesRuntimeAnalysis,
} from "@/src/lib/ai/generateFramesRuntime";
import { getDrawingAiReasoningProfile } from "@/src/lib/ai/drawingAiProfiles";
import {
  analyzeGeneratePlansRequest,
  buildGeneratePlansAnalysisInput,
  buildGeneratePlansFollowUpReply,
  buildDrawingAiSystemInstructions,
  buildTaskPrompt,
  classifyDrawingAiTaskIntent,
  finalizeGeneratePlansOutput,
  generateGenerateFramesStructuredResponse,
  generateGenerateSoundStructuredResponse,
  resolveGeneratePlansFollowUpMemory,
  type DrawingAiSearchReference,
} from "@/src/lib/ai/drawingAiPrompting";
import {
  buildDrawingAiPhaseHistory,
  buildDrawingAiSearchDecision,
} from "@/src/lib/ai/drawingAiTaskPipeline";
import {
  buildGenerateFramesExecutionSummary,
  buildGeneratePlansExecutionSummary,
  buildGenerateSoundsExecutionSummary,
  buildOtherExecutionSummary,
} from "@/src/lib/ai/drawingAiTaskExecution";
import { getRelevantExamples } from "@/src/lib/ai/plansTrainingStore";
import {
  buildGenerateFramesTrainingAnalysisInput,
} from "@/src/lib/ai/DrawingWorkspaceTask_GenerateFrames";
import { getRelevantGenerateFramesExamples } from "@/src/lib/ai/DrawingWorkspaceTask_GenerateFramesStore";
import { buildOtherTaskAnalysisInput } from "@/src/lib/ai/DrawingWorkspaceTask_Other";
import { getRelevantOtherExamples } from "@/src/lib/ai/DrawingWorkspaceTask_OtherStore";
import { buildGenerateSoundTrainingAnalysisInput } from "@/src/lib/ai/DrawingWorkspaceTask_GenerateSound";
import { getRelevantGenerateSoundExamples } from "@/src/lib/ai/DrawingWorkspaceTask_GenerateSoundStore";
import {
  buildCanonicalSoundOptionSet,
  inferCanonicalSoundTimingFeel,
  stripLeadingSoundGreetingFiller,
} from "@/src/lib/ai/drawingSoundPlanner";
import {
  orchestrateGenerateSound,
} from "@/src/lib/ai/drawingSoundOrchestrator";
import {
  buildGenerateSoundsDisabledResponseFields,
  isSoundGenerationEnabled,
} from "@/src/lib/ai/drawingSoundAvailability";
import {
  buildTemporarilyDisabledTaskResponseFields,
  isDrawingAiTaskExecutionTemporarilyDisabled,
} from "@/src/lib/ai/drawingAiTaskAvailability";
import { AI_TEXT_BALANCED_MODEL, AI_TEXT_ECONOMY_MODEL, AI_TEXT_MODEL, generateAiText } from "@/src/lib/openai/generateAiText";
import { NextResponse } from "next/server";

type AiRouteRequestBody = {
  prompt?: unknown;
  shouldSearch?: unknown;
  reasoningLevel?: unknown;
  taskType?: unknown;
  workspaceType?: unknown;
  conversationHistory?: unknown;
  followUpMemory?: unknown;
  activeFollowUp?: unknown;
  followUpAnswerSource?: unknown;
  followUpInteractionKind?: unknown;
  workspaceContext?: unknown;
  recentSoundOptions?: unknown;
  generateFramesState?: unknown;
  projectAiMemory?: unknown;
};

type InternetSearchResult = DrawingAiSearchReference;

const DUCKDUCKGO_SEARCH_URL = "https://html.duckduckgo.com/html/";
const DUCKDUCKGO_INSTANT_ANSWER_URL = "https://api.duckduckgo.com/";
const SEARCH_QUERY_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "can",
  "could",
  "for",
  "from",
  "get",
  "give",
  "help",
  "i",
  "i'm",
  "i'll",
  "id",
  "im",
  "in",
  "into",
  "it",
  "like",
  "look",
  "me",
  "my",
  "need",
  "of",
  "on",
  "out",
  "please",
  "show",
  "something",
  "some",
  "that",
  "the",
  "this",
  "to",
  "up",
  "want",
  "with",
  "you",
]);
const REFERENCE_STYLE_TERMS = [
  "reference",
  "references",
  "inspiration",
  "inspirations",
  "example",
  "examples",
  "tutorial",
  "breakdown",
  "animation",
  "fight",
  "combat",
  "motion",
  "style",
];
const CASUAL_WORKSPACE_GREETING_PATTERN =
  /^(hi|hello|hey|yo|sup|what(?:['’]s| is)\s+up|good morning|good afternoon|good evening)\b[!.,?\s]*$/i;
const SEARCH_FETCH_TIMEOUT_MS = 4500;
const FRAME_REFERENCE_REQUEST_PATTERN =
  /\b(youtube|youtu\.be|tiktok|vimeo|reference|references|inspiration|inspirations|find examples|example clips?|look up|search for|style ref(?:erence)?|show me refs?|real-world reference|animation reference)\b/i;

const normalizeProjectScopeId = (projectId: string | null | undefined) => {
  if (typeof projectId !== "string") {
    return null;
  }

  const trimmedProjectId = projectId.trim();
  return trimmedProjectId.length > 0 ? trimmedProjectId : null;
};

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

const stripHtml = (value: string) =>
  decodeHtmlEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const decodeDuckDuckGoUrl = (rawUrl: string) => {
  try {
    if (rawUrl.startsWith("//")) {
      return `https:${rawUrl}`;
    }

    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
      return rawUrl;
    }

    if (!rawUrl.startsWith("/")) {
      return rawUrl;
    }

    const parsedUrl = new URL(rawUrl, "https://duckduckgo.com");
    const redirectTarget = parsedUrl.searchParams.get("uddg");
    return redirectTarget ? decodeURIComponent(redirectTarget) : parsedUrl.toString();
  } catch {
    return rawUrl;
  }
};

const getSearchTokens = (value: string) =>
  value
    .split(/\s+/)
    .map((token) => token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "").trim())
    .filter((token) => token.length > 1);

const buildSearchQuery = (userMessage: string) => {
  const cleanedMessage = userMessage
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/[\u2013\u2014]/g, " ")
    .replace(/[^\w\s'"&/+.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const rawTokens = cleanedMessage.split(/\s+/).filter(Boolean);
  const queryTokens: string[] = [];
  const seenTokens = new Set<string>();

  for (const rawToken of rawTokens) {
    const normalizedToken = rawToken.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");
    if (!normalizedToken) {
      continue;
    }

    const lowerToken = normalizedToken.toLowerCase();
    if (SEARCH_QUERY_STOP_WORDS.has(lowerToken)) {
      continue;
    }

    if (!seenTokens.has(lowerToken)) {
      queryTokens.push(normalizedToken);
      seenTokens.add(lowerToken);
    }
  }

  return queryTokens.join(" ").trim();
};

const searchInternetQueries = async (queries: readonly string[], maxResults: number): Promise<InternetSearchResult[]> => {
  const uniqueQueries = [...new Set(queries.map((query) => buildSearchQuery(query)).filter((query) => query.length > 0))].slice(0, 5);
  const mergedResults: InternetSearchResult[] = [];
  const seenResultKeys = new Set<string>();

  for (const query of uniqueQueries) {
    const results = await searchInternet(query, Math.max(2, Math.ceil(maxResults / Math.max(1, uniqueQueries.length))));
    for (const result of results) {
      const key = `${result.url}::${result.title}`.toLowerCase();
      if (seenResultKeys.has(key)) {
        continue;
      }
      seenResultKeys.add(key);
      mergedResults.push(result);
      if (mergedResults.length >= maxResults) {
        return mergedResults;
      }
    }
  }

  return mergedResults;
};

const searchGenerateFramesUntilGrounded = async ({
  prompt,
  analysis,
  searchDecision,
  maxResults,
}: {
  prompt: string;
  analysis: GenerateFramesRuntimeAnalysis;
  searchDecision: { query: string | null; queries?: string[] | null };
  maxResults: number;
}) => {
  const maxPasses = 5;
  let searchResults: InternetSearchResult[] = [];
  let coverage = assessGenerateFramesSearchCoverage({ analysis, searchResults });
  let currentQueries = searchDecision.queries?.length ? [...searchDecision.queries] : [searchDecision.query ?? prompt];
  const seenQueries = new Set<string>(
    currentQueries.map((query) => buildSearchQuery(query)).filter((query) => query.length > 0),
  );

  for (let passIndex = 0; passIndex < maxPasses && currentQueries.length > 0; passIndex += 1) {
    const passResults = await searchInternetQueries(currentQueries, maxResults);
    const mergedResults = [...searchResults];
    const seenResultKeys = new Set(
      mergedResults.map((result) => `${result.url ?? ""}::${result.title ?? ""}`.toLowerCase()),
    );

    for (const result of passResults) {
      const key = `${result.url ?? ""}::${result.title ?? ""}`.toLowerCase();
      if (seenResultKeys.has(key)) {
        continue;
      }
      seenResultKeys.add(key);
      mergedResults.push(result);
    }

    searchResults = mergedResults;
    coverage = assessGenerateFramesSearchCoverage({ analysis, searchResults });
    if (coverage.enough) {
      break;
    }

    const nextQueries = coverage.refinedQueries.filter((query) => {
      const normalizedQuery = buildSearchQuery(query);
      if (normalizedQuery.length === 0 || seenQueries.has(normalizedQuery)) {
        return false;
      }
      seenQueries.add(normalizedQuery);
      return true;
    });

    if (nextQueries.length === 0) {
      break;
    }
    currentQueries = nextQueries;
  }

  return {
    searchResults,
    coverage,
  };
};

const buildFriendlyWorkspaceGreeting = (selectedTaskType: DrawingAiTaskType) => {
  if (selectedTaskType === "generate-frames") {
    return "Hey, what's up? I can help with drawing ideas, animation tweaks, or whatever you're working on.";
  }

  if (selectedTaskType === "generate-sounds") {
    return "Hey, what's up? I can help with sound ideas, timing, or whatever you're working on.";
  }

  if (selectedTaskType === "generate-plans") {
    return "Hey, what's up? I can help with execution beats, sequence direction, or whatever you're working on.";
  }

  return "Hey, what's up? I can help with your workspace, animation ideas, or whatever you're working on.";
};

const fetchWithTimeout = async (input: string, init: RequestInit, timeoutMs = SEARCH_FETCH_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

const getPlatformScore = (content: string, url: string) => {
  let score = 0;
  const lowerUrl = url.toLowerCase();
  const lowerContent = content.toLowerCase();

  if (lowerUrl.includes("youtube.com") || lowerUrl.includes("youtu.be")) {
    score += 9;
  }

  if (lowerUrl.includes("tiktok.com")) {
    score += 8;
  }

  if (lowerUrl.includes("vimeo.com")) {
    score += 6;
  }

  if (lowerUrl.includes("artstation.com") || lowerUrl.includes("pinterest.com") || lowerUrl.includes("instagram.com")) {
    score += 4;
  }

  if (lowerContent.includes("animation") || lowerContent.includes("animatic")) {
    score += 3;
  }

  if (lowerContent.includes("reference") || lowerContent.includes("inspiration") || lowerContent.includes("breakdown")) {
    score += 3;
  }

  return score;
};

const scoreSearchResult = (query: string, result: InternetSearchResult) => {
  const queryTokens = getSearchTokens(query.toLowerCase());
  const searchableContent = `${result.title} ${result.summary} ${result.url}`.toLowerCase();
  let score = getPlatformScore(searchableContent, result.url);

  if (query.includes("youtube") && (result.url.includes("youtube.com") || result.url.includes("youtu.be"))) {
    score += 8;
  }

  if (query.includes("tiktok") && result.url.includes("tiktok.com")) {
    score += 8;
  }

  for (const token of queryTokens) {
    if (token.length <= 2) {
      continue;
    }

    if (searchableContent.includes(token.toLowerCase())) {
      score += 1.5;
    }
  }

  return score;
};

const rankAndFilterSearchResults = (query: string, results: InternetSearchResult[], maxResults: number) => {
  const seenUrls = new Set<string>();

  return results
    .filter((result) => {
      const normalizedUrl = result.url.trim().toLowerCase();
      if (!normalizedUrl || seenUrls.has(normalizedUrl)) {
        return false;
      }

      seenUrls.add(normalizedUrl);
      return true;
    })
    .map((result) => ({
      ...result,
      score: scoreSearchResult(query.toLowerCase(), result),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, maxResults)
    .map(({ score: _score, ...result }) => result);
};

const parseHtmlSearchResults = (html: string): InternetSearchResult[] => {
  const blocks = html.split(/<div[^>]+class="[^"]*result__body[^"]*"[^>]*>/i).slice(1);

  return blocks
    .map((block) => {
      const titleMatch = block.match(
        /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
      );
      const snippetMatch =
        block.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ??
        block.match(/<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

      if (!titleMatch) {
        return null;
      }

      const title = stripHtml(titleMatch[2]);
      const summary = snippetMatch ? stripHtml(snippetMatch[1]) : "";
      const url = decodeDuckDuckGoUrl(titleMatch[1]);

      if (!title || !summary || !url) {
        return null;
      }

      return {
        title,
        summary,
        url,
      };
    })
    .filter((result): result is InternetSearchResult => result !== null)
    .slice(0, 10);
};

const parseInstantAnswerResults = (payload: unknown): InternetSearchResult[] => {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const results: InternetSearchResult[] = [];
  const payloadRecord = payload as Record<string, unknown>;

  const addResult = (entry: Record<string, unknown>) => {
    const title =
      typeof entry.Text === "string"
        ? entry.Text
        : typeof entry.Heading === "string"
          ? entry.Heading
          : "";
    const summary = typeof entry.Text === "string" ? entry.Text : "";
    const url = typeof entry.FirstURL === "string" ? entry.FirstURL : "";

    if (!title || !summary || !url) {
      return;
    }

    results.push({
      title: stripHtml(title),
      summary: stripHtml(summary),
      url,
    });
  };

  if (typeof payloadRecord.AbstractText === "string" && typeof payloadRecord.AbstractURL === "string") {
    results.push({
      title: stripHtml(
        typeof payloadRecord.Heading === "string" && payloadRecord.Heading.length > 0
          ? payloadRecord.Heading
          : payloadRecord.AbstractText,
      ),
      summary: stripHtml(payloadRecord.AbstractText),
      url: payloadRecord.AbstractURL,
    });
  }

  if (Array.isArray(payloadRecord.RelatedTopics)) {
    for (const topic of payloadRecord.RelatedTopics) {
      if (results.length >= 3 || !topic || typeof topic !== "object") {
        break;
      }

      const topicRecord = topic as Record<string, unknown>;

      if (Array.isArray(topicRecord.Topics)) {
        for (const nestedTopic of topicRecord.Topics) {
          if (results.length >= 3 || !nestedTopic || typeof nestedTopic !== "object") {
            break;
          }

          addResult(nestedTopic as Record<string, unknown>);
        }
        continue;
      }

      addResult(topicRecord);
    }
  }

  return results.slice(0, 10);
};

const searchInternet = async (query: string, maxResults: number): Promise<InternetSearchResult[]> => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  try {
    const htmlResponse = await fetchWithTimeout(`${DUCKDUCKGO_SEARCH_URL}?q=${encodeURIComponent(trimmedQuery)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DrawingAiPanel/1.0)",
      },
      cache: "no-store",
    });

    if (htmlResponse.ok) {
      const html = await htmlResponse.text();
      const htmlResults = rankAndFilterSearchResults(trimmedQuery, parseHtmlSearchResults(html), maxResults);
      if (htmlResults.length > 0) {
        return htmlResults;
      }
    }
  } catch (error) {
    console.warn("DuckDuckGo HTML search failed:", error);
  }

  try {
    const instantAnswerResponse = await fetchWithTimeout(
      `${DUCKDUCKGO_INSTANT_ANSWER_URL}?q=${encodeURIComponent(trimmedQuery)}&format=json&no_html=1&skip_disambig=1`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; DrawingAiPanel/1.0)",
        },
        cache: "no-store",
      },
    );

    if (!instantAnswerResponse.ok) {
      return [];
    }

    const instantAnswerPayload: unknown = await instantAnswerResponse.json();
    return rankAndFilterSearchResults(trimmedQuery, parseInstantAnswerResults(instantAnswerPayload), maxResults);
  } catch (error) {
    console.warn("DuckDuckGo instant answer search failed:", error);
    return [];
  }
};

const simplifyAiOutput = (output: string) =>
  output
    .replace(/\r\n/g, "\n")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^\s*\*\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const stripGeneratePlansHandoffLine = (output: string) =>
  output
    .replace(
      /\n+If this plan looks good, switch to Generate Frames (?:so the execution layer can build it|and I'll start building it)\.\s*$/i,
      "",
    )
    .trim();

const extractGeneratePlansJsonCandidate = (output: string) => {
  const trimmed = stripGeneratePlansHandoffLine(output).trim();
  const codeBlockMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return codeBlockMatch?.[1]?.trim() || trimmed;
};

const hasValidGeneratePlansCommandPayload = (output: string) => {
  const candidate = extractGeneratePlansJsonCandidate(output);
  if (!candidate) {
    return false;
  }

  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }

    const rawCommands = Array.isArray((parsed as { commands?: unknown }).commands)
      ? (parsed as { commands: unknown[] }).commands
      : Array.isArray((parsed as { actions?: unknown }).actions)
        ? (parsed as { actions: unknown[] }).actions
        : null;
    if (!Array.isArray(rawCommands) || rawCommands.length === 0 || rawCommands.length > 24) {
      return false;
    }

    return rawCommands.every((action) => {
      if (!action || typeof action !== "object" || Array.isArray(action)) {
        return false;
      }

      const typedAction = action as {
        type?: unknown;
        target?: unknown;
        parameters?: unknown;
      };

      return (
        typeof typedAction.type === "string" &&
        typedAction.type.trim().length > 0 &&
        typeof typedAction.target === "string" &&
        typedAction.target.trim().length > 0 &&
        Boolean(typedAction.parameters) &&
        typeof typedAction.parameters === "object" &&
        !Array.isArray(typedAction.parameters)
      );
    });
  } catch {
    return false;
  }
};

const isWeakGeneratePlansOutput = (output: string) => {
  const trimmedOutput = output.trim();
  if (!trimmedOutput) {
    return true;
  }

  return !hasValidGeneratePlansCommandPayload(trimmedOutput);
};

type StrictEngineCommand = {
  type: string;
  target: string;
  parameters: Record<string, unknown>;
};

const isPlainCommandRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const coerceStrictStringParameter = (value: unknown, fallback: string) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (Array.isArray(value)) {
    const joined = value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .join(" | ");
    if (joined.length > 0) {
      return joined;
    }
  }

  return fallback;
};

const coerceStrictBooleanParameter = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const sanitizeStrictCommandValue = (value: unknown, depth = 0): unknown => {
  if (depth > 3) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "boolean" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    const sanitized = value
      .map((entry) => sanitizeStrictCommandValue(entry, depth + 1))
      .filter((entry) => entry !== undefined)
      .slice(0, 24);
    return sanitized.length > 0 ? sanitized : undefined;
  }

  if (!isPlainCommandRecord(value)) {
    return undefined;
  }

  const sanitizedEntries = Object.entries(value)
    .map(([key, entryValue]) => [key, sanitizeStrictCommandValue(entryValue, depth + 1)] as const)
    .filter(([, entryValue]) => entryValue !== undefined)
    .slice(0, 24);

  return sanitizedEntries.length > 0 ? Object.fromEntries(sanitizedEntries) : undefined;
};

const buildStrictCommandParameters = (
  parameters: Record<string, unknown> | null | undefined,
  defaults: {
    timing: string;
    spacing: string;
    intensity: string;
    sequence: string;
    constraints: string;
    style: string;
    continuation: boolean;
  },
) => {
  const sanitizedParameters = isPlainCommandRecord(parameters)
    ? ((sanitizeStrictCommandValue(parameters) as Record<string, unknown> | undefined) ?? {})
    : {};
  const {
    timing,
    spacing,
    intensity,
    sequence,
    constraints,
    style,
    continuation,
    ...otherParameters
  } = sanitizedParameters;

  return {
    ...otherParameters,
    timing: coerceStrictStringParameter(timing, defaults.timing),
    spacing: coerceStrictStringParameter(spacing, defaults.spacing),
    intensity: coerceStrictStringParameter(intensity, defaults.intensity),
    sequence: coerceStrictStringParameter(sequence, defaults.sequence),
    constraints: coerceStrictStringParameter(constraints, defaults.constraints),
    style: coerceStrictStringParameter(style, defaults.style),
    continuation: coerceStrictBooleanParameter(continuation, defaults.continuation),
  } satisfies Record<string, unknown>;
};

const stringifyStrictCommandPayload = (commands: StrictEngineCommand[]) =>
  JSON.stringify(
    {
      commands,
    },
    null,
    2,
  );

const buildStrictQuestionCommandOutput = (taskType: DrawingAiTaskType, question: string) =>
  stringifyStrictCommandPayload([
    {
      type: "request_execution_lock",
      target: taskType,
      parameters: buildStrictCommandParameters(
        {
          question: question.trim(),
        },
        {
          timing: "immediate",
          spacing: "none",
          intensity: "locked",
          sequence: "critical-lock",
          constraints: "one-critical-execution-lock-missing",
          style: "question",
          continuation: false,
        },
      ),
    },
  ]);

const buildStrictBlockedCommandOutput = (taskType: DrawingAiTaskType, reason: string) =>
  stringifyStrictCommandPayload([
    {
      type: "no_plan",
      target: taskType,
      parameters: buildStrictCommandParameters(
        {
          reason: reason.trim() || "No engine-ready command could be prepared safely.",
        },
        {
          timing: "halt",
          spacing: "none",
          intensity: "none",
          sequence: "blocked",
          constraints: "safe-stop",
          style: "command-director",
          continuation: false,
        },
      ),
    },
  ]);

const coerceDirectiveValue = (value: string): unknown => {
  const trimmed = value.trim().replace(/\.$/, "");
  if (!trimmed) {
    return undefined;
  }

  if (/^-?\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  if (/^-?\d+\.\d+$/.test(trimmed)) {
    return Number.parseFloat(trimmed);
  }

  if (/^(true|false)$/i.test(trimmed)) {
    return trimmed.toLowerCase() === "true";
  }

  return trimmed;
};

const parseDirectiveAssignments = (value: string) => {
  const normalized = value.replace(/^.*?->\s*/, "").trim();
  const parameters: Record<string, unknown> = {};

  for (const segment of normalized.split(";")) {
    const trimmedSegment = segment.trim();
    if (!trimmedSegment) {
      continue;
    }

    const separatorIndex = trimmedSegment.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const rawKey = trimmedSegment.slice(0, separatorIndex).trim();
    const rawValue = trimmedSegment.slice(separatorIndex + 1).trim();
    const key = rawKey.replace(/\s+/g, "");
    const sanitizedValue = coerceDirectiveValue(rawValue);
    if (!key || sanitizedValue === undefined) {
      continue;
    }

    parameters[key] = sanitizedValue;
  }

  return parameters;
};

const buildStrictCommandFromActionPlan = (
  actionPlan: NonNullable<DrawingAiResponse["actionPlan"]>,
): StrictEngineCommand => ({
  type: actionPlan.action,
  target: actionPlan.targetSystem,
  parameters: buildStrictCommandParameters(
    {
      commandType: actionPlan.commandType,
      executionGoal: actionPlan.executionGoal,
      executionMode: actionPlan.executionMode,
      commandChain: actionPlan.commandChain,
      ...(isPlainCommandRecord(actionPlan.parameters) ? actionPlan.parameters : {}),
    },
    {
      timing: actionPlan.executionMode === "execute-now" ? "immediate" : "queued",
      spacing: "none",
      intensity: "medium",
      sequence: actionPlan.action,
      constraints: actionPlan.executionGoal,
      style: actionPlan.commandType,
      continuation: actionPlan.commandChain === "continue",
    },
  ),
});

const buildStrictFrameCommandPayload = (
  generatedFramePlan: NonNullable<DrawingAiResponse["generatedFramePlan"]>,
) =>
  stringifyStrictCommandPayload(
    generatedFramePlan.frames.map((frame, index) => {
      const descriptionParameters = parseDirectiveAssignments(frame.description);
      const actionType =
        typeof descriptionParameters.action === "string" && descriptionParameters.action.trim().length > 0
          ? descriptionParameters.action.trim()
          : frame.pose.trim() || "frame_step";
      const remainingParameters = {
        ...descriptionParameters,
      };
      delete remainingParameters.action;

      return {
        type: actionType,
        target: `frame_step_${index + 1}`,
        parameters: buildStrictCommandParameters(
          {
            stepIndex: index + 1,
            requestKind: generatedFramePlan.requestKind,
            requestedFrameCount: generatedFramePlan.requestedFrameCount,
            pose: frame.pose.trim(),
            ...remainingParameters,
          },
          {
            timing: actionType === "pose" ? "static" : "normal",
            spacing: actionType === "pose" ? "none" : "medium",
            intensity: actionType === "pose" ? "none" : "medium",
            sequence: `step-${index + 1}`,
            constraints:
              generatedFramePlan.requestKind === "continuation"
                ? "preserve-current-sequence"
                : "execute-steps-in-order",
            style: actionType,
            continuation: generatedFramePlan.requestKind === "continuation",
          },
        ),
      };
    }),
  );

const buildStrictSoundCommandFromOption = (
  option: DrawingAiSoundOption,
  targetFrameNumber: number | null = null,
): StrictEngineCommand => ({
  type: "define_sound_event",
  target: targetFrameNumber != null ? `frame_${targetFrameNumber}` : "timeline_sound_marker",
  parameters: buildStrictCommandParameters(
    {
      ...(parseDirectiveAssignments(option.title)),
      ...(parseDirectiveAssignments(option.description)),
      ...(parseDirectiveAssignments(option.timingFeel ?? "")),
      ...(parseDirectiveAssignments(option.intensityFeel ?? "")),
      soundFamily: option.soundFamily ?? null,
      soundProfile: option.soundProfile ?? null,
      durationSeconds: option.durationSeconds ?? null,
      negativeConstraints: option.negativeConstraints ?? null,
      planSummary: option.planSummary ?? null,
    },
    {
      timing: option.timingFeel?.trim() || "normal",
      spacing: "tight",
      intensity: option.intensityFeel?.trim() || "medium",
      sequence: targetFrameNumber != null ? `frame-${targetFrameNumber}` : "single-event",
      constraints:
        option.negativeConstraints?.filter((entry) => entry.trim().length > 0).join(" | ") || "preserve-sound-family",
      style: option.soundFamily ?? "sound-event",
      continuation: false,
    },
  ),
});

const buildStrictSoundCommandPayload = (
  soundOptions: DrawingAiSoundOption[],
  targetFrameNumber: number | null = null,
) => stringifyStrictCommandPayload([buildStrictSoundCommandFromOption(soundOptions[0]!, targetFrameNumber)]);

const normalizeGeneratePlansOutputToStrictCommands = (output: string) => {
  const candidate = extractGeneratePlansJsonCandidate(output);
  if (!candidate) {
    return DRAWING_AI_FINAL_PLAN_FALLBACK_OUTPUT;
  }

  try {
    const parsed = JSON.parse(candidate);
    if (!isPlainCommandRecord(parsed)) {
      return DRAWING_AI_FINAL_PLAN_FALLBACK_OUTPUT;
    }

    const rawCommands = Array.isArray(parsed.commands)
      ? parsed.commands
      : Array.isArray(parsed.actions)
        ? parsed.actions
        : null;
    if (!rawCommands) {
      return DRAWING_AI_FINAL_PLAN_FALLBACK_OUTPUT;
    }

    const commands: StrictEngineCommand[] = rawCommands.flatMap((command) => {
        if (!isPlainCommandRecord(command)) {
          return [];
        }

        const type = typeof command.type === "string" ? command.type.trim() : "";
        const target = typeof command.target === "string" ? command.target.trim() : "";
        const rawParameters = isPlainCommandRecord(command.parameters) ? command.parameters : {};
        if (!type || !target) {
          return [];
        }

        return [
          {
            type,
            target,
            parameters: buildStrictCommandParameters(rawParameters, {
              timing: "normal",
              spacing: "medium",
              intensity: "medium",
              sequence: target,
              constraints: "preserve-user-intent",
              style: type,
              continuation: typeof rawParameters.continuation === "boolean" ? rawParameters.continuation : false,
            }),
          } satisfies StrictEngineCommand,
        ];
      });

    return commands.length > 0 ? stringifyStrictCommandPayload(commands) : DRAWING_AI_FINAL_PLAN_FALLBACK_OUTPUT;
  } catch {
    return DRAWING_AI_FINAL_PLAN_FALLBACK_OUTPUT;
  }
};

const buildGeneratePlansGuidedPlanningState = (
  sceneType: DrawingAiGuidedPlanningSceneType,
  status: DrawingAiGuidedPlanningStatus,
): DrawingAiGuidedPlanningState => ({
  sceneType,
  status,
});

const getPromptFromRequestBody = (requestBody: unknown) => {
  if (!requestBody || typeof requestBody !== "object") {
    return null;
  }

  const prompt = (requestBody as AiRouteRequestBody).prompt;
  if (typeof prompt !== "string" || prompt.length === 0) {
    return null;
  }

  return prompt.trim();
};

const getShouldSearchFromRequestBody = (requestBody: unknown) => {
  if (!requestBody || typeof requestBody !== "object") {
    return false;
  }

  return (requestBody as AiRouteRequestBody).shouldSearch === true;
};

const getReasoningLevelFromRequestBody = (requestBody: unknown, warnings: string[]): DrawingAiReasoningLevel => {
  if (!requestBody || typeof requestBody !== "object") {
    return DEFAULT_DRAWING_AI_REASONING_LEVEL;
  }

  const reasoningLevel = (requestBody as AiRouteRequestBody).reasoningLevel;
  if (!isDrawingAiReasoningLevel(reasoningLevel)) {
    warnings.push("Invalid reasoning level. Falling back to medium.");
    return DEFAULT_DRAWING_AI_REASONING_LEVEL;
  }

  return reasoningLevel;
};

const getTaskTypeFromRequestBody = (requestBody: unknown, warnings: string[]): DrawingAiTaskType => {
  if (!requestBody || typeof requestBody !== "object") {
    return DEFAULT_DRAWING_AI_TASK_TYPE;
  }

  const taskType = (requestBody as AiRouteRequestBody).taskType;
  if (!isDrawingAiTaskType(taskType)) {
    warnings.push("Invalid task type. Falling back to other.");
    return DEFAULT_DRAWING_AI_TASK_TYPE;
  }

  return taskType;
};

const getWorkspaceTypeFromRequestBody = (
  requestBody: unknown,
  warnings: string[],
): DrawingAiWorkspaceType | null => {
  if (!requestBody || typeof requestBody !== "object") {
    return null;
  }

  const workspaceType = (requestBody as AiRouteRequestBody).workspaceType;
  if (workspaceType == null) {
    return null;
  }

  if (!isDrawingAiWorkspaceType(workspaceType)) {
    warnings.push("Invalid workspace type metadata. Continuing without dashboard workspace labels.");
    return null;
  }

  return workspaceType;
};

const getConversationHistoryFromRequestBody = (
  requestBody: unknown,
  warnings: string[],
): DrawingAiConversationMessage[] => {
  if (!requestBody || typeof requestBody !== "object") {
    return [];
  }

  const conversationHistory = (requestBody as AiRouteRequestBody).conversationHistory;
  if (conversationHistory == null) {
    return [];
  }

  if (!Array.isArray(conversationHistory)) {
    warnings.push("Invalid conversation history. Continuing without prior chat context.");
    return [];
  }

  return conversationHistory
    .filter((message) => {
      if (isDrawingAiConversationMessage(message)) {
        return true;
      }

      warnings.push("Some conversation history entries were invalid and were ignored.");
      return false;
    })
    .slice(-8);
};

const getFollowUpMemoryFromRequestBody = (
  requestBody: unknown,
  warnings: string[],
): DrawingAiFollowUpMemoryItem[] => {
  if (!requestBody || typeof requestBody !== "object") {
    return [];
  }

  const followUpMemory = (requestBody as AiRouteRequestBody).followUpMemory;
  if (followUpMemory == null) {
    return [];
  }

  if (!Array.isArray(followUpMemory)) {
    warnings.push("Invalid follow-up memory. Continuing without prior planning answers.");
    return [];
  }

  return normalizeDrawingAiFollowUpMemory(
    followUpMemory.filter((item) => {
      if (isDrawingAiFollowUpMemoryItem(item)) {
        return true;
      }

      warnings.push("Some follow-up memory entries were invalid and were ignored.");
      return false;
    }),
  ).slice(-8);
};

const getActiveFollowUpFromRequestBody = (
  requestBody: unknown,
  warnings: string[],
): DrawingAiActiveFollowUp | null => {
  if (!requestBody || typeof requestBody !== "object") {
    return null;
  }

  const activeFollowUp = (requestBody as AiRouteRequestBody).activeFollowUp;
  if (activeFollowUp == null) {
    return null;
  }

  if (!isDrawingAiActiveFollowUp(activeFollowUp)) {
    warnings.push("Invalid active follow-up context. Continuing without guided planning state.");
    return null;
  }

  return activeFollowUp;
};

const getGenerateFramesStateFromRequestBody = (
  requestBody: unknown,
  warnings: string[],
  expectedProjectId: string | null = null,
): DrawingAiGenerateFramesState | null => {
  if (!requestBody || typeof requestBody !== "object") {
    return null;
  }

  const generateFramesState = (requestBody as AiRouteRequestBody).generateFramesState;
  if (generateFramesState == null) {
    return null;
  }

  const sanitizedState = sanitizeDrawingAiGenerateFramesState(generateFramesState);
  if (!sanitizedState) {
    warnings.push("Invalid Generate Frames continuation state. Continuing without prior frame state.");
    return null;
  }

  if (!doesDrawingAiGenerateFramesStateMatchProject(sanitizedState, expectedProjectId)) {
    warnings.push("Ignored Generate Frames continuation state from a different project scope.");
    return null;
  }

  return scopeDrawingAiGenerateFramesStateToProject(sanitizedState, expectedProjectId);
};

const getProjectAiMemoryFromRequestBody = (
  requestBody: unknown,
  warnings: string[],
  expectedProjectId: string | null = null,
): DrawingAiProjectMemory | null => {
  if (!requestBody || typeof requestBody !== "object") {
    return null;
  }

  const projectAiMemory = (requestBody as AiRouteRequestBody).projectAiMemory;
  if (projectAiMemory == null) {
    return null;
  }

  const sanitizedMemory = sanitizeDrawingAiProjectMemory(projectAiMemory);
  if (!sanitizedMemory) {
    warnings.push("Invalid project AI memory. Continuing without persisted project context.");
    return null;
  }

  if (!doesDrawingAiProjectMemoryMatchProject(sanitizedMemory, expectedProjectId)) {
    warnings.push("Ignored project AI memory from a different project scope.");
    return null;
  }

  return scopeDrawingAiProjectMemoryToProject(sanitizedMemory, expectedProjectId);
};

const getFollowUpAnswerSourceFromRequestBody = (
  requestBody: unknown,
  warnings: string[],
): DrawingAiFollowUpAnswerSource | null => {
  if (!requestBody || typeof requestBody !== "object") {
    return null;
  }

  const followUpAnswerSource = (requestBody as AiRouteRequestBody).followUpAnswerSource;
  if (followUpAnswerSource == null) {
    return null;
  }

  if (!isDrawingAiFollowUpAnswerSource(followUpAnswerSource)) {
    warnings.push("Invalid follow-up answer source. Continuing without answer-source metadata.");
    return null;
  }

  return followUpAnswerSource;
};

const getFollowUpInteractionKindFromRequestBody = (
  requestBody: unknown,
  warnings: string[],
): DrawingAiFollowUpInteractionKind | null => {
  if (!requestBody || typeof requestBody !== "object") {
    return null;
  }

  const followUpInteractionKind = (requestBody as AiRouteRequestBody).followUpInteractionKind;
  if (followUpInteractionKind == null) {
    return null;
  }

  if (!isDrawingAiFollowUpInteractionKind(followUpInteractionKind)) {
    warnings.push("Invalid follow-up interaction kind. Continuing without interaction metadata.");
    return null;
  }

  return followUpInteractionKind;
};

const getWorkspaceContextFromRequestBody = (
  requestBody: unknown,
  warnings: string[],
): DrawingAiWorkspaceContext | null => {
  if (!requestBody || typeof requestBody !== "object") {
    return null;
  }

  const workspaceContext = (requestBody as AiRouteRequestBody).workspaceContext;
  if (workspaceContext == null) {
    return null;
  }

  if (!isDrawingAiWorkspaceContext(workspaceContext)) {
    warnings.push("Invalid workspace context. Continuing without real project-state summary.");
    return null;
  }

  return workspaceContext;
};

const getRecentSoundOptionsFromRequestBody = (
  requestBody: unknown,
  warnings: string[],
): DrawingAiSoundOption[] | null => {
  if (!requestBody || typeof requestBody !== "object") {
    return null;
  }

  const recentSoundOptions = (requestBody as AiRouteRequestBody).recentSoundOptions;
  if (recentSoundOptions == null) {
    return null;
  }

  if (!Array.isArray(recentSoundOptions)) {
    warnings.push("Invalid recent sound options. Continuing without option-import context.");
    return null;
  }

  const nextOptions: DrawingAiSoundOption[] = recentSoundOptions
    .filter((item): item is DrawingAiSoundOption => isDrawingAiSoundOption(item))
    .map((option) => ({
      id: option.id,
      title: option.title,
      description: option.description,
      timingFeel: option.timingFeel ?? null,
      intensityFeel: option.intensityFeel ?? null,
      durationSeconds:
        typeof option.durationSeconds === "number" && Number.isFinite(option.durationSeconds) && option.durationSeconds > 0
          ? option.durationSeconds
          : null,
      negativeConstraints: option.negativeConstraints ?? null,
      contentType: option.contentType === "voice-placeholder" ? "voice-placeholder" : "sfx",
      speechText: typeof option.speechText === "string" ? option.speechText : null,
      soundFamily: option.soundFamily ?? null,
      soundProfile: option.soundProfile ?? null,
    }));

  if (nextOptions.length === 0) {
    warnings.push("Recent sound options were present but invalid. Continuing without option-import context.");
    return null;
  }

  return nextOptions;
};

const buildNaturalGeneratePlansReaskLeadIn = (
  interactionKind: DrawingAiFollowUpInteractionKind | null,
) => "";

const SAVE_PROJECT_PATTERN =
  /\b(save(?: this| the| my| current)? project|save project|save this drawing|save this file|save my work)\b/i;
const EXPORT_CURRENT_FRAME_PATTERN =
  /\b(export|download|save out)\b.*\b(current frame|this frame|frame png|png|image|still)\b/i;
const EXPORT_PROJECT_SHARE_PATTERN =
  /\b(export|share)\b.*\b(discord|sharing|share|final delivery|final render|editing)\b/i;
const EXPORT_PROJECT_AMBIGUOUS_PATTERN = /\b(export|share)\b/i;
const RENAME_PROJECT_PATTERN = /\brename (?:this|the|my|current)? project to\s+(.+)\b/i;
const DUPLICATE_SCENE_PATTERN = /\bduplicate (?:this|the|current)? scene\b/i;
const IMPORT_PLACEMENT_PATTERN =
  /\b(where do imported things go|where should imported things go|where should it live|where do imports go|imported things go again)\b/i;
const TOOL_INTENT_PATTERN =
  /\b(what does this button do|what does this tool do|what is this tool actually for|what is this tool for)\b/i;
const ORGANIZE_LAYERS_PATTERN =
  /\b(my layers are a total mess|organize the layers|organise the layers|clean up the layers|cleanup the layers|fix the layers)\b/i;
const OTHER_FRAME_BATCH_PATTERN = /\b(\d+)\s+frames?\b/i;
const OTHER_SOUND_OPTIONS_COUNT_PATTERN = /\b(\d+)\s+sound options?\b|\bsound options?\s+(\d+)\b|\b(\d+)\s+options?\b/i;
const OTHER_SOUND_CHOICE_PATTERN = /^\s*(?:(?:i\s+(?:pick|choose|want))\s*)?(?:option\s*)?(\d+)\s*\.?$/i;
const OTHER_SOUND_REVISION_PATTERN =
  /\b(harder|sharper|softer|heavier|lighter|cleaner|darker|brighter|shorter|longer|bigger|smaller|less tail|more tail|more bass|less bass|same impact|same vibe|same hit|same explosion|make it|make the hit|change the hit|same(?:\s+[a-z-]+){0,3}\s+but)\b/i;
const OTHER_FRAME_CLEANUP_PATTERN =
  /\b(clean up|cleanup|rough pose|without changing (?:it|the pose|the pose idea))\b/i;
const OTHER_PLAN_CONTINUATION_PATTERN =
  /\b(next beat|continue|same project|after this moment|what should happen next|add the next beat)\b/i;
const OTHER_CONTINUATION_PATTERN =
  /\b(continue|next|same project|same workspace|again|keep\b|fix\b|change\b|modify\b|improve\b)\b/i;
const OTHER_FRAME_BATCH_ANCHOR_PATTERN =
  /\b(same project|current project|current scene|same scene|current sequence|same sequence|this scene|this shot|this sequence|this fight|this moment|for this|of this|current animation|same animation)\b/i;
const SOUND_OPTION_IMPORT_PATTERN =
  /\b(?:import|use|put|attach|place)\s+(?:option|sound)?\s*(\d+)\b.*?\b(?:to|on|into)\s+frame\s*(\d+)\b/i;
const SOUND_GENERIC_ATTACH_PATTERN =
  /\b(?:put|attach|place|use|import)\b(?:\s+(?:this|it|that))?\b/i;
const SOUND_DIRECT_FRAME_TARGET_PATTERN =
  /\b(?:on|to|into|at)\s+(?:the\s+)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+)\s+frame\b|\bframe\s*(?:one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+)\b|\bon this frame\b|\bright here\b|\bcurrently on\b/i;
const VOICE_REQUEST_PATTERN =
  /\b(voice|speech|dialogue|spoken|voice line|say(?:ing)?|talk(?:ing)?|speak(?:ing)?)\b/i;
const LITERAL_VOICE_WORD_PATTERN = /\b(hello|hi|hey|yes|no|wait|stop|go)\b/i;
const LITERAL_SPEECH_PLACEMENT_PATTERN =
  /\b(?:put|place|attach|make|have|set)\s+(hello|hi|hey|yes|no|wait|stop|go)\s+(?:on|to|into|at)\s+(?:the\s+)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+)\s+frame\b/i;
const NON_VOICE_SOUND_PATTERN =
  /\b(explosion|blast|impact|punch|kick|landing|whoosh|portal|magic|ambience|alarm|beep|ui|button|click|menu|notification|interface|confirm|robot|bone|fracture|crack|snap|wood|glass|engine|motor|car|race car|racecar|vehicle|door|lock|leaves?|crunch|twig|branch|footsteps?|debris|volcano|rumble|creak|wind|gust|breeze|room tone|hallway air|boing|bounce|cartoon bounce|rubber(?:y)? bounce|spring(?:y)? bounce)\b/i;
const FRAME_NUMBER_WORDS = new Map<string, number>([
  ["one", 1],
  ["first", 1],
  ["two", 2],
  ["second", 2],
  ["three", 3],
  ["third", 3],
  ["four", 4],
  ["fourth", 4],
  ["five", 5],
  ["fifth", 5],
  ["six", 6],
  ["sixth", 6],
  ["seven", 7],
  ["seventh", 7],
  ["eight", 8],
  ["eighth", 8],
  ["nine", 9],
  ["ninth", 9],
  ["ten", 10],
  ["tenth", 10],
]);

const getOtherCommandChain = (prompt: string): "new" | "continue" =>
  OTHER_CONTINUATION_PATTERN.test(prompt) ? "continue" : "new";

const hasOtherFrameBatchAnchor = (prompt: string) =>
  OTHER_CONTINUATION_PATTERN.test(prompt) || OTHER_FRAME_BATCH_ANCHOR_PATTERN.test(prompt);

const buildOtherCommandEnvelopeOutput = (actionPlan: NonNullable<DrawingAiResponse["actionPlan"]>) =>
  JSON.stringify(
    {
      commandType: actionPlan.commandType,
      commandAction: actionPlan.action,
      targetSystem: actionPlan.targetSystem,
      commandParameters: actionPlan.parameters ?? {},
      executionGoal: actionPlan.executionGoal,
      commandChain: actionPlan.commandChain,
    },
    null,
    2,
  );

const buildOtherRoutingQuestion = (prompt: string) =>
  OTHER_FRAME_BATCH_PATTERN.test(prompt) && !hasOtherFrameBatchAnchor(prompt)
    ? "Should this create a new frame sequence or continue the current one?"
    :
  EXPORT_PROJECT_AMBIGUOUS_PATTERN.test(prompt) &&
  !EXPORT_PROJECT_SHARE_PATTERN.test(prompt) &&
  !EXPORT_CURRENT_FRAME_PATTERN.test(prompt)
    ? "Which export command target: editing, sharing, or final-delivery?"
    : "Which command chain: plan, frame, sound, or UI?";

const inferOtherActionPlan = (
  prompt: string,
  routeTarget: DrawingAiTaskType = "other",
): DrawingAiResponse["actionPlan"] => {
  const commandChain = getOtherCommandChain(prompt);

  if (routeTarget === "generate-plans") {
    const isContinuation = OTHER_PLAN_CONTINUATION_PATTERN.test(prompt) || commandChain === "continue";
    return {
      type: "engine-command",
      commandType: "plan-command",
      action: isContinuation ? "extend-plan-sequence" : "prepare-plan-sequence",
      label: isContinuation ? "Extend Plan Sequence" : "Prepare Plan Sequence",
      targetSystem: "generate-plans",
      executionGoal: isContinuation
        ? "Prepare a continuation plan command for the current project."
        : "Prepare a plan-sequence command for engine handoff.",
      executionMode: "prepare-only",
      commandChain: isContinuation ? "continue" : "new",
      parameters: {
        continuation: isContinuation,
        preserveProjectContext: isContinuation,
        modifyOnlyRequestedPart: isContinuation,
      },
    };
  }

  if (routeTarget === "generate-frames") {
    const batchMatch = prompt.match(OTHER_FRAME_BATCH_PATTERN);
    const frameCount = batchMatch ? Number.parseInt(batchMatch[1] ?? "", 10) : Number.NaN;

    if (Number.isFinite(frameCount) && frameCount > 1) {
      if (!hasOtherFrameBatchAnchor(prompt)) {
        return null;
      }

      return {
        type: "engine-command",
        commandType: "frame-command",
        action: "generate-frame-batch",
        label: "Generate Frame Batch",
        targetSystem: "generate-frames",
        executionGoal: "Prepare a frame-batch command for the requested frame count.",
        executionMode: "prepare-only",
        commandChain,
        parameters: {
          frameCount,
          continuation: commandChain === "continue",
        },
      };
    }

    if (OTHER_FRAME_CLEANUP_PATTERN.test(prompt)) {
      return {
        type: "engine-command",
        commandType: "frame-command",
        action: "prepare-frame-cleanup",
        label: "Prepare Frame Cleanup",
        targetSystem: "generate-frames",
        executionGoal: "Prepare a cleanup-only frame command while preserving the existing pose intent.",
        executionMode: "prepare-only",
        commandChain: "continue",
        parameters: {
          preservePoseIntent: true,
          modifyOnlyRequestedPart: true,
          cleanupPass: true,
        },
      };
    }

    return {
      type: "engine-command",
      commandType: "frame-command",
      action: "prepare-next-frame",
      label: "Prepare Next Frame",
      targetSystem: "generate-frames",
      executionGoal: "Prepare the next-frame command for engine handoff.",
      executionMode: "prepare-only",
      commandChain,
      parameters: {
        continuation: commandChain === "continue",
      },
    };
  }

  if (routeTarget === "generate-sounds") {
    const choiceMatch = prompt.match(OTHER_SOUND_CHOICE_PATTERN);
    const selectedOption = choiceMatch ? Number.parseInt(choiceMatch[1] ?? "", 10) : Number.NaN;

    if (Number.isFinite(selectedOption) && selectedOption > 0) {
      return {
        type: "engine-command",
        commandType: "sound-command",
        action: "continue-sound-option-chain",
        label: "Continue Sound Option Chain",
        targetSystem: "generate-sounds",
        executionGoal: "Prepare the selected sound-option branch for engine handoff.",
        executionMode: "prepare-only",
        commandChain: "continue",
        parameters: {
          selectedOption,
          continuation: true,
        },
      };
    }

    if (OTHER_SOUND_REVISION_PATTERN.test(prompt)) {
      return {
        type: "engine-command",
        commandType: "sound-command",
        action: "revise-sound-behavior",
        label: "Revise Sound Behavior",
        targetSystem: "generate-sounds",
        executionGoal: "Prepare a targeted sound revision command without resetting the current sound chain.",
        executionMode: "prepare-only",
        commandChain: "continue",
        parameters: {
          continuation: true,
          modifyOnlyRequestedPart: true,
          preserveTiming: true,
        },
      };
    }

    const optionCountMatch = prompt.match(OTHER_SOUND_OPTIONS_COUNT_PATTERN);
    const optionCount = Number.parseInt(
      optionCountMatch?.[1] ?? optionCountMatch?.[2] ?? optionCountMatch?.[3] ?? "3",
      10,
    );

    return {
      type: "engine-command",
      commandType: "sound-command",
      action: "prepare-sound-options",
      label: "Prepare Sound Options",
      targetSystem: "generate-sounds",
      executionGoal: "Prepare sound-option commands for engine handoff.",
      executionMode: "prepare-only",
      commandChain,
      parameters: {
        optionCount: Number.isFinite(optionCount) && optionCount > 0 ? optionCount : 3,
      },
    };
  }

  if (SAVE_PROJECT_PATTERN.test(prompt)) {
    return {
      type: "engine-command",
      commandType: "ui-command",
      action: "save-project",
      label: "Save Project",
      targetSystem: "workspace-ui",
      executionGoal: "Persist the current project state.",
      executionMode: "execute-now",
      commandChain: /\b(same project|current project|my work)\b/i.test(prompt) ? "continue" : commandChain,
      parameters: {
        scope: "current-project",
      },
    };
  }

  if (EXPORT_CURRENT_FRAME_PATTERN.test(prompt)) {
    return {
      type: "engine-command",
      commandType: "ui-command",
      action: "export-current-frame",
      label: "Export Current Frame",
      targetSystem: "workspace-ui",
      executionGoal: "Export the current frame as an image artifact.",
      executionMode: "execute-now",
      commandChain,
      parameters: {
        scope: "current-frame",
      },
    };
  }

  if (EXPORT_PROJECT_SHARE_PATTERN.test(prompt)) {
    const normalizedPrompt = prompt.toLowerCase();
    const exportTarget = /\bdiscord\b/.test(normalizedPrompt)
      ? "discord"
      : /\bediting\b/.test(normalizedPrompt)
        ? "editing"
        : /\bfinal delivery|final render\b/.test(normalizedPrompt)
          ? "final-delivery"
          : "sharing";
    return {
      type: "engine-command",
      commandType: "ui-command",
      action: "export-project",
      label: "Export Project",
      targetSystem: "workspace-ui",
      executionGoal: "Prepare a project export command with the correct output target.",
      executionMode: "prepare-only",
      commandChain,
      parameters: {
        target: exportTarget,
      },
    };
  }

  if (IMPORT_PLACEMENT_PATTERN.test(prompt)) {
    return {
      type: "engine-command",
      commandType: "ui-command",
      action: "prepare-import-placement-intent",
      label: "Prepare Import Placement",
      targetSystem: "workspace-ui",
      executionGoal: "Prepare import-placement behavior for the current project context.",
      executionMode: "prepare-only",
      commandChain,
      parameters: {
        scope: "imported-assets",
      },
    };
  }

  if (TOOL_INTENT_PATTERN.test(prompt)) {
    return {
      type: "engine-command",
      commandType: "ui-command",
      action: "inspect-tool-intent",
      label: "Inspect Tool Intent",
      targetSystem: "workspace-ui",
      executionGoal: "Prepare a tool-intent lookup for the selected UI control.",
      executionMode: "prepare-only",
      commandChain,
      parameters: {
        scope: "current-tool",
      },
    };
  }

  if (ORGANIZE_LAYERS_PATTERN.test(prompt)) {
    return {
      type: "engine-command",
      commandType: "ui-command",
      action: "organize-layers",
      label: "Organize Layers",
      targetSystem: "workspace-ui",
      executionGoal: "Prepare layer-organization behavior for the current project.",
      executionMode: "prepare-only",
      commandChain,
      parameters: {
        scope: "current-project",
      },
    };
  }

  const renameProjectMatch = prompt.match(RENAME_PROJECT_PATTERN);
  if (renameProjectMatch) {
    const projectName = renameProjectMatch[1]?.trim() ?? "";
    return {
      type: "engine-command",
      commandType: "custom-command",
      action: "prepare-custom-command",
      label: "Prepare Custom Command",
      targetSystem: "engine",
      executionGoal: "Prepare a generic engine command for the requested project rename.",
      executionMode: "prepare-only",
      commandChain: "continue",
      parameters: {
        intent: projectName ? `rename project to ${projectName}` : "rename project",
        preserveProjectContext: true,
        modifyOnlyRequestedPart: true,
      },
    };
  }

  if (DUPLICATE_SCENE_PATTERN.test(prompt)) {
    return {
      type: "engine-command",
      commandType: "custom-command",
      action: "prepare-custom-command",
      label: "Prepare Custom Command",
      targetSystem: "engine",
      executionGoal: "Prepare a generic engine command for the requested scene duplication.",
      executionMode: "prepare-only",
      commandChain: "continue",
      parameters: {
        intent: "duplicate this scene",
        preserveProjectContext: true,
        modifyOnlyRequestedPart: true,
      },
    };
  }

  return null;
};

const buildPreparedEngineCommandOutput = (actionPlan: NonNullable<DrawingAiResponse["actionPlan"]>) =>
  actionPlan.executionMode === "execute-now"
    ? `Prepared engine command: type=${actionPlan.commandType} action=${actionPlan.action} target=${actionPlan.targetSystem} mode=${actionPlan.executionMode}.`
    : `Prepared engine command intent: type=${actionPlan.commandType} action=${actionPlan.action} target=${actionPlan.targetSystem} mode=${actionPlan.executionMode}.`;

const parseSoundOptionImportRequest = (prompt: string) => {
  const patterns = [
    /\b(?:import|use|put|attach|place)\s+(?:the\s+)?(?:option|sound(?: effect)?|sound)?\s*(one|two|three|four|first|second|third|fourth|\d+)\b.*?\b(?:to|on|into|at)\s+frame\s*(one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+)\b/i,
    /\b(?:to|on|into|at|onto)\s+frame\s*(one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+)\b.*?\b(?:option|sound(?: effect)?|sound)?\s*(one|two|three|four|first|second|third|fourth|\d+)\b/i,
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (!match) {
      continue;
    }

    const optionNumber = parseFrameNumberToken(match[1] ?? "");
    const frameNumber = parseFrameNumberToken(match[2] ?? "");
    const firstPatternMatched = pattern === patterns[0];
    const resolvedOptionNumber = firstPatternMatched ? optionNumber : frameNumber;
    const resolvedFrameNumber = firstPatternMatched ? frameNumber : optionNumber;
    if (
      !Number.isFinite(resolvedOptionNumber) ||
      !Number.isFinite(resolvedFrameNumber) ||
      resolvedOptionNumber == null ||
      resolvedFrameNumber == null ||
      resolvedOptionNumber <= 0 ||
      resolvedFrameNumber <= 0
    ) {
      return null;
    }

    return {
      optionNumber: resolvedOptionNumber,
      frameNumber: resolvedFrameNumber,
      optionIndex: resolvedOptionNumber - 1,
      frameIndex: resolvedFrameNumber - 1,
    };
  }

  return null;
};

const parseCurrentSoundOptionSelection = (
  prompt: string,
  recentSoundOptions: DrawingAiSoundOption[] | null,
) => {
  if (!recentSoundOptions || recentSoundOptions.length === 0) {
    return null;
  }

  const strippedPrompt = stripLeadingGreetingFiller(prompt).toLowerCase();

  for (let index = 0; index < recentSoundOptions.length; index += 1) {
    const option = recentSoundOptions[index]!;
    const normalizedTitle = option.title.toLowerCase();
    if (normalizedTitle.length > 0 && strippedPrompt.includes(normalizedTitle)) {
      return {
        option,
        optionIndex: index,
        optionNumber: index + 1,
      };
    }
  }

  const descriptorTokens = strippedPrompt
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4)
    .filter((token) => !["option", "sound", "effect", "attach", "import", "frame", "please", "onto", "into", "with", "that", "this", "use", "keep", "place", "put"].includes(token));

  if (descriptorTokens.length > 0) {
    let bestMatch:
      | {
          option: DrawingAiSoundOption;
          optionIndex: number;
          optionNumber: number;
          score: number;
        }
      | null = null;

    for (let index = 0; index < recentSoundOptions.length; index += 1) {
      const option = recentSoundOptions[index]!;
      const searchable = `${option.title} ${option.description} ${option.intensityFeel ?? ""} ${option.timingFeel ?? ""}`.toLowerCase();
      let score = 0;
      for (const token of descriptorTokens) {
        if (searchable.includes(token)) {
          score += token === "cleaner" || token === "muted" || token === "bright" || token === "darker" ? 2 : 1;
        }
      }

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = {
          option,
          optionIndex: index,
          optionNumber: index + 1,
          score,
        };
      }
    }

    if (bestMatch) {
      return {
        option: bestMatch.option,
        optionIndex: bestMatch.optionIndex,
        optionNumber: bestMatch.optionNumber,
      };
    }
  }

  const patterns = [
    /^\s*(one|two|three|four|first|second|third|fourth|\d+)\s*$/i,
    /^\s*(?:option|sound(?: effect)?|sound)?\s*(one|two|three|four|first|second|third|fourth|\d+)\s*\.?$/i,
    /\b(?:pick|choose|go with|use|keep|attach|import|place|put)\s+(?:the\s+)?(?:option|sound(?: effect)?|sound)?\s*(one|two|three|four|first|second|third|fourth|\d+)\b/i,
    /\bthe\s+(first|second|third|fourth)\s+one\b/i,
  ];

  for (const pattern of patterns) {
    const match = strippedPrompt.match(pattern);
    const optionNumber = parseFrameNumberToken(match?.[1] ?? "");
    if (optionNumber != null && optionNumber >= 1 && optionNumber <= recentSoundOptions.length) {
      return {
        option: recentSoundOptions[optionNumber - 1]!,
        optionIndex: optionNumber - 1,
        optionNumber,
      };
    }
  }

  return null;
};

const parseFrameNumberToken = (token: string) => {
  const normalizedToken = token.trim().toLowerCase();
  const numericValue = Number.parseInt(normalizedToken, 10);
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return numericValue;
  }

  return FRAME_NUMBER_WORDS.get(normalizedToken) ?? null;
};

const stripLeadingGreetingFiller = stripLeadingSoundGreetingFiller;

const parseRequestedFrameTarget = (
  prompt: string,
  workspaceContextValue?: DrawingAiWorkspaceContext | null,
) => {
  const taskPrompt = stripLeadingGreetingFiller(prompt);
  if (
    /\bon this frame\b|\bright here\b|\bcurrently on\b/i.test(taskPrompt) ||
    (/\bhere\b/i.test(taskPrompt) && (VOICE_REQUEST_PATTERN.test(taskPrompt) || LITERAL_VOICE_WORD_PATTERN.test(taskPrompt) || /\bsound\b/i.test(taskPrompt)))
  ) {
    const currentFrameNumber = (workspaceContextValue?.currentFrameIndex ?? 0) + 1;
    return {
      frameNumber: currentFrameNumber,
      frameIndex: currentFrameNumber - 1,
    };
  }

  const tokenPatterns = [
    /\bframe\s*(one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+)\b/i,
    /\b(on|to|into|at)\s+(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+)\s+frame\b/i,
  ];

  for (const pattern of tokenPatterns) {
    const match = taskPrompt.match(pattern);
    const token = match?.[2] ?? match?.[1] ?? "";
    const frameNumber = parseFrameNumberToken(token);
    if (frameNumber != null) {
      return {
        frameNumber,
        frameIndex: frameNumber - 1,
      };
    }
  }

  return null;
};

const looksLikeVoiceSpeechRequest = (prompt: string) => {
  const taskPrompt = stripLeadingGreetingFiller(prompt);

  if (VOICE_REQUEST_PATTERN.test(taskPrompt)) {
    return true;
  }

  return LITERAL_SPEECH_PLACEMENT_PATTERN.test(taskPrompt) || (SOUND_DIRECT_FRAME_TARGET_PATTERN.test(taskPrompt) && LITERAL_VOICE_WORD_PATTERN.test(taskPrompt) && !NON_VOICE_SOUND_PATTERN.test(taskPrompt));
};

const extractRequestedSpeechText = (prompt: string) => {
  const taskPrompt = stripLeadingGreetingFiller(prompt);
  const quotedMatch = taskPrompt.match(/["“]([^"”]{1,60})["”]/);
  if (quotedMatch?.[1]) {
    return quotedMatch[1].trim();
  }

  const sayingMatch = taskPrompt.match(/\b(?:say|saying|voice saying|spoken line saying)\s+([a-z0-9 ,!?'’-]{1,60}?)(?=\s+(?:on|to|into|at)\s+(?:the\s+)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+)\s+frame\b|\s+\b(?:here|please)\b|$)/i);
  if (sayingMatch?.[1]) {
    return sayingMatch[1].trim();
  }

  const literalWordMatch = taskPrompt.match(/\b(hello|hi|hey|yes|no|wait|stop|go)\b/i);
  if (literalWordMatch?.[1]) {
    return literalWordMatch[1].trim();
  }

  return null;
};

const slugifySoundOptionId = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

const buildVoicePlaceholderSoundOption = (
  prompt: string,
  workspaceContextValue?: DrawingAiWorkspaceContext | null,
): DrawingAiSoundOption => {
  const speechText = extractRequestedSpeechText(prompt) ?? "the requested line";
  const fallbackFrameTarget = parseRequestedFrameTarget(prompt, workspaceContextValue);
  return {
    id: `voice-placeholder-${slugifySoundOptionId(speechText) || "line"}`,
    title: speechText === "the requested line" ? "Voice Request Placeholder" : `Voice Request: ${speechText}`,
    description: "Speech placeholder attached for timing and planning. Local spoken-word preview is not supported yet.",
    timingFeel:
      fallbackFrameTarget != null
        ? `on frame ${fallbackFrameTarget.frameNumber}`
        : "on the dialogue beat",
    intensityFeel: "Use this as a voice request marker until speech generation is available.",
    contentType: "voice-placeholder",
    speechText,
  };
};

export async function POST(req: Request) {
  let prompt = "";
  let requestedSearch: boolean | null = null;
  let reasoningLevel: DrawingAiReasoningLevel = DEFAULT_DRAWING_AI_REASONING_LEVEL;
  let taskType: DrawingAiTaskType = DEFAULT_DRAWING_AI_TASK_TYPE;
  let workspaceType: DrawingAiWorkspaceType | null = null;
  let activeFollowUp: DrawingAiActiveFollowUp | null = null;
  let followUpAnswerSource: DrawingAiFollowUpAnswerSource | null = null;
  let followUpInteractionKind: DrawingAiFollowUpInteractionKind | null = null;
  let recentSoundOptions: DrawingAiSoundOption[] | null = null;
  let isGeneratePlansFollowUpContinuation = false;
  let isEditingGeneratePlansFollowUp = false;
  let generatePlansFollowUpInteractionKind: DrawingAiFollowUpInteractionKind | null = null;
  let generatePlansFollowUpFallback = DRAWING_AI_FOLLOW_UP_FALLBACK_OUTPUT;
  let generatePlansContinuationPhase: "before-plan-generation" | "after-plan-generation-started" =
    "before-plan-generation";
  let generatePlansContinuationSceneType = "unknown";
  let generatePlansGuidedPlanningStatus: DrawingAiGuidedPlanningStatus = "questioning";
  let generatePlansHadPreReply = false;
  let normalizedFollowUpMemoryKeys: string[] = [];
  let generatePlansRawTypedAnswer: string | null = null;
  let effectiveTaskType: DrawingAiTaskType = DEFAULT_DRAWING_AI_TASK_TYPE;
  let workspaceContext: DrawingAiWorkspaceContext | null = null;
  let generateFramesState: DrawingAiGenerateFramesState | null = null;
  let projectAiMemory: DrawingAiProjectMemory | null = null;
  let generateFramesRuntimeAnalysis: GenerateFramesRuntimeAnalysis | null = null;
  let generateFramesModelSwitchLog: {
    initialModel: string | null;
    selectedModel: string | null;
    fallbackModelUsed: boolean;
    escalatedFromDefault: boolean;
    escalatedTo: string | null;
    escalationReason: string | null;
    complexityTier: string | null;
  } | null = null;
  let responseBodyForLogging: unknown = null;
  let responseStatusForLogging = 500;
  let responseFailureMessage: string | null = null;
  const requestId = globalThis.crypto?.randomUUID?.() ?? `dev-ai-request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const requestTimestamp = new Date().toISOString();
  const requestStartedAt = Date.now();
  const requestHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const shouldLogDevAiCostRequest = isDevAiCostDashboardEnabledForRequestHost(requestHost);
  if (shouldLogDevAiCostRequest) {
    startDevAiCostRequestScope();
  }

  const respondJson = (body: unknown, init?: ResponseInit) => {
    responseBodyForLogging = body;
    responseStatusForLogging = init?.status ?? 200;
    responseFailureMessage =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : null;
    return NextResponse.json(body, init);
  };

  try {
    const requestBody: unknown = await req.json();
    prompt = getPromptFromRequestBody(requestBody) ?? "";
    requestedSearch = getShouldSearchFromRequestBody(requestBody);
    const warnings: string[] = [];
    const normalizeOptionalSoundString = (value: unknown) =>
      typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
    const normalizeSoundNegativeConstraints = (value: unknown) => {
      if (!Array.isArray(value)) {
        return null;
      }

      const nextConstraints = value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
        .slice(0, 8);

      return nextConstraints.length > 0 ? nextConstraints : null;
    };
    const repairSoundOptionForRoute = (value: unknown, index: number): DrawingAiSoundOption | null => {
      if (isDrawingAiSoundOption(value)) {
        return {
          ...value,
          id: value.id.trim(),
          title: value.title.trim(),
          description: value.description.trim(),
          timingFeel: normalizeOptionalSoundString(value.timingFeel),
          intensityFeel: normalizeOptionalSoundString(value.intensityFeel),
          durationSeconds:
            typeof value.durationSeconds === "number" && Number.isFinite(value.durationSeconds) && value.durationSeconds > 0
              ? value.durationSeconds
              : null,
          negativeConstraints: normalizeSoundNegativeConstraints(value.negativeConstraints),
          contentType: value.contentType === "voice-placeholder" ? "voice-placeholder" : "sfx",
          speechText: normalizeOptionalSoundString(value.speechText),
          soundFamily: isDrawingAiSoundFamily(value.soundFamily) ? value.soundFamily : null,
          soundProfile: normalizeOptionalSoundString(value.soundProfile),
          planId: normalizeOptionalSoundString(value.planId),
          planSummary: normalizeOptionalSoundString(value.planSummary),
          previewSignature: normalizeOptionalSoundString(value.previewSignature),
          validationStatus:
            value.validationStatus === "valid" ||
            value.validationStatus === "adjusted-once" ||
            value.validationStatus === "needs-clarification"
              ? value.validationStatus
              : null,
          referenceUsed: typeof value.referenceUsed === "boolean" ? value.referenceUsed : null,
          referenceSummary: normalizeOptionalSoundString(value.referenceSummary),
        };
      }

      if (typeof value !== "object" || value === null) {
        return null;
      }

      const rawValue = value as Record<string, unknown>;
      const title = normalizeOptionalSoundString(rawValue.title);
      const description = normalizeOptionalSoundString(rawValue.description);
      if (!title || !description) {
        return null;
      }

      const repairedOption: DrawingAiSoundOption = {
        id: normalizeOptionalSoundString(rawValue.id) ?? `repaired-sound-option-${slugifySoundOptionId(title) || index + 1}`,
        title,
        description,
        timingFeel: normalizeOptionalSoundString(rawValue.timingFeel),
        intensityFeel: normalizeOptionalSoundString(rawValue.intensityFeel),
        durationSeconds:
          typeof rawValue.durationSeconds === "number" && Number.isFinite(rawValue.durationSeconds) && rawValue.durationSeconds > 0
            ? rawValue.durationSeconds
            : null,
        negativeConstraints: normalizeSoundNegativeConstraints(rawValue.negativeConstraints),
        contentType: rawValue.contentType === "voice-placeholder" ? "voice-placeholder" : "sfx",
        speechText: normalizeOptionalSoundString(rawValue.speechText),
        soundFamily: isDrawingAiSoundFamily(rawValue.soundFamily) ? rawValue.soundFamily : null,
        soundProfile: normalizeOptionalSoundString(rawValue.soundProfile),
        planId: normalizeOptionalSoundString(rawValue.planId),
        planSummary: normalizeOptionalSoundString(rawValue.planSummary),
        previewSignature: normalizeOptionalSoundString(rawValue.previewSignature),
        validationStatus:
          rawValue.validationStatus === "valid" ||
          rawValue.validationStatus === "adjusted-once" ||
          rawValue.validationStatus === "needs-clarification"
            ? rawValue.validationStatus
            : null,
        referenceUsed: typeof rawValue.referenceUsed === "boolean" ? rawValue.referenceUsed : null,
        referenceSummary: normalizeOptionalSoundString(rawValue.referenceSummary),
      };

      return isDrawingAiSoundOption(repairedOption) ? repairedOption : null;
    };
    const repairSoundOptionsForRoute = (value: unknown, sourceLabel: string): DrawingAiSoundOption[] | null => {
      if (!Array.isArray(value)) {
        return null;
      }

      const repairedOptions = value
        .map((option, index) => repairSoundOptionForRoute(option, index))
        .filter((option): option is DrawingAiSoundOption => option !== null)
        .slice(0, 4);

      const droppedCount = value.length - repairedOptions.length;
      if (droppedCount > 0) {
        warnings.push(
          `Dropped ${droppedCount} malformed sound option${droppedCount === 1 ? "" : "s"} from ${sourceLabel} instead of failing the whole Generate Sounds response.`,
        );
      }

      return repairedOptions.length > 0 ? repairedOptions : null;
    };
    reasoningLevel = getReasoningLevelFromRequestBody(requestBody, warnings);
    taskType = getTaskTypeFromRequestBody(requestBody, warnings);
    workspaceType = getWorkspaceTypeFromRequestBody(requestBody, warnings);
    const conversationHistory = getConversationHistoryFromRequestBody(requestBody, warnings);
    const followUpMemory = getFollowUpMemoryFromRequestBody(requestBody, warnings);
    activeFollowUp = getActiveFollowUpFromRequestBody(requestBody, warnings);
    followUpAnswerSource = getFollowUpAnswerSourceFromRequestBody(requestBody, warnings);
    followUpInteractionKind = getFollowUpInteractionKindFromRequestBody(requestBody, warnings);
    workspaceContext = getWorkspaceContextFromRequestBody(requestBody, warnings);
    const scopedProjectId = normalizeProjectScopeId(workspaceContext?.projectId ?? null);
    recentSoundOptions = getRecentSoundOptionsFromRequestBody(requestBody, warnings);
    projectAiMemory = getProjectAiMemoryFromRequestBody(requestBody, warnings, scopedProjectId);
    generateFramesState =
      getGenerateFramesStateFromRequestBody(requestBody, warnings, scopedProjectId) ?? projectAiMemory?.generateFramesState ?? null;

    if (!prompt) {
      return respondJson(
        { error: "Missing or invalid prompt" },
        { status: 400 },
      );
    }

    const reasoningProfile = getDrawingAiReasoningProfile(reasoningLevel);
    const taskIntentClassification = classifyDrawingAiTaskIntent({
      taskType,
      userMessage: prompt,
      conversationHistory,
      activeFollowUp,
    });
    effectiveTaskType =
      taskIntentClassification.kind === "task"
        ? taskIntentClassification.effectiveTaskType ?? taskType
        : "other";
    let searchDecision = buildDrawingAiSearchDecision({
      userMessage: prompt,
      taskType: effectiveTaskType,
      requestedSearch,
    });
    const shouldReturnGenerateSoundsDisabled =
      effectiveTaskType === "generate-sounds" && !isSoundGenerationEnabled();
    isGeneratePlansFollowUpContinuation =
      effectiveTaskType === "generate-plans" &&
      activeFollowUp !== null &&
      prompt.trim().length > 0;
    generatePlansFollowUpInteractionKind = isGeneratePlansFollowUpContinuation
      ? followUpInteractionKind === "edit"
        ? "edit"
        : "answer"
      : null;
    isEditingGeneratePlansFollowUp = generatePlansFollowUpInteractionKind === "edit";
    generatePlansFollowUpFallback = isEditingGeneratePlansFollowUp
      ? DRAWING_AI_EDITED_FOLLOW_UP_FALLBACK_OUTPUT
      : DRAWING_AI_FOLLOW_UP_FALLBACK_OUTPUT;
    const maxOutputTokens =
      effectiveTaskType === "generate-plans"
        ? Math.min(reasoningProfile.maxOutputTokens, 360)
        : reasoningProfile.maxOutputTokens;
    const generatePlansStoryContext =
      effectiveTaskType === "generate-plans"
        ? buildGeneratePlansAnalysisInput({
            userMessage: "",
            conversationHistory,
            followUpMemory,
          })
        : "";
    generatePlansRawTypedAnswer =
      effectiveTaskType === "generate-plans" && followUpAnswerSource === "typed" ? prompt.trim() : null;
    const resolvedGeneratePlansFollowUpState =
      effectiveTaskType === "generate-plans"
        ? resolveGeneratePlansFollowUpMemory({
            userMessage: prompt,
            followUpMemory,
            activeFollowUp,
            storyContext: generatePlansStoryContext,
          })
        : {
            followUpMemory: [] as DrawingAiFollowUpMemoryItem[],
            parseSucceeded: true,
            normalizedValues: null as string[] | null,
          };
    const resolvedGeneratePlansFollowUpMemory = resolvedGeneratePlansFollowUpState.followUpMemory;
    normalizedFollowUpMemoryKeys = resolvedGeneratePlansFollowUpMemory.map((item) =>
      item.question.trim().toLowerCase(),
    );
    const logGeneratePlansContinuationFailure = (
      reason: "fallback-output" | "exception",
      error?: unknown,
    ) => {
      if (!isGeneratePlansFollowUpContinuation) {
        return;
      }

      console.warn("Generate Plans follow-up continuation failed.", {
        reason,
        interactionKind: generatePlansFollowUpInteractionKind ?? "unknown",
        followUpKey: activeFollowUp?.question?.trim() || "unknown-follow-up",
        storedAnswerKeys: normalizedFollowUpMemoryKeys,
        isEditAnswer: isEditingGeneratePlansFollowUp,
        sceneType: generatePlansContinuationSceneType,
        continuationPhase: generatePlansContinuationPhase,
        followUpAnswerSource: followUpAnswerSource ?? "unknown",
        rawTypedAnswer: generatePlansRawTypedAnswer,
        ...(error === undefined ? {} : { error }),
      });
    };
    const logGeneratePlansFinalFormattingFailure = (
      phase: "before-model-output-normalization" | "after-model-output-normalization",
      error?: unknown,
    ) => {
      if (effectiveTaskType !== "generate-plans") {
        return;
      }

      console.warn("Generate Plans final plan formatting failed.", {
        sceneType: generatePlansContinuationSceneType,
        guidedPlanningStatus: generatePlansGuidedPlanningStatus,
        hadPreReply: generatePlansHadPreReply,
        formattingPhase: phase,
        ...(error === undefined ? {} : { error }),
      });
    };
    const createSafeResponseBody = (
      partialResponse: Partial<DrawingAiResponse> &
        Pick<DrawingAiResponse, "output" | "mode" | "searchUsed" | "warnings">,
      responsePath: string,
      {
        fallbackOutputOverride,
        onFallbackUsed,
      }: {
        fallbackOutputOverride?: string;
        onFallbackUsed?: () => void;
      } = {},
    ) => {
      const resolvedTaskType = partialResponse.taskType ?? effectiveTaskType;
      const resolvedGenerateFramesState =
        resolvedTaskType === "generate-frames"
          ? partialResponse.generateFramesState ??
            (partialResponse.generatedFramePlan && generateFramesRuntimeAnalysis
              ? buildUpdatedGenerateFramesState({
                  analysis: generateFramesRuntimeAnalysis,
                  frames: partialResponse.generatedFramePlan.frames,
                  workspaceContext,
                })
              : generateFramesState)
          : null;
      const resolvedProjectAiMemory =
        partialResponse.projectAiMemory ??
        buildUpdatedDrawingAiProjectMemory({
          existingMemory: projectAiMemory,
          prompt,
          taskType: resolvedTaskType,
          execution: partialResponse.execution ?? null,
          generatedFramePlan: partialResponse.generatedFramePlan ?? null,
          generateFramesState: resolvedGenerateFramesState,
          projectId: normalizeProjectScopeId(workspaceContext?.projectId ?? null),
        });
      const rawOutput = typeof partialResponse.output === "string" ? partialResponse.output.trim() : "";
      const allowEmptyQuestionBoxOutput =
        partialResponse.followUpMode === "question-box" &&
        ((typeof partialResponse.followUpQuestion === "string" && partialResponse.followUpQuestion.trim().length > 0) ||
          (Array.isArray(partialResponse.followUpOptions) && partialResponse.followUpOptions.length > 0));
      const allowEmptyGenerateFramesOutput =
        resolvedTaskType === "generate-frames" &&
        partialResponse.followUpMode !== "question-box" &&
        rawOutput.length === 0;
      const usedFallbackOutput = rawOutput.length === 0 && !allowEmptyQuestionBoxOutput && !allowEmptyGenerateFramesOutput;
      const normalizedResponse = normalizeDrawingAiResponse(
        {
          ...partialResponse,
          generateFramesState: resolvedGenerateFramesState,
          projectAiMemory: resolvedProjectAiMemory,
          taskType: resolvedTaskType,
          reasoningLevel: partialResponse.reasoningLevel ?? reasoningLevel,
          warnings: partialResponse.warnings ?? warnings,
        },
        {
          fallbackOutput:
            fallbackOutputOverride ??
            (isGeneratePlansFollowUpContinuation ? generatePlansFollowUpFallback : DRAWING_AI_FALLBACK_OUTPUT),
          fallbackTaskType: effectiveTaskType,
          fallbackReasoningLevel: reasoningLevel,
          logContext: `Drawing AI route (${responsePath})`,
        },
      );

      if (!usedFallbackOutput) {
        return normalizedResponse;
      }

      if (onFallbackUsed) {
        onFallbackUsed();
      } else {
        logGeneratePlansContinuationFailure("fallback-output");
      }

      return {
        ...normalizedResponse,
        warnings: [
          ...normalizedResponse.warnings,
          "AI response output was missing, so a safe fallback message was used.",
        ],
      };
    };
    const createPipelineResponseBody = (
      partialResponse: Partial<DrawingAiResponse> &
        Pick<DrawingAiResponse, "output" | "mode" | "searchUsed" | "warnings">,
      responsePath: string,
      execution: DrawingAiResponse["execution"],
      options?: {
        fallbackOutputOverride?: string;
        onFallbackUsed?: () => void;
        intentKindOverride?: typeof taskIntentClassification.kind;
      },
    ) => {
      const resolvedTaskType = partialResponse.taskType ?? effectiveTaskType;
      const resolvedSearchUsed = partialResponse.searchUsed === true || searchDecision.shouldSearch;
      const normalizedFollowUpMode = partialResponse.followUpMode ?? "none";
      const normalizedFollowUpQuestion =
        typeof partialResponse.followUpQuestion === "string" && partialResponse.followUpQuestion.trim().length > 0
          ? partialResponse.followUpQuestion.trim()
          : null;
      const shouldForceTypedFollowUp = normalizedFollowUpMode === "question-box";
      const normalizedOutput =
        resolvedTaskType === "generate-plans"
          ? normalizedFollowUpMode === "question-box" && normalizedFollowUpQuestion
            ? buildStrictQuestionCommandOutput("generate-plans", normalizedFollowUpQuestion)
            : partialResponse.output.trim().length > 0
              ? normalizeGeneratePlansOutputToStrictCommands(partialResponse.output)
              : DRAWING_AI_FINAL_PLAN_FALLBACK_OUTPUT
          : resolvedTaskType === "generate-frames"
            ? normalizedFollowUpMode === "question-box" && normalizedFollowUpQuestion
              ? buildStrictQuestionCommandOutput("generate-frames", normalizedFollowUpQuestion)
              : partialResponse.generatedFramePlan
                ? buildStrictFrameCommandPayload(partialResponse.generatedFramePlan)
                : buildStrictBlockedCommandOutput(
                    "generate-frames",
                    partialResponse.warnings.at(-1) ?? responsePath,
                  )
            : resolvedTaskType === "generate-sounds"
              ? normalizedFollowUpMode === "question-box" && normalizedFollowUpQuestion
                ? buildStrictQuestionCommandOutput("generate-sounds", normalizedFollowUpQuestion)
                : partialResponse.actionPlan
                  ? stringifyStrictCommandPayload([buildStrictCommandFromActionPlan(partialResponse.actionPlan)])
                  : partialResponse.soundOptions && partialResponse.soundOptions.length > 0
                    ? buildStrictSoundCommandPayload(partialResponse.soundOptions)
                    : buildStrictBlockedCommandOutput(
                        "generate-sounds",
                        partialResponse.warnings.at(-1) ?? responsePath,
                      )
              : resolvedTaskType === "other"
                ? normalizedFollowUpMode === "question-box" && normalizedFollowUpQuestion
                  ? buildStrictQuestionCommandOutput("other", normalizedFollowUpQuestion)
                  : partialResponse.actionPlan
                    ? stringifyStrictCommandPayload([buildStrictCommandFromActionPlan(partialResponse.actionPlan)])
                    : partialResponse.output.trim().length > 0
                      ? buildStrictQuestionCommandOutput("other", partialResponse.output)
                      : buildStrictBlockedCommandOutput(
                          "other",
                          partialResponse.warnings.at(-1) ?? responsePath,
                        )
                : partialResponse.output;
      return createSafeResponseBody(
        {
          ...partialResponse,
          output: normalizedOutput,
          followUpMode: normalizedFollowUpMode,
          followUpQuestion: normalizedFollowUpQuestion,
          followUpMultiSelect: shouldForceTypedFollowUp ? false : partialResponse.followUpMultiSelect ?? null,
          followUpOptions: shouldForceTypedFollowUp ? null : partialResponse.followUpOptions ?? null,
          searchUsed: resolvedSearchUsed,
          searchDecision,
          phaseHistory: buildDrawingAiPhaseHistory({
            taskType: resolvedTaskType,
            searchUsed: resolvedSearchUsed,
            execution,
            intentKind: options?.intentKindOverride ?? taskIntentClassification.kind,
          }),
          execution,
        },
        responsePath,
        options
          ? {
              fallbackOutputOverride: options.fallbackOutputOverride,
              onFallbackUsed: options.onFallbackUsed,
            }
          : undefined,
      );
    };
    const shouldReturnTemporarilyDisabledTaskResponse =
      taskIntentClassification.kind === "task" &&
      isDrawingAiTaskExecutionTemporarilyDisabled(effectiveTaskType);

    if (shouldReturnTemporarilyDisabledTaskResponse) {
      return respondJson(
        createPipelineResponseBody(
          {
            ...buildTemporarilyDisabledTaskResponseFields(),
            mode: "chat",
            taskType: effectiveTaskType,
            reasoningLevel,
            searchUsed: false,
            warnings: [
              ...warnings,
              `${effectiveTaskType} is temporarily disabled, so the route exited before task execution, output generation, sound preview work, or workspace actions could run.`,
            ],
            preReply: null,
            guidedPlanning: null,
          },
          "task-execution-temporarily-disabled",
          null,
        ),
      );
    }
    if (shouldReturnGenerateSoundsDisabled) {
      return respondJson(
        createPipelineResponseBody(
          {
            ...buildGenerateSoundsDisabledResponseFields(),
            mode: "chat",
            taskType: effectiveTaskType,
            reasoningLevel,
            searchUsed: false,
            warnings: [
              ...warnings,
              "Generate Sounds is temporarily disabled, so the route exited before sound examples, planning, fallback planning, or preview execution could run.",
            ],
            preReply: null,
            guidedPlanning: null,
          },
          "generate-sounds-disabled-early",
          buildGenerateSoundsExecutionSummary({
            prompt,
            followUpMode: "none",
            soundOptions: null,
            safeFallbackUsed: true,
          }),
        ),
      );
    }

    if (taskType === "other" && activeFollowUp === null) {
      const otherRouteTarget = (taskIntentClassification.effectiveTaskType ?? "other") as DrawingAiTaskType;
      const directActionPlan = inferOtherActionPlan(prompt, otherRouteTarget);
      searchDecision = {
        shouldSearch: false,
        reason: "Task Other resolved through deterministic command routing.",
        query: null,
        queries: null,
      };

      return respondJson(
        createPipelineResponseBody(
          {
            output: directActionPlan ? buildOtherCommandEnvelopeOutput(directActionPlan) : buildOtherRoutingQuestion(prompt),
            mode: "chat",
            taskType: "other",
            reasoningLevel,
            searchUsed: false,
            warnings,
            preReply: null,
            guidedPlanning: null,
            questionCardKind: null,
            followUpMode: directActionPlan ? "none" : "question-box",
            followUpQuestion: directActionPlan ? null : buildOtherRoutingQuestion(prompt),
            followUpMultiSelect: false,
            followUpOptions: null,
            soundOptions: null,
            actionPlan: directActionPlan,
          },
          directActionPlan ? "other-command-envelope" : "other-routing-question",
          buildOtherExecutionSummary({
            prompt,
            actionPlan: directActionPlan,
          }),
          {
            intentKindOverride: "task",
          },
        ),
      );
    }

    const looksLikeBackgroundGenerationRequest = (userPrompt: string) =>
      /\b(background|backdrop|environment|mountain background|forest background|snowy plain background|space room background|outer-space window environment|rainstorm scene|forest|woods?|grove|jungle|canyon|ravine|gorge|rooftop|roof|bedroom|bed room|city rooftop|street|alley)\b/i.test(
        userPrompt,
      );
    const buildGeneratedFrameWorkspaceIntent = ({
      userPrompt,
      requestKind,
      workspaceContextValue,
      runtimeAnalysis,
    }: {
      userPrompt: string;
      requestKind: ReturnType<typeof inferDrawingAiFrameRequestKind>;
      workspaceContextValue?: DrawingAiWorkspaceContext | null;
      runtimeAnalysis?: GenerateFramesRuntimeAnalysis | null;
    }): DrawingAiGeneratedFrameWorkspaceIntent => {
      const normalizedPrompt = userPrompt.trim().toLowerCase();
      const primaryFamily = runtimeAnalysis?.primaryFamily ?? null;
      const isBackgroundRequest =
        primaryFamily === "background" ||
        runtimeAnalysis?.componentFamilies.includes("background") === true ||
        looksLikeBackgroundGenerationRequest(normalizedPrompt) ||
        /\bmountain background\b|\bforest background\b|\bspace room background\b|\bouter-space window environment\b/i.test(normalizedPrompt);
      const isEffectRequest =
        primaryFamily === "effect" ||
        runtimeAnalysis?.componentFamilies.includes("effect") === true ||
        /\b(fire|flame|lightning|lightning strike|bolt|energy trail|energy slash|glow effect|sword slash effect|slash arc|slash effect|explosion|explode|blast|debris|rain|rainfall)\b/i.test(normalizedPrompt);
      const isCleanupRequest =
        /\b(clean up|cleanup|fix|redo|erase|only change|keep everything else the same|refine)\b/i.test(normalizedPrompt) &&
        Boolean(workspaceContextValue?.currentFrameHasBitmap);
      const treatContinuationLikeStillScene =
        runtimeAnalysis?.requestKind === "single-frame" &&
        (runtimeAnalysis?.stillFrameRequested === true || runtimeAnalysis?.motionType === "scene");
      const explicitFreshCreateTask =
        runtimeAnalysis?.interactionMode === "create" &&
        !/\b(next frame|continue|current drawing|follow-through|after the punch|after the landing|add anticipation|in-between)\b/i.test(
          normalizedPrompt,
        );
      const isSequenceWideEdit = /\b(all frames|every frame|whole animation|entire sequence|across all frames|throughout)\b/i.test(normalizedPrompt);
      const isContinuationTask =
        !explicitFreshCreateTask &&
        !treatContinuationLikeStillScene &&
        (primaryFamily === "continuation" ||
          requestKind === "continuation" ||
          /\b(next frame|continue|follow-through|after the punch|after the landing|add anticipation|in-between)\b/i.test(normalizedPrompt));
      const wantsLightningTiming = /\b(lightning|lightning strike|bolt)\b/i.test(normalizedPrompt);
      const wantsSmoothTiming = /\b(smooth(?:er)?|cleaner|more in[- ]betweens?|faster|quicker|snappier)\b/i.test(normalizedPrompt);
      const wantsMotionTiming =
        wantsSmoothTiming &&
        (runtimeAnalysis?.motionType != null &&
          runtimeAnalysis.motionType !== "unknown" &&
          runtimeAnalysis.motionType !== "scene") ||
        /\b(ball|bounce|walk|run|jump|swing|throw|slash|recoil|rebound|punch|kick|fight|combat)\b/i.test(normalizedPrompt);
      const suggestedFps =
        typeof runtimeAnalysis?.fps === "number" && Number.isFinite(runtimeAnalysis.fps)
          ? Math.max(1, Math.min(55, Math.round(runtimeAnalysis.fps)))
          : wantsLightningTiming || wantsMotionTiming
            ? 24
            : null;
      const wantsFillEdit = /\b(fill(?:ed| in)?|solid|center black|black fill|use .* fill)\b/i.test(normalizedPrompt);
      const wantsShapeGuidance = /\b(ball|dot|circle|square|rectangle|block|box)\b/i.test(normalizedPrompt);
      const wantsSelectionEdit = /\b(only change|keep everything else the same|preserve|same drawing)\b/i.test(normalizedPrompt);
      const baseToolIntents: DrawingAiGeneratedFrameToolIntent[] = ["brush", "timeline"];
      const hasForegroundSubjects =
        (runtimeAnalysis?.componentFamilies.includes("character") === true ||
          runtimeAnalysis?.componentFamilies.includes("object") === true ||
          runtimeAnalysis?.subjects.some((subject) => subject.type === "character" || subject.type === "object") === true);
      const isMixedCharacterEffectAnimation =
        isEffectRequest &&
        runtimeAnalysis?.outputMode === "animation" &&
        runtimeAnalysis?.componentFamilies.includes("character") === true &&
        hasForegroundSubjects;

      if (isBackgroundRequest && !isContinuationTask && !isEffectRequest) {
        const isComposedSceneRequest =
          runtimeAnalysis?.componentFamilies.includes("background") === true &&
          hasForegroundSubjects;
        if (isComposedSceneRequest) {
          const isAnimatedComposedScene = runtimeAnalysis?.requestKind !== "single-frame";
          return {
            behaviorType: "tool-drawing",
            toolIntents: isAnimatedComposedScene ? ["layer", "brush", "fill", "shape", "timeline"] : ["layer", "brush", "fill", "shape"],
            targetLayerIntent: isAnimatedComposedScene ? "action-layer" : "active-layer",
            toolBased: false,
            generationAllowed: true,
            backgroundGenerationAllowed: true,
            fpsSuggestion: null,
            applySuggestedFps: false,
            fpsReason: null,
          };
        }
        return {
          behaviorType: "background-generation",
          toolIntents: ["layer", "brush", "fill", "shape"],
          targetLayerIntent: "background-layer",
          toolBased: false,
          generationAllowed: true,
          backgroundGenerationAllowed: true,
          fpsSuggestion: null,
          applySuggestedFps: false,
          fpsReason: null,
        };
      }

      if (isMixedCharacterEffectAnimation) {
        const toolIntents: DrawingAiGeneratedFrameToolIntent[] =
          suggestedFps != null ? ["layer", "brush", "glow-brush", "timeline", "fps"] : ["layer", "brush", "glow-brush", "timeline"];
        return {
          behaviorType: "tool-drawing",
          toolIntents,
          targetLayerIntent: "action-layer",
          toolBased: true,
          generationAllowed: false,
          backgroundGenerationAllowed: false,
          fpsSuggestion: suggestedFps,
          applySuggestedFps: suggestedFps != null,
          fpsReason: suggestedFps != null ? "Character-plus-effect motion reads more cleanly when the action and effect timing stay on layered timeline beats." : null,
        };
      }

      if (isEffectRequest) {
        const toolIntents: DrawingAiGeneratedFrameToolIntent[] =
          suggestedFps != null ? ["layer", "brush", "glow-brush", "timeline", "fps"] : ["layer", "brush", "glow-brush", "timeline"];
        return {
          behaviorType: "effect-drawing",
          toolIntents,
          targetLayerIntent: "action-layer",
          toolBased: true,
          generationAllowed: false,
          backgroundGenerationAllowed: false,
          fpsSuggestion: suggestedFps,
          applySuggestedFps: suggestedFps != null,
          fpsReason: suggestedFps != null ? "Fast or smoother effect motion can read more cleanly at a higher playback FPS." : null,
        };
      }

      if (isCleanupRequest) {
        return {
          behaviorType: "cleanup-edit",
          toolIntents: ["brush", "erase", "lasso", "timeline"],
          targetLayerIntent: "active-layer",
          toolBased: true,
          generationAllowed: false,
          backgroundGenerationAllowed: false,
          fpsSuggestion: null,
          applySuggestedFps: false,
          fpsReason: null,
        };
      }

      if (isContinuationTask) {
        const toolIntents: DrawingAiGeneratedFrameToolIntent[] = [...baseToolIntents];
        if (wantsFillEdit) toolIntents.push("fill");
        if (wantsSelectionEdit) toolIntents.push("lasso");
        if (wantsShapeGuidance) toolIntents.push("shape");
        if (wantsMotionTiming) toolIntents.push("fps");
        return {
          behaviorType: "animation-continuation",
          toolIntents: [...new Set(toolIntents)],
          targetLayerIntent: "action-layer",
          toolBased: true,
          generationAllowed: false,
          backgroundGenerationAllowed: false,
          fpsSuggestion: suggestedFps,
          applySuggestedFps: suggestedFps != null,
          fpsReason: suggestedFps != null ? "Smoother motion edits can read more cleanly with a higher playback FPS." : null,
        };
      }

      const toolIntents: DrawingAiGeneratedFrameToolIntent[] = [...baseToolIntents];
      if (wantsFillEdit) toolIntents.push("fill");
      if (wantsShapeGuidance) toolIntents.push("shape");
      if (wantsSelectionEdit || isSequenceWideEdit) toolIntents.push("lasso");
      if (wantsMotionTiming) toolIntents.push("fps");

      return {
        behaviorType: isSequenceWideEdit ? "animation-continuation" : "tool-drawing",
        toolIntents: [...new Set(toolIntents)],
        targetLayerIntent: "action-layer",
        toolBased: true,
        generationAllowed: false,
        backgroundGenerationAllowed: false,
        fpsSuggestion: suggestedFps,
        applySuggestedFps: suggestedFps != null,
        fpsReason: suggestedFps != null ? "Smoother motion edits can read more cleanly with a higher playback FPS." : null,
      };
    };
    const augmentGenerateFramesContinuationAnalysis = ({
      baseAnalysis,
      workspaceContextValue = null,
      historyText = "",
    }: {
      baseAnalysis: GenerateFramesRuntimeAnalysis;
      workspaceContextValue?: DrawingAiWorkspaceContext | null;
      historyText?: string;
    }): GenerateFramesRuntimeAnalysis =>
      strengthenGenerateFramesContinuationAnalysis({
        baseAnalysis,
        additionalHistoryText: historyText,
        workspaceContext: workspaceContextValue,
      });
    const buildSafeGeneratedFramePlanAttempt = ({
      userPrompt,
      existingFrames = [],
      workspaceContextValue = null,
      runtimeAnalysis = null,
    }: {
      userPrompt: string;
      existingFrames?: Array<{ pose: string; description: string }>;
      workspaceContextValue?: DrawingAiWorkspaceContext | null;
      runtimeAnalysis?: GenerateFramesRuntimeAnalysis | null;
    }): {
      generatedFramePlan: DrawingAiResponse["generatedFramePlan"];
      validationReason: string | null;
    } => {
      const sanitizeGeneratedFrameDescription = (value: string) =>
        value
          .replace(/\bDo not [^.?!]+[.?!]?/gi, "")
          .replace(/\bDon't [^.?!]+[.?!]?/gi, "")
          .replace(/\bNo [^.?!]*,\s*just\b/gi, "Just")
          .replace(/\bNo [^.;!?]*(?:characters?|people|person|objects?|foreground subject)[^.;!?]*[.;!?]?/gi, "")
          .replace(/\s+([,.;!?])/g, "$1")
          .replace(/\s{2,}/g, " ")
          .trim();

      const trimmedPrompt = userPrompt.trim();
      if (!trimmedPrompt) {
        return {
          generatedFramePlan: null,
          validationReason: "Prompt was empty.",
        };
      }

      const analysis =
        runtimeAnalysis ??
        analyzeGenerateFramesRequest({
          userMessage: trimmedPrompt,
          conversationHistory,
          workspaceContext: workspaceContextValue,
          generateFramesState,
          projectAiMemory,
        });
      const hasExplicitContinuationAnchor =
        analysis.interactionMode !== "create" ||
        analysis.primaryFamily === "continuation" ||
        analysis.continuationState != null;
      const existingFramesText = existingFrames
        .map((frame) => `${frame.pose} ${frame.description}`)
        .join(" ")
        .toLowerCase();
      const shouldAugmentValidationFromDraftHistory =
        hasExplicitContinuationAnchor;
      const inheritedAnalysis = shouldAugmentValidationFromDraftHistory
        ? augmentGenerateFramesContinuationAnalysis({
            baseAnalysis: analysis,
            workspaceContextValue,
            historyText: existingFramesText,
          })
        : analysis;
      const shouldPreserveExpandedContinuationDrafts =
        hasExplicitContinuationAnchor &&
        Boolean(workspaceContextValue?.currentFrameHasBitmap) &&
        existingFrames.length > inheritedAnalysis.requestedFrameCount &&
        /\b(make it|make the|add|remove|change|tweak|refine|polish|smoother|faster|heavier|cartoony|harder|bigger|shockwave|smoke|dust|poisonous|toxic|spiky|jagged|disintegrat(?:e|ing)|dissipat(?:e|ing)|fade(?: away| out)?|brutal|powerful|serious|weak|scared|hesitant|left|right)\b/i.test(
          trimmedPrompt,
        );
      const analysisForValidation: GenerateFramesRuntimeAnalysis =
        shouldPreserveExpandedContinuationDrafts
          ? {
              ...inheritedAnalysis,
              primaryFamily: Boolean(workspaceContextValue?.currentFrameHasBitmap) ? "continuation" : analysis.primaryFamily,
              requestKind:
                inheritedAnalysis.requestKind === "single-frame" && Boolean(workspaceContextValue?.currentFrameHasBitmap)
                  ? "continuation"
                  : inheritedAnalysis.requestKind,
              requestedFrameCount:
                clampRequestedFrameCount(Math.max(inheritedAnalysis.requestedFrameCount, existingFrames.length)),
            }
          : inheritedAnalysis;
      const validation = validateGenerateFramesDrafts({
        analysis: analysisForValidation,
        frames: clampFrameDraftsToRequest(
        existingFrames
          .map((frame) => {
            const sanitizedDescription = sanitizeGeneratedFrameDescription(frame.description.trim());
            return {
              pose: frame.pose.trim(),
              description: sanitizedDescription,
            };
          })
          .filter((frame) => frame.pose.length > 0 || frame.description.length > 0),
          analysisForValidation.requestedFrameCount,
          "Generate Frames route output",
        ),
      });

      if (!validation.ok || validation.repairedFrames.length === 0) {
        return {
          generatedFramePlan: null,
          validationReason: validation.reason ?? "No usable frame drafts were returned.",
        };
      }

      return {
        generatedFramePlan: {
          requestKind: analysisForValidation.requestKind,
          requestedFrameCount: analysisForValidation.requestedFrameCount,
          workspaceIntent: buildGeneratedFrameWorkspaceIntent({
            userPrompt: trimmedPrompt,
            requestKind: analysisForValidation.requestKind,
            workspaceContextValue,
            runtimeAnalysis: analysisForValidation,
          }),
          frames: validation.repairedFrames,
          ...buildGeneratedFrameQualityContracts(analysisForValidation),
        },
        validationReason: null,
      };
    };
    const buildSafeGeneratedFramePlan = ({
      userPrompt,
      existingFrames = [],
      workspaceContextValue = null,
      runtimeAnalysis = null,
    }: {
      userPrompt: string;
      existingFrames?: Array<{ pose: string; description: string }>;
      workspaceContextValue?: DrawingAiWorkspaceContext | null;
      runtimeAnalysis?: GenerateFramesRuntimeAnalysis | null;
    }): DrawingAiResponse["generatedFramePlan"] =>
      buildSafeGeneratedFramePlanAttempt({
        userPrompt,
        existingFrames,
        workspaceContextValue,
        runtimeAnalysis,
      }).generatedFramePlan;
    const buildGeneratedFrameQualityContracts = (runtimeAnalysis: GenerateFramesRuntimeAnalysis | null) =>
      runtimeAnalysis == null
        ? {}
        : {
            renderingQualityProfile: runtimeAnalysis.renderingQualityProfile,
            familyQualityContract: runtimeAnalysis.familyQualityContract,
            principleActivationProfile: runtimeAnalysis.principleActivationProfile,
            variationEnvelope: runtimeAnalysis.variationEnvelope,
            renderAcceptanceContract: runtimeAnalysis.renderAcceptanceContract,
          };
    const shouldUsePrimaryGenerateFramesRuntime = ({
      analysis,
      promptValue,
      deterministicDrafts,
      workspaceContextValue,
    }: {
      analysis: GenerateFramesRuntimeAnalysis;
      promptValue: string;
      deterministicDrafts: Array<{ pose: string; description: string }> | null;
      workspaceContextValue?: DrawingAiWorkspaceContext | null;
    }) => {
      if (!deterministicDrafts || deterministicDrafts.length === 0) {
        return false;
      }

      if (isGenerateFramesHardNoPlanBlocker(analysis) || !analysis.questionGate.shouldProceedWithoutQuestion) {
        return false;
      }

      if (FRAME_REFERENCE_REQUEST_PATTERN.test(promptValue)) {
        return false;
      }

      if (analysis.cheapFirstDecision.eligible) {
        return true;
      }

      const visibleSubjectCount = analysis.subjects.filter(
        (subject) => subject.type === "character" || subject.type === "object",
      ).length;
      const explicitMultiActorDemand =
        analysis.outputMode === "animation" &&
        /\b((?:two|2)\s+(?:stick(?:\s|-)?figures?|fighters?|characters?|people|combatants?)|both figures?|opponent|defender|attacker|versus|vs\.?|against|left figure|right figure)\b/.test(
          promptValue.trim().toLowerCase(),
        );
      const actionCount = new Set(analysis.actionKeywords).size;
      const sceneComplexity =
        (analysis.sceneSetting != null ? 1 : 0) + analysis.sceneProps.length + analysis.sceneElements.length;
      const effectHeavy =
        analysis.primaryFamily === "effect" ||
        analysis.componentFamilies.includes("effect") ||
        ["explosion", "lightning", "smoke", "shockwave", "impact", "eruption"].includes(analysis.motionType);
      const cameraMotionDemand =
        analysis.outputMode === "animation" &&
        (
          analysis.motionType === "background-scroll" ||
          /\b(camera (?:movement|moving|move|follow)|moving background|background move(?:ment)?|parallax|scroll(?:ing)? background)\b/i.test(
            promptValue,
          )
        );
      const qualityPressure =
        /\b(smooth|cinematic|violent|high quality|full ending|strong timing|more readable|more believable|polish(?:ed)?|detailed|dynamic|recognizable|correct|accurate|proper(?: effect)? layering)\b/i.test(
          promptValue,
        );
      const premiumFinishPressure =
        /\b(cinematic|high quality|full ending|more readable|more believable|polish(?:ed)?|detailed|recognizable|correct|accurate|proper(?: effect)? layering)\b/i.test(
          promptValue,
        );
      const stagedSequenceDemand =
        analysis.outputMode === "animation" &&
        /\b(combo|multi-step|right hand|left hand|airborne|midair|mid-air|martial arts guard stance|guard stance)\b|->|→|\bthen\b|\bafter that\b|\bfollowed by\b|\bending in\b|\bending with\b|\bends in\b|\bends with\b/i.test(
          promptValue,
        ) &&
        (
          analysis.requestedFrameCount >= 8 ||
          actionCount >= 2 ||
          /\b(fireball|projectile|spin(?:ning)?|jump|leap|vault)\b/i.test(promptValue)
        );
      const backdropDemand =
        /\b(background|backdrop|scene|camera|parallax|full[- ]screen|full screen)\b/i.test(promptValue) ||
        analysis.sceneSetting != null ||
        analysis.sceneProps.length > 0 ||
        analysis.sceneElements.length > 0;
      const createTimeEffectBackdropDemand =
        analysis.interactionMode === "create" &&
        analysis.outputMode === "animation" &&
        effectHeavy &&
        (backdropDemand || analysis.requestedFrameCount >= 6 || analysis.fps >= 18 || qualityPressure);
      const humanExpectationRisk =
        analysis.interactionMode === "create" &&
        analysis.humanExpectationRisk !== "low";
      const createTimeHighDemandAnimation =
        analysis.interactionMode === "create" &&
        analysis.outputMode === "animation" &&
        (effectHeavy || cameraMotionDemand || visibleSubjectCount >= 2 || stagedSequenceDemand || (actionCount >= 1 && sceneComplexity >= 2)) &&
        (
          effectHeavy ||
          cameraMotionDemand ||
          stagedSequenceDemand ||
          analysis.requestedFrameCount >= 8 ||
          analysis.fps >= 24 ||
          qualityPressure
        );

      if (
        createTimeHighDemandAnimation ||
        createTimeEffectBackdropDemand ||
        (humanExpectationRisk && (qualityPressure || analysis.shapeConfidence === "needs-reference" || analysis.orderedBeats.length >= 3))
      ) {
        return false;
      }

      if (analysis.primaryFamily === "continuation" && workspaceContextValue?.currentFrameHasBitmap) {
        return true;
      }

      const anchoredBitmapTweakLooksSafe =
        Boolean(workspaceContextValue?.currentFrameHasBitmap) &&
        analysis.interactionMode !== "create" &&
        visibleSubjectCount <= 2 &&
        actionCount <= 1 &&
        sceneComplexity <= 1 &&
        !cameraMotionDemand &&
        (analysis.outputMode === "still" || analysis.requestedFrameCount <= 6) &&
        analysis.editIntents.every((intent) =>
          ["color", "scale", "timing", "tone", "scene", "motion", "transform", "prop"].includes(intent),
        ) &&
        analysis.shapeConfidence !== "needs-reference" &&
        analysis.expectationCoverage !== "needs-reference" &&
        !premiumFinishPressure;

      if (anchoredBitmapTweakLooksSafe) {
        return true;
      }

      if (
        workspaceContextValue?.currentFrameHasBitmap &&
        /\b(make it|make them|make him|make her|make the|make this|add|remove|change|tweak|refine|polish|continue(?: from (?:here|the current drawing|the current scene))?|move|face each other|facing each other|guard stance|ready stance|solid(?:ly)?|filled head|no visible face|remove the face|smoother|faster|heavier|cartoony|harder|bigger|taller|shorter|shockwave|smoke|dust|disintegrat(?:e|ing)|dissipat(?:e|ing)|fade(?: away| out)?|brutal|violent|powerful|serious|weak|scared|hesitant|left|right)\b/i.test(
          promptValue,
        )
      ) {
        return true;
      }

      const hasSpecificSubjectIdentity = analysis.subjects.some((subject) => {
        const label = subject.label?.trim().toLowerCase() ?? "";
        return (
          label.length > 0 &&
          !/^(stick(?:\s|-)?figure|figure|fighter|character|person|creature|robot|ball|object)$/.test(label)
        );
      });
      const hasSubjectDetails = analysis.subjects.some((subject) => (subject.details?.length ?? 0) > 0);
      const hasSceneAnchor =
        analysis.sceneSetting != null || analysis.sceneDescriptors.length > 0 || analysis.sceneProps.length > 0;
      const hasMotionAnchor =
        analysis.motionType !== "unknown" || analysis.actionKeywords.length > 0 || analysis.concepts.length > 0;
      const hasSafeSingleCharacterPoseAnchor =
        analysis.primaryFamily === "character" &&
        analysis.requestKind === "single-frame" &&
        hasMotionAnchor &&
        !hasSceneAnchor;
      const hasStructuredRuntimeAnchor =
        hasMotionAnchor &&
        (hasSceneAnchor ||
          hasSpecificSubjectIdentity ||
          hasSubjectDetails ||
          analysis.subjects.length > 0 ||
          analysis.primaryFamily !== "character" ||
          hasSafeSingleCharacterPoseAnchor);

      if (hasStructuredRuntimeAnchor) {
        return true;
      }

      return analysis.requestKind === "single-frame" && (hasSceneAnchor || analysis.subjects.length > 0);
    };
    const shouldPreferStructuredGenerateFramesPass = ({
      analysis,
      promptValue,
      workspaceContextValue,
    }: {
      analysis: GenerateFramesRuntimeAnalysis;
      promptValue: string;
      workspaceContextValue?: DrawingAiWorkspaceContext | null;
    }) => {
      const normalizedPrompt = promptValue.trim().toLowerCase();
      if (analysis.cheapFirstDecision.eligible) {
        return false;
      }
      const visibleSubjectCount = analysis.subjects.filter(
        (subject) => subject.type === "character" || subject.type === "object",
      ).length;
      const actionCount = new Set(analysis.actionKeywords).size;
      const sceneComplexity =
        (analysis.sceneSetting != null ? 1 : 0) + analysis.sceneProps.length + analysis.sceneElements.length;
      const animationDemand = analysis.outputMode === "animation";
      const cameraMotionDemand =
        animationDemand &&
        (
          analysis.motionType === "background-scroll" ||
          /\b(camera (?:movement|moving|move|follow)|moving background|background move(?:ment)?|parallax|scroll(?:ing)? background)\b/.test(
            normalizedPrompt,
          )
        );
      const qualityPressure =
        /\b(smooth|cinematic|violent|high quality|full ending|strong timing|more readable|more believable|polish(?:ed)?|detailed|dynamic|recognizable|correct|accurate|proper(?: effect)? layering)\b/.test(
          normalizedPrompt,
        );
      const premiumFinishPressure =
        /\b(cinematic|high quality|full ending|more readable|more believable|polish(?:ed)?|detailed|recognizable|correct|accurate|proper(?: effect)? layering)\b/.test(
          normalizedPrompt,
        );
      const stagedSequenceDemand =
        animationDemand &&
        /\b(combo|multi-step|right hand|left hand|airborne|midair|mid-air|martial arts guard stance|guard stance)\b|->|→|\bthen\b|\bafter that\b|\bfollowed by\b|\bending in\b|\bending with\b|\bends in\b|\bends with\b/.test(
          normalizedPrompt,
        ) &&
        (
          analysis.requestedFrameCount >= 8 ||
          actionCount >= 2 ||
          /\b(fireball|projectile|spin(?:ning)?|jump|leap|vault)\b/.test(normalizedPrompt)
        );
      const backdropDemand =
        /\b(background|backdrop|scene|camera|parallax|full[- ]screen|full screen)\b/.test(normalizedPrompt) ||
        analysis.sceneSetting != null ||
        analysis.sceneProps.length > 0 ||
        analysis.sceneElements.length > 0;
      const multiActorAction = visibleSubjectCount >= 2 && analysis.outputMode === "animation";
      const mixedSceneAction =
        multiActorAction &&
        (analysis.sceneSetting != null ||
          analysis.sceneProps.length > 0 ||
          analysis.sceneElements.length > 0 ||
          analysis.componentFamilies.includes("background"));
      const effectHeavy =
        analysis.primaryFamily === "effect" ||
        analysis.componentFamilies.includes("effect") ||
        ["explosion", "lightning", "smoke", "shockwave", "impact", "eruption"].includes(analysis.motionType);
      const simpleGroundedCharacterAnimation =
        analysis.interactionMode === "create" &&
        animationDemand &&
        analysis.primaryFamily === "character" &&
        visibleSubjectCount === 1 &&
        actionCount === 1 &&
        sceneComplexity === 0 &&
        !effectHeavy &&
        !cameraMotionDemand &&
        analysis.shapeConfidence === "grounded-local" &&
        analysis.expectationCoverage === "grounded-local" &&
        analysis.tone === "neutral" &&
        analysis.orderedBeats.length === 0 &&
        analysis.requestedFrameCount <= 10 &&
        !qualityPressure;
      const targetedContinuationReuse =
        Boolean(workspaceContextValue?.currentFrameHasBitmap) &&
        analysis.interactionMode !== "create" &&
        visibleSubjectCount <= 2 &&
        actionCount <= 1 &&
        sceneComplexity <= 1 &&
        !cameraMotionDemand &&
        (analysis.outputMode === "still" || analysis.requestedFrameCount <= 6) &&
        analysis.editIntents.every((intent) =>
          ["color", "scale", "timing", "tone", "scene", "motion", "transform", "prop"].includes(intent),
        ) &&
        analysis.shapeConfidence !== "needs-reference" &&
        analysis.expectationCoverage !== "needs-reference" &&
        !mixedSceneAction &&
        !premiumFinishPressure &&
        !(effectHeavy && /\b(full ending|cinematic|complex|proper(?: effect)? layering)\b/.test(normalizedPrompt));
      const weakContinuationAnchor =
        analysis.interactionMode !== "create" &&
        !workspaceContextValue?.currentFrameHasBitmap &&
        analysis.continuationState == null &&
        analysis.focusTargets.length === 0;
      const humanExpectationRisk =
        analysis.interactionMode === "create" &&
        analysis.humanExpectationRisk !== "low";

      if (targetedContinuationReuse) {
        return false;
      }

      if (simpleGroundedCharacterAnimation) {
        return false;
      }

      if (weakContinuationAnchor) {
        return true;
      }

      if (analysis.interactionMode === "create" && animationDemand && effectHeavy) {
        return true;
      }

      if (analysis.interactionMode === "create" && cameraMotionDemand) {
        return true;
      }

      if (
        humanExpectationRisk &&
        (
          qualityPressure ||
          effectHeavy ||
          cameraMotionDemand ||
          multiActorAction ||
          mixedSceneAction ||
          analysis.shapeConfidence === "needs-reference" ||
          analysis.orderedBeats.length >= 3 ||
          analysis.tone !== "neutral" ||
          actionCount >= 2 ||
          sceneComplexity >= 2 ||
          analysis.fps >= 24
        )
      ) {
        return true;
      }

      if (analysis.interactionMode === "create" && stagedSequenceDemand) {
        return true;
      }

      if (analysis.interactionMode === "create" && animationDemand && effectHeavy && backdropDemand) {
        return true;
      }

      if (
        analysis.interactionMode === "create" &&
        animationDemand &&
        (multiActorAction || mixedSceneAction) &&
        (qualityPressure || analysis.requestedFrameCount >= 8 || analysis.fps >= 24 || actionCount >= 1 || sceneComplexity >= 2)
      ) {
        return true;
      }

      let structuredPreferenceScore = 0;

      if (animationDemand) structuredPreferenceScore += 1;
      if (cameraMotionDemand) structuredPreferenceScore += 2;
      if (visibleSubjectCount >= 2) structuredPreferenceScore += 2;
      if (actionCount >= 2) {
        structuredPreferenceScore += 2;
      } else if (actionCount === 1 && animationDemand) {
        structuredPreferenceScore += 1;
      }
      if (sceneComplexity >= 4) {
        structuredPreferenceScore += 2;
      } else if (sceneComplexity >= 2) {
        structuredPreferenceScore += 1;
      }
      if (effectHeavy) {
        structuredPreferenceScore += animationDemand || qualityPressure ? 2 : 1;
      }
      if (stagedSequenceDemand) structuredPreferenceScore += 3;
      if (effectHeavy && backdropDemand) structuredPreferenceScore += 2;
      if (analysis.requestedFrameCount >= 12) {
        structuredPreferenceScore += 2;
      } else if (analysis.requestedFrameCount >= 8) {
        structuredPreferenceScore += 1;
      }
      if (analysis.fps >= 24) structuredPreferenceScore += 1;
      if (qualityPressure) structuredPreferenceScore += 2;
      if (
        analysis.interactionMode === "create" &&
        animationDemand &&
        (effectHeavy || multiActorAction || mixedSceneAction || (actionCount >= 1 && sceneComplexity >= 2))
      ) {
        structuredPreferenceScore += 1;
      }
      if (analysis.expectationCoverage === "needs-reference" || analysis.shapeConfidence === "needs-reference") structuredPreferenceScore += 2;
      if (analysis.subjectPurityMode === "strict-effect-only") structuredPreferenceScore += 1;
      if (["explosion-complete", "lightning-vanish", "smoke-dissipate", "fight-resolve"].includes(analysis.expectedCompletionProfile)) {
        structuredPreferenceScore += 1;
      }
      if (analysis.orderedBeats.length >= 3) structuredPreferenceScore += 2;
      if (analysis.humanExpectationRisk === "high") structuredPreferenceScore += 2;

      return structuredPreferenceScore >= 5;
    };
    const shouldAllowDeterministicFallbackAfterStructuredFailure = ({
      analysis,
      promptValue,
      workspaceContextValue,
      structuredSucceeded = false,
    }: {
      analysis: GenerateFramesRuntimeAnalysis | null;
      promptValue: string;
      workspaceContextValue?: DrawingAiWorkspaceContext | null;
      structuredSucceeded?: boolean;
    }) => {
      if (analysis == null) {
        return true;
      }

      const normalizedPrompt = promptValue.trim().toLowerCase();
      const visibleSubjectCount = analysis.subjects.filter(
        (subject) => subject.type === "character" || subject.type === "object",
      ).length;
      const actionCount = new Set(analysis.actionKeywords).size;
      const sceneComplexity =
        (analysis.sceneSetting != null ? 1 : 0) + analysis.sceneProps.length + analysis.sceneElements.length;
      const animationDemand = analysis.outputMode === "animation";
      const effectHeavy =
        analysis.primaryFamily === "effect" ||
        analysis.componentFamilies.includes("effect") ||
        ["explosion", "lightning", "smoke", "shockwave", "impact", "eruption"].includes(analysis.motionType);
      const cameraMotionDemand =
        animationDemand &&
        (
          analysis.motionType === "background-scroll" ||
          /\b(camera (?:movement|moving|move|follow)|moving background|background move(?:ment)?|parallax|scroll(?:ing)? background)\b/.test(
            normalizedPrompt,
          )
        );
      const explicitMultiActorDemand =
        animationDemand &&
        /\b((?:two|2)\s+(?:stick(?:\s|-)?figures?|fighters?|characters?|people|combatants?)|both figures?|opponent|defender|attacker|versus|vs\.?|against|left figure|right figure)\b/.test(
          normalizedPrompt,
        );
      const qualityPressure =
        /\b(smooth|cinematic|realistic|accurate|proper|recognizable|correct|high quality|full ending|violent|dynamic|detailed)\b/.test(
          normalizedPrompt,
        );
      const layeredSceneDemand =
        /\b(background|backdrop|scene|camera|parallax|full[- ]screen|full screen|layer(?:ing)?|over the scene)\b/.test(
          normalizedPrompt,
        ) ||
        sceneComplexity >= 2 ||
        analysis.componentFamilies.includes("background");
      const choreographyDemand =
        animationDemand &&
        (
          analysis.orderedBeats.length >= 3 ||
          /\b(combo|multi-step|right hand|left hand|airborne|midair|mid-air|then|followed by|ending in|guard stance)\b|->|→/.test(
            normalizedPrompt,
          )
        );
      const needsReference =
        analysis.shapeConfidence === "needs-reference" || analysis.expectationCoverage === "needs-reference";
      const explicitExplosionPrompt =
        /\b(explosion|explode|blast|detonation|fireball)\b/.test(normalizedPrompt);
      const safeExplosionFallbackCandidate =
        (analysis.motionType === "explosion" || analysis.concepts.includes("explosion") || explicitExplosionPrompt) &&
        (animationDemand || explicitExplosionPrompt) &&
        (analysis.primaryFamily === "effect" || analysis.componentFamilies.includes("effect") || explicitExplosionPrompt) &&
        !analysis.componentFamilies.includes("character") &&
        !explicitMultiActorDemand &&
        !cameraMotionDemand &&
        !choreographyDemand &&
        !layeredSceneDemand;
      const simpleGroundedCharacterAnimation =
        analysis.interactionMode === "create" &&
        animationDemand &&
        analysis.primaryFamily === "character" &&
        visibleSubjectCount === 1 &&
        actionCount === 1 &&
        !effectHeavy &&
        !cameraMotionDemand &&
        !layeredSceneDemand &&
        analysis.shapeConfidence === "grounded-local" &&
        analysis.expectationCoverage === "grounded-local" &&
        analysis.tone === "neutral" &&
        analysis.orderedBeats.length === 0 &&
        analysis.requestedFrameCount <= 10 &&
        !qualityPressure;
      const extremeCoordinationDemand =
        choreographyDemand ||
        (animationDemand && visibleSubjectCount >= 2) ||
        (layeredSceneDemand && (effectHeavy || visibleSubjectCount >= 2 || actionCount >= 2)) ||
        (cameraMotionDemand && qualityPressure && sceneComplexity >= 3) ||
        (effectHeavy && qualityPressure && layeredSceneDemand);
      const highComplexityPrompt =
        analysis.interactionMode === "create" &&
        !simpleGroundedCharacterAnimation &&
        (
          choreographyDemand ||
          explicitMultiActorDemand ||
          (animationDemand && actionCount >= 2) ||
          (layeredSceneDemand && explicitMultiActorDemand) ||
          (effectHeavy && layeredSceneDemand && explicitMultiActorDemand) ||
          (cameraMotionDemand && qualityPressure && sceneComplexity >= 3) ||
          (analysis.fps >= 24 && (choreographyDemand || explicitMultiActorDemand || actionCount >= 2))
        );

      if (safeExplosionFallbackCandidate) {
        return true;
      }

      if (!highComplexityPrompt) {
        return true;
      }

      if (!structuredSucceeded) {
        return false;
      }

      const anchoredSmallAdjustment =
        analysis.interactionMode !== "create" &&
        (workspaceContextValue?.currentFrameHasBitmap === true || analysis.continuationState != null) &&
        analysis.editIntents.length > 0 &&
        analysis.orderedBeats.length < 3 &&
        analysis.humanExpectationRisk !== "high" &&
        !needsReference &&
        !(effectHeavy && qualityPressure);

      return anchoredSmallAdjustment;
    };
    type GenerateFramesRecoveryFailureCategory =
      | "critical-targeting"
      | "continuity"
      | "anti-weirdness"
      | "geometry"
      | "motion"
      | "completion"
      | "quality-floor"
      | "structured-no-result"
      | "structured-failure";
    type GenerateFramesRecoveryAttemptOutcome =
      | "recovered"
      | "rejected"
      | "no-result"
      | "failed-before-validation"
      | "fallback-used"
      | "fallback-blocked";
    type GenerateFramesRecoveryLedgerEntry = {
      attemptLabel: string;
      failureCategory: GenerateFramesRecoveryFailureCategory;
      preservedContext: string[];
      changed: string[];
      modelTier: string;
      grounding: string;
      outcome: GenerateFramesRecoveryAttemptOutcome;
      qualityResult: string;
      reason: string;
      signature: string;
    };
    const categorizeGenerateFramesRecoveryFailure = (
      reason: string | null | undefined,
    ): GenerateFramesRecoveryFailureCategory => {
      const normalizedReason = reason?.trim().toLowerCase() ?? "";
      if (!normalizedReason) {
        return "structured-failure";
      }
      if (
        /\b(scene|same-project|continuity|restart|preserving the current shot|preserve the current shot|new scene)\b/.test(
          normalizedReason,
        )
      ) {
        return "continuity";
      }
      if (
        /\b(target|subject|color|side|role|binding|wrong subject|wrong count|multi-subject|extra actor|single-subject)\b/.test(
          normalizedReason,
        )
      ) {
        return "critical-targeting";
      }
      if (
        /\b(extra subjects?|unrelated props?|face|effect-only|weird|blob|junk|unrelated|core event)\b/.test(
          normalizedReason,
        )
      ) {
        return "anti-weirdness";
      }
      if (/\b(shape|appearance|silhouette|limb|limbs|recognizable|messy|blob-like)\b/.test(normalizedReason)) {
        return "geometry";
      }
      if (/\b(motion|timing|jitter|stiff|readability|follow-through|anticipation)\b/.test(normalizedReason)) {
        return "motion";
      }
      if (/\b(ending|end state|ending state|aftermath|recovery|vanish|completion|too few beats|finish)\b/.test(normalizedReason)) {
        return "completion";
      }
      if (/\b(no-plan|asked a question|question instead|no usable result|failed before validation)\b/.test(normalizedReason)) {
        return "structured-no-result";
      }
      if (/\b(quality floor|weak|generic|placeholder|not good enough|validation)\b/.test(normalizedReason)) {
        return "quality-floor";
      }
      return "structured-failure";
    };
    const buildGenerateFramesRecoveryPreservedContext = (analysis: GenerateFramesRuntimeAnalysis | null) => {
      if (analysis == null) {
        return [] as string[];
      }

      const preserved: string[] = [];
      if (analysis.projectScope === "same-project") {
        preserved.push("same-project continuity");
      }
      if (analysis.shotScope === "tweak-current-shot" || analysis.shotScope === "continue-current-shot") {
        preserved.push("current shot anchor");
      } else if (analysis.shotScope === "new-shot-same-project") {
        preserved.push("same-project cast continuity");
      }
      const subjectIds = Array.from(
        new Set(
          (analysis.sequenceBeats ?? [])
            .flatMap((beat) => beat.subjectIds)
            .filter((subjectId) => subjectId.trim().length > 0),
        ),
      );
      if (subjectIds.length > 0) {
        preserved.push(`subject-ids:${subjectIds.join(",")}`);
      } else {
        const subjectLabels = Array.from(
          new Set(
            analysis.subjects
              .map((subject) => subject.label?.trim() ?? "")
              .filter((label) => label.length > 0),
          ),
        );
        if (subjectLabels.length > 0) {
          preserved.push(`subjects:${subjectLabels.join(",")}`);
        }
      }
      if ((analysis.sequenceBeats?.length ?? 0) > 0) {
        preserved.push("explicit beat order");
      }
      if (analysis.sceneSetting != null || analysis.sceneDescriptors.length > 0) {
        preserved.push("scene continuity");
      }
      if (analysis.projectScope === "same-project") {
        preserved.push("story continuity");
      }
      return preserved.slice(0, 8);
    };
    const getNextGenerateFramesRecoveryModel = (model: string | null | undefined) => {
      if (model === AI_TEXT_ECONOMY_MODEL) {
        return AI_TEXT_BALANCED_MODEL;
      }
      if (model === AI_TEXT_BALANCED_MODEL) {
        return AI_TEXT_MODEL;
      }
      return null;
    };
    const buildGenerateFramesRecoveryAttemptSignature = ({
      failureCategory,
      preservedContext,
      changed,
      modelTier,
      grounding,
    }: Omit<GenerateFramesRecoveryLedgerEntry, "attemptLabel" | "outcome" | "qualityResult" | "reason" | "signature">) =>
      [
        failureCategory,
        modelTier.trim() || "unknown-model",
        grounding.trim() || "local-only",
        [...new Set(preservedContext)].sort().join("|"),
        [...new Set(changed)].sort().join("|"),
      ].join("::");
    const buildGenerateFramesControlledRecoveryWarning = ({
      latestReason,
      ledger,
      qualityFloor,
      fallbackEvaluated,
    }: {
      latestReason: string;
      ledger: GenerateFramesRecoveryLedgerEntry[];
      qualityFloor: string;
      fallbackEvaluated: boolean;
    }) => {
      const failedCategories = Array.from(new Set(ledger.map((entry) => entry.failureCategory)));
      return [
        "Generate Frames bounded recovery exhausted.",
        `Unresolved blocker: ${latestReason}`,
        `Failed categories: ${failedCategories.join(", ") || "structured-failure"}.`,
        `No safe output cleared the ${qualityFloor} quality floor after targeted repair, justified escalation, and ${
          fallbackEvaluated ? "deterministic fallback evaluation." : "the available bounded recovery paths."
        }`,
      ].join(" ");
    };
    const shouldAllowGenerateFramesEscalationAttempt = ({
      analysis,
      failureCategory,
      latestReason,
      searchGrounded,
    }: {
      analysis: GenerateFramesRuntimeAnalysis | null;
      failureCategory: GenerateFramesRecoveryFailureCategory;
      latestReason: string;
      searchGrounded: boolean;
    }) => {
      if (analysis == null) {
        return failureCategory === "structured-no-result" || failureCategory === "structured-failure";
      }

      const orderedOrChoreographyHeavy =
        (analysis.orderedBeats.length ?? 0) >= 3 ||
        /\b(combo|multi-step|right hand|left hand|then|followed by|ending in|guard stance)\b|->|→/i.test(analysis.prompt);
      const continuitySensitive =
        analysis.projectScope === "same-project" && analysis.shotScope !== "create-first-shot";
      const completionSensitive = ["completion", "motion"].includes(failureCategory) && analysis.outputMode === "animation";
      const failureLooksModelTierSensitive =
        /\b(missing|too few|ordered|sequence|continuity|same-project|style|reference|readability|completion|ending|vanish|aftermath|recovery)\b/i.test(
          latestReason,
        );

      switch (failureCategory) {
        case "continuity":
          return continuitySensitive;
        case "critical-targeting":
          return continuitySensitive || orderedOrChoreographyHeavy || searchGrounded;
        case "completion":
          return completionSensitive || orderedOrChoreographyHeavy || searchGrounded;
        case "motion":
          return orderedOrChoreographyHeavy || searchGrounded || analysis.humanExpectationRisk === "high";
        case "structured-no-result":
        case "structured-failure":
          return orderedOrChoreographyHeavy || continuitySensitive || searchGrounded || failureLooksModelTierSensitive;
        case "quality-floor":
          return searchGrounded || (orderedOrChoreographyHeavy && failureLooksModelTierSensitive);
        default:
          return false;
      }
    };
    const resolveSafeSoundOptionCount = () => 1;
    const inferSafeSoundTimingFeel = (
      userPrompt: string,
      workspaceContextValue?: DrawingAiWorkspaceContext | null,
    ) => inferCanonicalSoundTimingFeel(userPrompt, workspaceContextValue);
    const buildSafeSoundOptions = (
      userPrompt: string,
      optionCount: number,
      workspaceContextValue?: DrawingAiWorkspaceContext | null,
    ) => buildCanonicalSoundOptionSet(userPrompt, optionCount, workspaceContextValue);
    const buildSafeSoundOptionsResponse = ({
      soundOptions,
      recommendedIndex,
      targetFrameNumber,
    }: {
      soundOptions: DrawingAiSoundOption[];
      recommendedIndex: number;
      targetFrameNumber?: number | null;
    }) => {
      const bestFitOption =
        soundOptions[Math.max(0, Math.min(soundOptions.length - 1, recommendedIndex - 1))] ?? soundOptions[0] ?? null;
      const baseCommand = bestFitOption?.description ?? "";
      if (targetFrameNumber == null) {
        return baseCommand;
      }
      return `${baseCommand} attach=frame ${targetFrameNumber};`.trim();
    };
    const maybeCanonicalizeStructuredSoundResult = ({
      userPrompt,
      structuredResponse,
      workspaceContextValue,
      targetFrameNumber,
    }: {
      userPrompt: string;
      structuredResponse: Awaited<ReturnType<typeof generateGenerateSoundStructuredResponse>>;
      workspaceContextValue?: DrawingAiWorkspaceContext | null;
      targetFrameNumber?: number | null;
    }) => {
      const optionCount = resolveSafeSoundOptionCount();
      if (structuredResponse.decision !== "result") {
        return structuredResponse;
      }

      const canonicalOptionSet = buildSafeSoundOptions(userPrompt, optionCount, workspaceContextValue);
      if (canonicalOptionSet.family === "generic") {
        return structuredResponse;
      }

      const canonicalSoundOptions = canonicalOptionSet.soundOptions;
      const alreadyCanonical =
        structuredResponse.soundOptions.length === canonicalSoundOptions.length &&
        structuredResponse.soundOptions.every((option, index) => {
          const canonicalOption = canonicalSoundOptions[index];
          return (
            canonicalOption != null &&
            option.title === canonicalOption.title &&
            option.description === canonicalOption.description &&
            option.timingFeel === canonicalOption.timingFeel &&
            option.intensityFeel === canonicalOption.intensityFeel &&
            (option.durationSeconds ?? null) === (canonicalOption.durationSeconds ?? null) &&
            JSON.stringify(option.negativeConstraints ?? null) === JSON.stringify(canonicalOption.negativeConstraints ?? null) &&
            option.soundFamily === canonicalOption.soundFamily &&
            option.soundProfile === canonicalOption.soundProfile
          );
        });

      if (alreadyCanonical) {
        return structuredResponse;
      }

      return {
        ...structuredResponse,
        response: buildSafeSoundOptionsResponse({
          soundOptions: canonicalSoundOptions,
          recommendedIndex: canonicalOptionSet.recommendedIndex,
          targetFrameNumber,
        }),
        soundOptions: canonicalSoundOptions,
        warnings: [
          ...(structuredResponse.warnings ?? []),
          `Structured sound options were canonicalized to the trusted ${canonicalOptionSet.familyLabel} profile set so the engine handoff stays inside the intended category.`,
        ],
      };
    };
    const buildSafeGenerateSoundsFallback = (
      userPrompt: string,
      workspaceContextValue?: DrawingAiWorkspaceContext | null,
      targetFrameNumber?: number | null,
    ) => {
      const normalizedPrompt = userPrompt.trim();
      const optionCount = resolveSafeSoundOptionCount();
      const looksLikeMusicRequest =
        /\b(music|score|soundtrack|background score|background music|theme music|musical cue|underscore)\b/i.test(
          normalizedPrompt,
        ) && !/\b(beep|click|impact|explosion|wind|door|bone|crack|snap|footstep|rain|lightning)\b/i.test(normalizedPrompt);
      const looksTooVague =
        /\b(sound here|something here|add something here|need a sound here)\b/i.test(normalizedPrompt) &&
        !/\b(impact|hit|punch|kick|landing|door|portal|hallway|ambience|beep|warning|explosion|break|bone|click)\b/i.test(normalizedPrompt);

      if (looksLikeMusicRequest) {
        return {
          response:
            "I can help prepare short execution-ready engine behavior plans for this scene, but I do not have a music or score workflow here yet.",
          followUpMode: "none" as const,
          followUpQuestion: null,
          followUpMultiSelect: null,
          followUpOptions: null,
          questionCardKind: null,
          soundOptions: null,
          warnings: [
            ...warnings,
            "Generate Sounds music-style prompt was handled honestly instead of being forced through the short-form sound-direction planner.",
          ],
        };
      }

      if (looksTooVague) {
        return {
          response: "",
          followUpMode: "question-box" as const,
          followUpQuestion: "What action or exact moment should this sound match?",
          followUpMultiSelect: false,
          followUpOptions: null,
          questionCardKind: "sound" as const,
          soundOptions: null,
          warnings: [
            ...warnings,
            "Generate Sounds structured generation failed, so a safe sound clarification question was used.",
          ],
        };
      }

      const soundOptionSet = buildSafeSoundOptions(normalizedPrompt, optionCount, workspaceContextValue);
      const soundOptions = soundOptionSet.soundOptions;
      const response =
        optionCount > 1
          ? buildSafeSoundOptionsResponse({
              soundOptions,
              recommendedIndex: soundOptionSet.recommendedIndex,
              targetFrameNumber,
            })
          : `${soundOptions[0]?.description ?? ""}${targetFrameNumber != null ? ` attach=frame ${targetFrameNumber};` : ""}`.trim();

      return {
        response,
        followUpMode: "none" as const,
        followUpQuestion: null,
        followUpMultiSelect: null,
        followUpOptions: null,
        questionCardKind: null,
        soundOptions,
        warnings: [
          ...warnings,
          "Generate Sounds structured generation failed, so a safe sound fallback was used.",
        ],
      };
    };
    const buildTrustedDeterministicRuntimePlan = ({
      userPrompt: trustedPrompt,
      analysis: trustedAnalysis,
      deterministicDrafts: trustedDrafts,
      workspaceContextValue,
    }: {
      userPrompt: string;
      analysis: GenerateFramesRuntimeAnalysis;
      deterministicDrafts: Array<{ pose: string; description: string }> | null;
      workspaceContextValue?: DrawingAiWorkspaceContext | null;
    }): DrawingAiResponse["generatedFramePlan"] => {
      if (
        trustedDrafts == null ||
        trustedDrafts.length === 0 ||
        trustedAnalysis.interactionMode === "discuss"
      ) {
        return null;
      }
      const anchoredContinuationEdit =
        trustedAnalysis.interactionMode !== "create" &&
        (workspaceContextValue?.currentFrameHasBitmap === true || trustedAnalysis.continuationState != null);
      const qualifiesAsTrustedEvent =
        (trustedAnalysis.visualKind === "event" && trustedAnalysis.promptSubject != null) ||
        (anchoredContinuationEdit && trustedAnalysis.primaryFamily === "continuation");
      const qualifiesAsTrustedEffectAnimation =
        trustedAnalysis.outputMode === "animation" &&
        (
          trustedAnalysis.primaryFamily === "effect" ||
          trustedAnalysis.componentFamilies.includes("effect")
        ) &&
        (
          trustedAnalysis.motionType === "lightning" ||
          trustedAnalysis.motionType === "explosion" ||
          trustedAnalysis.motionType === "smoke" ||
          trustedAnalysis.motionType === "impact" ||
          trustedAnalysis.concepts.some((concept) => ["explosion", "lightning", "shockwave", "smoke"].includes(concept)) ||
          trustedAnalysis.actionKeywords.some((keyword) => ["explode", "lightning", "smoke", "impact", "erupt"].includes(keyword))
        );
      const qualifiesAsTrustedStillScene =
        trustedAnalysis.requestKind === "single-frame" &&
        trustedAnalysis.outputMode === "still" &&
        (
          trustedAnalysis.visualKind === "scene" ||
          trustedAnalysis.sceneSetting != null ||
          trustedAnalysis.componentFamilies.includes("background")
        );
      const qualifiesAsTrustedStillSubject =
        trustedAnalysis.requestKind === "single-frame" &&
        trustedAnalysis.outputMode === "still" &&
        trustedAnalysis.shapeConfidence === "grounded-local" &&
        trustedAnalysis.humanExpectationRisk !== "high" &&
        (
          trustedAnalysis.primaryFamily === "object" ||
          trustedAnalysis.primaryFamily === "character"
        );
      const qualifiesAsTrustedCharacterAction =
        trustedAnalysis.outputMode === "animation" &&
        trustedAnalysis.subjects.some((subject) => subject.type === "character" || subject.type === "object") &&
        (
          trustedAnalysis.motionType !== "unknown" ||
          trustedAnalysis.actionKeywords.length > 0 ||
          trustedAnalysis.concepts.some((concept) =>
            ["punch", "kick", "walking", "running", "fighting-stance"].includes(concept),
          )
        );
      const qualifiesAsTrustedContinuationEdit =
        anchoredContinuationEdit &&
        (
          trustedAnalysis.editIntents.length > 0 ||
          trustedAnalysis.motionType !== "unknown" ||
          trustedAnalysis.focusTargets.length > 0
        );

      if (
        !qualifiesAsTrustedEvent &&
        !qualifiesAsTrustedEffectAnimation &&
        !qualifiesAsTrustedStillScene &&
        !qualifiesAsTrustedStillSubject &&
        !qualifiesAsTrustedCharacterAction &&
        !qualifiesAsTrustedContinuationEdit
      ) {
        return null;
      }

      const frames = clampFrameDraftsToRequest(
        trustedDrafts
          .map((frame) => ({
            pose: frame.pose.trim(),
            description: frame.description.trim(),
          }))
          .filter((frame) => frame.pose.length > 0 || frame.description.length > 0),
        trustedAnalysis.requestedFrameCount,
        "Generate Frames trusted deterministic runtime",
      );

      if (frames.length === 0) {
        return null;
      }

      return {
        requestKind: trustedAnalysis.requestKind,
        requestedFrameCount: trustedAnalysis.requestedFrameCount,
        workspaceIntent: buildGeneratedFrameWorkspaceIntent({
          userPrompt: trustedPrompt,
          requestKind: trustedAnalysis.requestKind,
          workspaceContextValue,
          runtimeAnalysis: trustedAnalysis,
        }),
        frames,
        ...buildGeneratedFrameQualityContracts(trustedAnalysis),
      };
    };
    const shouldPreferDeterministicRuntimePlan = ({
      analysis,
      structuredFrames,
      deterministicPlan,
    }: {
      analysis: GenerateFramesRuntimeAnalysis | null;
      structuredFrames: Array<{ pose: string; description: string }>;
      deterministicPlan: DrawingAiResponse["generatedFramePlan"] | null;
    }) => {
      if (analysis == null || deterministicPlan == null || structuredFrames.length === 0) {
        return false;
      }

      const normalizedFrames = structuredFrames.map((frame) => `${frame.pose} ${frame.description}`.toLowerCase());
      const firstFrame = normalizedFrames[0] ?? "";
      const lastFrames = normalizedFrames.slice(-Math.max(2, Math.ceil(normalizedFrames.length / 3))).join(" ");
      const lastFrame = normalizedFrames.at(-1) ?? "";
      const hasSetupCue = /\b(setup|anticipation|wind[- ]?up|charge|crouch|ready|neutral|balanced|planted)\b/.test(firstFrame);
      const hasRecoveryCue = /\b(recovery|recover|recoil|settle|balanced|reset)\b/.test(lastFrames);

      if (analysis.requestKind === "single-frame" && analysis.outputMode === "still") {
        return /\b(run(?:ning)?|walk(?:ing)?|jump(?:ing)?|kick(?:ing)?|punch(?:ing)?|fight(?:ing)?)\b/.test(firstFrame);
      }

      if (analysis.motionType === "lightning") {
        return (
          !/\b(fade|vanish|collapse|afterglow|disappear|ghost)\b/.test(lastFrames) ||
          !/\b(fade|vanish|collapse|afterglow|disappear|ghost)\b/.test(lastFrame)
        );
      }

      if (analysis.motionType === "explosion") {
        return !/\b(breakup|smoke|aftermath|disintegrat|fade|residue|embers)\b/.test(lastFrames);
      }

      if (analysis.motionType === "smoke") {
        return !/\b(dissipat|fade|thin|settle|haze)\b/.test(lastFrames);
      }

      const stagedSequenceDemand =
        analysis.outputMode === "animation" &&
        /\b(combo|multi-step|right hand|left hand|airborne|midair|mid-air|martial arts guard stance|guard stance)\b|->|→|\bthen\b|\bafter that\b|\bfollowed by\b|\bending in\b|\bending with\b|\bends in\b|\bends with\b/i.test(
          analysis.prompt,
        );
      if (stagedSequenceDemand) {
        if (/\bright hand\b/i.test(analysis.prompt) && !/\bright\b/.test(normalizedFrames.join(" "))) {
          return true;
        }
        if (/\bleft hand\b/i.test(analysis.prompt) && !/\bleft\b/.test(normalizedFrames.join(" "))) {
          return true;
        }
        if (/\b(fireball|projectile|orb|blast)\b/i.test(analysis.prompt) && !/\b(fireball|projectile|orb|blast)\b/.test(normalizedFrames.join(" "))) {
          return true;
        }
        if (/\b(jump|leap|vault)\b/i.test(analysis.prompt) && !/\b(jump|launch|airborne|leap|vault)\b/.test(normalizedFrames.join(" "))) {
          return true;
        }
        if (/\bspin(?:ning)?\b/i.test(analysis.prompt) && !/\b(spin|turn|tornado)\b/.test(normalizedFrames.join(" "))) {
          return true;
        }
        if (
          /\b(martial arts guard stance|guard stance|ready stance|landing|land)\b/i.test(analysis.prompt) &&
          !/\b(landing|land|guard|stance|recover|recovery|settle)\b/.test(lastFrames)
        ) {
          return true;
        }
      }

      if (
        analysis.actionKeywords.some((keyword) => ["punch", "kick", "jump", "walk", "run"].includes(keyword)) ||
        analysis.motionType === "fight"
      ) {
        return !hasSetupCue || !hasRecoveryCue;
      }

      return false;
    };
    const buildSafeGenerateFramesFallback = (
      userPrompt: string,
      runtimeAnalysis: GenerateFramesRuntimeAnalysis | null = null,
    ) => {
      const normalizedPrompt = userPrompt.trim();
      const analysis =
        runtimeAnalysis ??
        augmentGenerateFramesContinuationAnalysis({
          baseAnalysis: analyzeGenerateFramesRequest({
            userMessage: normalizedPrompt,
            conversationHistory,
            workspaceContext,
            generateFramesState,
            projectAiMemory,
          }),
          workspaceContextValue: workspaceContext,
        });
      const deterministicDrafts =
        normalizedPrompt.length > 0
          ? buildGenerateFramesDeterministicDrafts({
              analysis,
              workspaceContext,
            })
          : null;
      const generatedFramePlan =
        deterministicDrafts && deterministicDrafts.length > 0
          ? buildSafeGeneratedFramePlan({
              userPrompt: normalizedPrompt,
              existingFrames: deterministicDrafts,
              workspaceContextValue: workspaceContext,
              runtimeAnalysis: analysis,
            })
          : null;
      const trustedDeterministicRuntimePlan =
        generatedFramePlan == null
          ? buildTrustedDeterministicRuntimePlan({
              userPrompt: normalizedPrompt,
              analysis,
              deterministicDrafts,
              workspaceContextValue: workspaceContext,
            })
          : null;
      const explosionEmergencyRuntimePlan =
        generatedFramePlan == null &&
        trustedDeterministicRuntimePlan == null &&
        deterministicDrafts != null &&
        deterministicDrafts.length > 0 &&
        (
          analysis.motionType === "explosion" ||
          analysis.concepts.includes("explosion") ||
          /\b(explosion|explode|blast|detonation|fireball)\b/i.test(normalizedPrompt)
        ) &&
        (analysis.outputMode === "animation" || /\b(explosion|explode|blast|detonation|fireball)\b/i.test(normalizedPrompt)) &&
        (
          analysis.primaryFamily === "effect" ||
          analysis.componentFamilies.includes("effect") ||
          /\b(explosion|explode|blast|detonation|fireball)\b/i.test(normalizedPrompt)
        ) &&
        !analysis.componentFamilies.includes("character")
          ? {
              requestKind: analysis.requestKind,
              requestedFrameCount: analysis.requestedFrameCount,
              workspaceIntent: buildGeneratedFrameWorkspaceIntent({
                userPrompt: normalizedPrompt,
                requestKind: analysis.requestKind,
                workspaceContextValue: workspaceContext,
                runtimeAnalysis: analysis,
              }),
              frames: clampFrameDraftsToRequest(
                deterministicDrafts
                  .map((frame) => ({
                    pose: frame.pose.trim(),
                    description: frame.description.trim(),
                  }))
                  .filter((frame) => frame.pose.length > 0 || frame.description.length > 0),
                analysis.requestedFrameCount,
                "Generate Frames explosion emergency runtime",
              ),
              ...buildGeneratedFrameQualityContracts(analysis),
            }
          : null;
      const lightningEmergencyRuntimePlan =
        generatedFramePlan == null &&
        trustedDeterministicRuntimePlan == null &&
        deterministicDrafts != null &&
        deterministicDrafts.length > 0 &&
        (
          analysis.motionType === "lightning" ||
          analysis.concepts.includes("lightning") ||
          /\b(lightning|bolt|lightning strike)\b/i.test(normalizedPrompt)
        ) &&
        (analysis.outputMode === "animation" || /\b(lightning|bolt|lightning strike)\b/i.test(normalizedPrompt))
          ? {
              requestKind: analysis.requestKind,
              requestedFrameCount: analysis.requestedFrameCount,
              workspaceIntent: buildGeneratedFrameWorkspaceIntent({
                userPrompt: normalizedPrompt,
                requestKind: analysis.requestKind,
                workspaceContextValue: workspaceContext,
                runtimeAnalysis: analysis,
              }),
              frames: clampFrameDraftsToRequest(
                deterministicDrafts
                  .map((frame) => ({
                    pose: frame.pose.trim(),
                    description: frame.description.trim(),
                  }))
                  .filter((frame) => frame.pose.length > 0 || frame.description.length > 0),
                analysis.requestedFrameCount,
                "Generate Frames lightning emergency runtime",
              ),
              ...buildGeneratedFrameQualityContracts(analysis),
            }
          : null;
      const finalGeneratedFramePlan =
        explosionEmergencyRuntimePlan && explosionEmergencyRuntimePlan.frames.length > 0
          ? explosionEmergencyRuntimePlan
          : lightningEmergencyRuntimePlan && lightningEmergencyRuntimePlan.frames.length > 0
          ? lightningEmergencyRuntimePlan
          : trustedDeterministicRuntimePlan && trustedDeterministicRuntimePlan.frames.length > 0
          ? trustedDeterministicRuntimePlan
          : generatedFramePlan;
      const usedDeterministicPlan = finalGeneratedFramePlan != null;
      return {
        output: buildGenerateFramesFallbackOutput({
          analysis,
          usedDeterministicPlan,
        }),
        followUpMode: "none" as const,
        followUpQuestion: null,
        followUpMultiSelect: null,
        followUpOptions: null,
        questionCardKind: null,
        generatedFramePlan: finalGeneratedFramePlan,
        warnings: [
          ...warnings,
          ...(trustedDeterministicRuntimePlan && generatedFramePlan == null
            ? [
                "Generate Frames used the trusted deterministic runtime plan after the stricter validator rejected a still-coherent search-grounded draft.",
              ]
            : []),
          ...(explosionEmergencyRuntimePlan && generatedFramePlan == null && trustedDeterministicRuntimePlan == null
            ? [
                "Generate Frames reused the strengthened deterministic explosion arc after weaker explosion drafts were rejected, instead of collapsing to a compact pop-style substitute.",
              ]
            : []),
          ...(lightningEmergencyRuntimePlan && generatedFramePlan == null && trustedDeterministicRuntimePlan == null
            ? [
                "Generate Frames reused the strengthened deterministic lightning strike after stricter validation rejected the first local draft, instead of returning no plan for a familiar lightning request.",
              ]
            : []),
          ...(analysis.noPlanReason && isGenerateFramesHardNoPlanBlocker(analysis) ? [analysis.noPlanReason] : []),
          usedDeterministicPlan
            ? "Generate Frames runtime fallback rebuilt the plan from family classification, human expectation defaults, and anti-drift guards."
            : isGenerateFramesHardNoPlanBlocker(analysis)
              ? "Generate Frames stayed blocked because the prompt is not an immediate allowed generation request."
              : "Generate Frames could not defend a reliable plan from the prompt, so it returned no plan instead of guessing.",
        ],
      };
    };
    if (
      effectiveTaskType === "generate-plans" &&
      isGeneratePlansFollowUpContinuation &&
      activeFollowUp !== null &&
      !resolvedGeneratePlansFollowUpState.parseSucceeded
    ) {
      return respondJson(
        createPipelineResponseBody(
          {
            output: buildNaturalGeneratePlansReaskLeadIn(generatePlansFollowUpInteractionKind),
            mode: "chat",
            taskType: effectiveTaskType,
            reasoningLevel,
            searchUsed: false,
            warnings,
            preReply: null,
            guidedPlanning: buildGeneratePlansGuidedPlanningState(
              generatePlansContinuationSceneType as DrawingAiGuidedPlanningSceneType,
              "questioning",
            ),
            followUpMode: "question-box",
            followUpQuestion: activeFollowUp.question,
            followUpMultiSelect: activeFollowUp.followUpMultiSelect === true,
            followUpOptions: activeFollowUp.followUpOptions ?? null,
            actionPlan: null,
          },
          "generate-plans-follow-up-reask",
          buildGeneratePlansExecutionSummary({
            prompt,
            followUpMode: "question-box",
          }),
        ),
      );
    }

    if (taskIntentClassification.kind !== "task") {
      const routingQuestion = buildOtherRoutingQuestion(prompt);
      return respondJson(
        createPipelineResponseBody(
          {
            output: routingQuestion,
            mode: "chat",
            taskType: "other",
            reasoningLevel,
            searchUsed: false,
            warnings,
            preReply: null,
            guidedPlanning: null,
            questionCardKind: null,
            followUpMode: "question-box",
            followUpQuestion: routingQuestion,
            followUpMultiSelect: false,
            followUpOptions: null,
            soundOptions: null,
            actionPlan: null,
          },
          "non-task-routing-question",
          buildOtherExecutionSummary({
            prompt,
            actionPlan: null,
          }),
          {
            intentKindOverride: "task",
          },
        ),
      );
    }
    const generatePlansAnalysisInput =
      effectiveTaskType === "generate-plans"
        ? buildGeneratePlansAnalysisInput({
            userMessage: prompt,
            conversationHistory,
            followUpMemory: resolvedGeneratePlansFollowUpMemory,
          })
        : prompt;
    const otherAnalysisInput =
      effectiveTaskType === "other"
        ? buildOtherTaskAnalysisInput({
            userMessage: prompt,
            conversationHistory,
          })
        : prompt;
    const generateFramesAnalysisInput =
      effectiveTaskType === "generate-frames"
        ? buildGenerateFramesTrainingAnalysisInput({
            userMessage: prompt,
            conversationHistory,
          })
        : prompt;
    generateFramesRuntimeAnalysis =
      effectiveTaskType === "generate-frames"
        ? augmentGenerateFramesContinuationAnalysis({
            baseAnalysis: analyzeGenerateFramesRequest({
              userMessage: prompt,
              conversationHistory,
              workspaceContext,
              generateFramesState,
              projectAiMemory,
            }),
            workspaceContextValue: workspaceContext,
          })
        : null;
    if (effectiveTaskType === "generate-frames" && generateFramesRuntimeAnalysis) {
      searchDecision = buildGenerateFramesSearchDecision({
        userMessage: prompt,
        analysis: generateFramesRuntimeAnalysis,
        requestedSearch,
      });
      if (
        generateFramesRuntimeAnalysis.executionReadiness === "ask-clarify" &&
        (generateFramesRuntimeAnalysis.thinkingSystem.clarifyingQuestion ??
          generateFramesRuntimeAnalysis.questionGate.blocker)
      ) {
        const clarifyingQuestion =
          generateFramesRuntimeAnalysis.thinkingSystem.clarifyingQuestion ??
          generateFramesRuntimeAnalysis.questionGate.blocker ??
          "Which missing detail should I lock before generating frames?";
        const responseBody = createPipelineResponseBody({
          output: "",
          mode: "chat",
          taskType: effectiveTaskType,
          reasoningLevel,
          searchUsed: false,
          warnings: [
            ...warnings,
            generateFramesRuntimeAnalysis.executionReadinessReason ??
              "Generate Frames paused for one narrow clarification instead of guessing.",
          ],
          preReply: null,
          guidedPlanning: null,
          questionCardKind: "drawing",
          followUpMode: "question-box",
          followUpQuestion: clarifyingQuestion,
          followUpMultiSelect: false,
          followUpOptions: null,
          generatedFramePlan: null,
          soundOptions: null,
          actionPlan: null,
        }, "generate-frames-thinking-question",
        buildGenerateFramesExecutionSummary({
          prompt,
          response: "",
          followUpMode: "question-box",
          workspaceContext,
          generatedFrameCount: null,
        }));

        return respondJson(responseBody);
      }

      if (generateFramesRuntimeAnalysis.executionReadiness === "controlled-fail") {
        const controlledFailureReason =
          generateFramesRuntimeAnalysis.executionReadinessReason ??
          generateFramesRuntimeAnalysis.noPlanReason ??
          "Generate Frames could not execute this request safely enough to avoid guessing.";
        const responseBody = createPipelineResponseBody({
          output: controlledFailureReason,
          mode: "chat",
          taskType: effectiveTaskType,
          reasoningLevel,
          searchUsed: false,
          warnings: [...warnings, controlledFailureReason],
          preReply: null,
          guidedPlanning: null,
          questionCardKind: null,
          followUpMode: "none",
          followUpQuestion: null,
          followUpMultiSelect: null,
          followUpOptions: null,
          generatedFramePlan: null,
          soundOptions: null,
          actionPlan: null,
        }, "generate-frames-thinking-controlled-fail",
        buildGenerateFramesExecutionSummary({
          prompt,
          response: controlledFailureReason,
          followUpMode: "none",
          workspaceContext,
          generatedFrameCount: null,
        }));

        return respondJson(responseBody);
      }
    }
    const generateSoundAnalysisInput =
      effectiveTaskType === "generate-sounds"
        ? buildGenerateSoundTrainingAnalysisInput({
            userMessage: prompt,
            conversationHistory,
          })
        : prompt;
    const otherTrainingExamples =
      effectiveTaskType === "other"
        ? await getRelevantOtherExamples({
            userMessage: prompt,
            analysisInput: otherAnalysisInput,
            limit: 6,
          })
        : [];
    const generatePlansTrainingExamples =
      effectiveTaskType === "generate-plans"
        ? await getRelevantExamples({
            userMessage: prompt,
            analysisInput: generatePlansAnalysisInput,
            limit: 6,
          })
        : [];
    const generateFramesTrainingExamples =
      effectiveTaskType === "generate-frames"
        ? await getRelevantGenerateFramesExamples({
            userMessage: prompt,
            analysisInput: generateFramesAnalysisInput,
            limit: 4,
            runtimeAnalysis: generateFramesRuntimeAnalysis ?? undefined,
          })
        : [];
    const generateSoundTrainingExamples =
      effectiveTaskType === "generate-sounds"
        ? await getRelevantGenerateSoundExamples({
            userMessage: prompt,
            analysisInput: generateSoundAnalysisInput,
            limit: 6,
          })
        : [];
    const generatePlansAnalysis =
      effectiveTaskType === "generate-plans"
        ? await analyzeGeneratePlansRequest({
            analysisInput: generatePlansAnalysisInput,
            userMessage: prompt,
            followUpMemory: resolvedGeneratePlansFollowUpMemory,
            recentlyAnsweredQuestion:
              isGeneratePlansFollowUpContinuation && activeFollowUp !== null
                ? activeFollowUp.question
                : null,
            reasoningEffort: reasoningProfile.reasoningEffort,
            trainingExamples: generatePlansTrainingExamples,
          })
        : null;
    generatePlansContinuationSceneType = generatePlansAnalysis?.sceneType ?? "unknown";
    let searchResults: InternetSearchResult[] = [];
    let generateFramesSearchCoverage:
      | ReturnType<typeof assessGenerateFramesSearchCoverage>
      | null = null;

    if (searchDecision.shouldSearch) {
      try {
        if (effectiveTaskType === "generate-frames" && generateFramesRuntimeAnalysis) {
          const groundedSearch = await searchGenerateFramesUntilGrounded({
            prompt,
            analysis: generateFramesRuntimeAnalysis,
            searchDecision,
            maxResults: reasoningProfile.maxSearchResults,
          });
          searchResults = groundedSearch.searchResults;
          generateFramesSearchCoverage = groundedSearch.coverage;
        } else {
          const searchQueries = searchDecision.queries?.length ? searchDecision.queries : [searchDecision.query ?? prompt];
          searchResults = await searchInternetQueries(searchQueries, reasoningProfile.maxSearchResults);
        }
        if (searchResults.length === 0) {
          warnings.push("Internet search did not return usable results, so the answer was generated without reference data.");
        }
      } catch (error) {
        warnings.push("Internet search failed, so the answer was generated without reference data.");
        console.warn("Internet search integration failed; continuing without search results.", error);
      }
    }

    if (
      effectiveTaskType === "generate-frames" &&
      generateFramesRuntimeAnalysis?.executionReadiness === "ready-search" &&
      (
        searchResults.length === 0 ||
        (generateFramesSearchCoverage != null && !generateFramesSearchCoverage.enough)
      )
    ) {
      const missingKnowledge =
        generateFramesSearchCoverage?.missingKnowledge.length
          ? ` Missing knowledge: ${generateFramesSearchCoverage.missingKnowledge.join(", ")}.`
          : "";
      const controlledFailureReason =
        generateFramesRuntimeAnalysis.executionReadinessReason != null
          ? `${generateFramesRuntimeAnalysis.executionReadinessReason} Search did not resolve the blocker safely enough to continue without guessing.${missingKnowledge}`
          : `Generate Frames required targeted external grounding, but search did not resolve the blocker safely enough to continue without guessing.${missingKnowledge}`;
      const responseBody = createPipelineResponseBody({
        output: controlledFailureReason,
        mode: "chat",
        taskType: effectiveTaskType,
        reasoningLevel,
        searchUsed: searchResults.length > 0,
        warnings: [...warnings, controlledFailureReason],
        preReply: null,
        guidedPlanning: null,
        questionCardKind: null,
        followUpMode: "none",
        followUpQuestion: null,
        followUpMultiSelect: null,
        followUpOptions: null,
        generatedFramePlan: null,
        soundOptions: null,
        actionPlan: null,
      }, "generate-frames-search-controlled-fail",
      buildGenerateFramesExecutionSummary({
        prompt,
        response: controlledFailureReason,
        followUpMode: "none",
        workspaceContext,
        generatedFrameCount: null,
      }));

      return respondJson(responseBody);
    }

    if (effectiveTaskType === "generate-plans" && generatePlansAnalysis?.needsClarification) {
      if (generatePlansAnalysis.clarificationMode === "question-box") {
        console.info("Generate Plans follow-up question generated.", {
          sceneType: generatePlansAnalysis.sceneType,
          missingCreativeLocks: generatePlansAnalysis.missingCreativeLocks,
          question: generatePlansAnalysis.followUpQuestion,
          options: generatePlansAnalysis.followUpOptions,
          questionPriorityReason: generatePlansAnalysis.questionPriorityReason,
        });
      }
      generatePlansGuidedPlanningStatus = "questioning";
      const normalizedFollowUpMultiSelect =
        generatePlansAnalysis.clarificationMode === "question-box"
          ? generatePlansAnalysis.followUpMultiSelect
          : null;
      const responseBody = createPipelineResponseBody({
        output: buildGeneratePlansFollowUpReply(generatePlansAnalysis),
        mode: "chat",
        taskType: effectiveTaskType,
        reasoningLevel,
        searchUsed: searchResults.length > 0,
        warnings,
        preReply: null,
        guidedPlanning: buildGeneratePlansGuidedPlanningState(
          generatePlansAnalysis.sceneType,
          "questioning",
        ),
        followUpMode:
          generatePlansAnalysis.clarificationMode === "question-box" ? "question-box" : "none",
        followUpQuestion:
          generatePlansAnalysis.clarificationMode === "question-box"
            ? generatePlansAnalysis.followUpQuestion
            : null,
        followUpMultiSelect: normalizedFollowUpMultiSelect,
        followUpOptions:
          generatePlansAnalysis.clarificationMode === "question-box"
            ? generatePlansAnalysis.followUpOptions
            : null,
        actionPlan: null,
      }, "generate-plans-follow-up",
      buildGeneratePlansExecutionSummary({
        prompt,
        followUpMode:
          generatePlansAnalysis.clarificationMode === "question-box" ? "question-box" : "none",
      }));

      return respondJson(responseBody);
    }

    if (effectiveTaskType === "generate-plans" && generatePlansAnalysis && !generatePlansAnalysis.needsClarification) {
      generatePlansGuidedPlanningStatus = "ready-to-plan";
    }

    const taskPrompt = buildTaskPrompt({
      taskType: effectiveTaskType,
      userMessage: prompt,
      conversationHistory,
      followUpMemory: resolvedGeneratePlansFollowUpMemory,
      workspaceContext,
      projectAiMemory,
      searchResults,
      generatePlansAnalysis: generatePlansAnalysis ?? undefined,
      otherTrainingExamples: otherTrainingExamples.length > 0 ? otherTrainingExamples : undefined,
      generatePlansTrainingExamples: generatePlansTrainingExamples.length > 0 ? generatePlansTrainingExamples : undefined,
      generateFramesTrainingExamples:
        generateFramesTrainingExamples.length > 0 ? generateFramesTrainingExamples : undefined,
      generateFramesRuntimeAnalysis: generateFramesRuntimeAnalysis ?? undefined,
      generateSoundTrainingExamples:
        generateSoundTrainingExamples.length > 0 ? generateSoundTrainingExamples : undefined,
    });
    const systemInstructions = buildDrawingAiSystemInstructions({
      taskType: effectiveTaskType,
      reasoningInstruction: reasoningProfile.promptInstruction,
    });

    if (effectiveTaskType === "generate-frames") {
      const directRuntimeDrafts =
        generateFramesRuntimeAnalysis != null
          ? buildGenerateFramesDeterministicDrafts({
              analysis: generateFramesRuntimeAnalysis,
              workspaceContext,
            })
          : null;
      const candidateDirectRuntimePlan =
        generateFramesRuntimeAnalysis != null
          ? buildSafeGeneratedFramePlan({
              userPrompt: prompt,
              existingFrames: directRuntimeDrafts ?? [],
              workspaceContextValue: workspaceContext,
              runtimeAnalysis: generateFramesRuntimeAnalysis,
            })
          : null;
      const candidateTrustedDeterministicRuntimePlan =
        generateFramesRuntimeAnalysis != null && candidateDirectRuntimePlan == null
          ? buildTrustedDeterministicRuntimePlan({
              userPrompt: prompt,
              analysis: generateFramesRuntimeAnalysis,
              deterministicDrafts: directRuntimeDrafts,
              workspaceContextValue: workspaceContext,
            })
          : null;
      const candidateResolvedDeterministicRuntimePlan =
        candidateDirectRuntimePlan ?? candidateTrustedDeterministicRuntimePlan;
      const runtimeBackedSearchCoverage =
        generateFramesRuntimeAnalysis != null
          ? assessGenerateFramesSearchCoverage({
              analysis: generateFramesRuntimeAnalysis,
              searchResults,
              localDrafts: directRuntimeDrafts ?? [],
            })
          : generateFramesSearchCoverage;
      if (
        searchResults.length > 0 &&
        runtimeBackedSearchCoverage != null &&
        !runtimeBackedSearchCoverage.enough
      ) {
        warnings.push(
          `Generate Frames search remained partially under-informed after iterative lookup. Missing: ${runtimeBackedSearchCoverage.missingKnowledge.join(", ")}.`,
        );
      }
      const lacksStrongLocalStillThingTemplate =
        generateFramesRuntimeAnalysis?.interactionMode === "create" &&
        generateFramesRuntimeAnalysis.visualKind === "thing" &&
        generateFramesRuntimeAnalysis.outputMode === "still" &&
        generateFramesRuntimeAnalysis.promptSubject != null &&
        generateFramesRuntimeAnalysis.concepts.length === 0;
      const hasSafeStillSceneRuntimeAfterSearch =
        searchDecision?.shouldSearch === true &&
        generateFramesRuntimeAnalysis?.interactionMode === "create" &&
        generateFramesRuntimeAnalysis.requestKind === "single-frame" &&
        generateFramesRuntimeAnalysis.outputMode === "still" &&
        directRuntimeDrafts != null &&
        directRuntimeDrafts.length > 0 &&
        (
          generateFramesRuntimeAnalysis.visualKind === "scene" ||
          generateFramesRuntimeAnalysis.sceneSetting != null ||
          generateFramesRuntimeAnalysis.componentFamilies.includes("background")
        );
      const onlyMissingSceneStaging =
        runtimeBackedSearchCoverage != null &&
        runtimeBackedSearchCoverage.missingKnowledge.length > 0 &&
        runtimeBackedSearchCoverage.missingKnowledge.every((knowledgeGap) => knowledgeGap === "scene-staging");
      const hasSafeActionOrEffectRuntimeAfterSearch =
        searchDecision?.shouldSearch === true &&
        generateFramesRuntimeAnalysis?.interactionMode === "create" &&
        generateFramesRuntimeAnalysis.outputMode === "animation" &&
        directRuntimeDrafts != null &&
        directRuntimeDrafts.length > 0 &&
        onlyMissingSceneStaging &&
        (
          generateFramesRuntimeAnalysis.primaryFamily === "effect" ||
          generateFramesRuntimeAnalysis.motionType !== "unknown" ||
          generateFramesRuntimeAnalysis.actionKeywords.some((keyword) =>
            ["punch", "kick", "walk", "run", "jump", "lightning", "explode", "smoke", "impact", "erupt"].includes(keyword),
          )
        );
      const hasGroundedDirectRuntimeAfterSearch =
        (
          searchDecision?.shouldSearch === true &&
          runtimeBackedSearchCoverage?.enough === true &&
          directRuntimeDrafts != null &&
          directRuntimeDrafts.length > 0
        ) ||
        hasSafeStillSceneRuntimeAfterSearch ||
        hasSafeActionOrEffectRuntimeAfterSearch;
      const shouldBypassDirectRuntimeForSearchEnrichment =
        searchDecision?.shouldSearch === true &&
        generateFramesRuntimeAnalysis?.interactionMode === "create" &&
        !hasGroundedDirectRuntimeAfterSearch &&
        (
          generateFramesRuntimeAnalysis.outputMode === "animation" ||
          generateFramesRuntimeAnalysis.visualKind !== "thing" ||
          lacksStrongLocalStillThingTemplate ||
          directRuntimeDrafts == null ||
          directRuntimeDrafts.length === 0
        );
      const shouldPreferStructuredPassOverDirectRuntime =
        generateFramesRuntimeAnalysis != null &&
        shouldPreferStructuredGenerateFramesPass({
          analysis: generateFramesRuntimeAnalysis,
          promptValue: prompt,
          workspaceContextValue: workspaceContext,
        });
      const shouldForceTrustedDeterministicRuntimePlan =
        generateFramesRuntimeAnalysis != null &&
        candidateResolvedDeterministicRuntimePlan != null &&
        !isGenerateFramesHardNoPlanBlocker(generateFramesRuntimeAnalysis) &&
        generateFramesRuntimeAnalysis.questionGate.shouldProceedWithoutQuestion &&
        !FRAME_REFERENCE_REQUEST_PATTERN.test(prompt) &&
        searchDecision?.shouldSearch !== true &&
        generateFramesRuntimeAnalysis.expectationCoverage !== "needs-reference" &&
        generateFramesRuntimeAnalysis.shapeConfidence !== "needs-reference" &&
        (() => {
          const visibleSubjectCount = generateFramesRuntimeAnalysis.subjects.filter(
            (subject) => subject.type === "character" || subject.type === "object",
          ).length;
          const sceneComplexity =
            (generateFramesRuntimeAnalysis.sceneSetting != null ? 1 : 0) +
            generateFramesRuntimeAnalysis.sceneProps.length +
            generateFramesRuntimeAnalysis.sceneElements.length;
          const qualityFamily = generateFramesRuntimeAnalysis.renderingQualityProfile.family;

          if (
            generateFramesRuntimeAnalysis.projectScope === "same-project" &&
            generateFramesRuntimeAnalysis.shotScope !== "create-first-shot"
          ) {
            return true;
          }

          if (
            generateFramesRuntimeAnalysis.outputMode === "still" &&
            generateFramesRuntimeAnalysis.requestedFrameCount <= 1 &&
            sceneComplexity <= 1 &&
            ["character", "generic-object", "background"].includes(qualityFamily)
          ) {
            return true;
          }

          return (
            generateFramesRuntimeAnalysis.outputMode === "animation" &&
            generateFramesRuntimeAnalysis.requestedFrameCount <= 12 &&
            generateFramesRuntimeAnalysis.orderedBeats.length < 3 &&
            sceneComplexity <= 1 &&
            (
              qualityFamily === "explosion" ||
              qualityFamily === "lightning" ||
              qualityFamily === "breathing" ||
              qualityFamily === "background-scroll" ||
              (
                (qualityFamily === "combat" ||
                  generateFramesRuntimeAnalysis.motionType === "walk" ||
                  generateFramesRuntimeAnalysis.motionType === "run") &&
                visibleSubjectCount <= 1
              )
            )
          );
        })();

      if (
        generateFramesRuntimeAnalysis &&
        (
          shouldForceTrustedDeterministicRuntimePlan ||
          (
            !shouldPreferStructuredPassOverDirectRuntime &&
            !shouldBypassDirectRuntimeForSearchEnrichment &&
            shouldUsePrimaryGenerateFramesRuntime({
              analysis: generateFramesRuntimeAnalysis,
              promptValue: prompt,
              deterministicDrafts: directRuntimeDrafts,
              workspaceContextValue: workspaceContext,
            })
          )
        )
      ) {
        const resolvedDirectRuntimePlan = candidateResolvedDeterministicRuntimePlan;

        if (resolvedDirectRuntimePlan) {
          const responseBody = createPipelineResponseBody({
            output: "",
            mode: "chat",
            taskType: effectiveTaskType,
            reasoningLevel,
            searchUsed: searchResults.length > 0,
            warnings,
            preReply: null,
            guidedPlanning: null,
            questionCardKind: null,
            followUpMode: "none",
            followUpQuestion: null,
            followUpMultiSelect: null,
            followUpOptions: null,
            generatedFramePlan: resolvedDirectRuntimePlan,
            soundOptions: null,
            actionPlan: null,
          }, "generate-frames-direct-runtime",
          buildGenerateFramesExecutionSummary({
            prompt,
            response: "",
            followUpMode: "none",
            workspaceContext,
            generatedFrameCount: resolvedDirectRuntimePlan.frames.length,
          }));

          return respondJson(responseBody);
        }
      }

      let structuredFramesResponse;
      try {
        structuredFramesResponse = await generateGenerateFramesStructuredResponse({
          taskPrompt,
          systemInstructions,
          userMessage: prompt,
          runtimeAnalysis: generateFramesRuntimeAnalysis ?? undefined,
          reasoningEffort: reasoningProfile.reasoningEffort,
        });
        generateFramesModelSwitchLog = structuredFramesResponse.modelSelection ?? null;
      } catch (error) {
        console.warn("Generate Frames structured response failed.", {
          prompt,
          error,
        });
        const structuredFailureReason = error instanceof Error ? error.message : "Unknown structured generation failure.";
        const allowDeterministicFallback = shouldAllowDeterministicFallbackAfterStructuredFailure({
          analysis: generateFramesRuntimeAnalysis,
          promptValue: prompt,
          workspaceContextValue: workspaceContext,
          structuredSucceeded: false,
        });

        if (!allowDeterministicFallback) {
          const responseBody = createPipelineResponseBody({
            output: "",
            mode: "chat",
            taskType: effectiveTaskType,
            reasoningLevel,
            searchUsed: searchResults.length > 0,
            warnings: [
              ...warnings,
              `Generate Frames structured generation failed before validation: ${structuredFailureReason}`,
              "Generate Frames blocked deterministic fallback because this prompt is high-complexity and needs a stronger structured answer instead of a cheap local substitute.",
            ],
            preReply: null,
            guidedPlanning: null,
            questionCardKind: null,
            followUpMode: "none",
            followUpQuestion: null,
            followUpMultiSelect: null,
            followUpOptions: null,
            generatedFramePlan: null,
            soundOptions: null,
            actionPlan: null,
          }, "generate-frames-structured-failure-no-local-fallback",
          buildGenerateFramesExecutionSummary({
            prompt,
            response: "",
            followUpMode: "none",
            workspaceContext,
            generatedFrameCount: null,
            safeFallbackUsed: true,
          }));

          return respondJson(responseBody);
        }

        const fallbackResponse = buildSafeGenerateFramesFallback(prompt, generateFramesRuntimeAnalysis);
        const responseBody = createPipelineResponseBody({
          output: fallbackResponse.output,
          mode: "chat",
          taskType: effectiveTaskType,
          reasoningLevel,
          searchUsed: searchResults.length > 0,
          warnings: [
            ...fallbackResponse.warnings,
            `Generate Frames structured generation failed before validation: ${structuredFailureReason}`,
          ],
          preReply: null,
          guidedPlanning: null,
          questionCardKind: fallbackResponse.questionCardKind,
          followUpMode: fallbackResponse.followUpMode,
          followUpQuestion: fallbackResponse.followUpQuestion,
          followUpMultiSelect: fallbackResponse.followUpMultiSelect,
          followUpOptions: fallbackResponse.followUpOptions,
          generatedFramePlan: fallbackResponse.generatedFramePlan,
          soundOptions: null,
          actionPlan: null,
        }, "generate-frames-safe-fallback",
        buildGenerateFramesExecutionSummary({
          prompt,
          response: fallbackResponse.output,
          followUpMode: fallbackResponse.followUpMode,
          workspaceContext,
          generatedFrameCount: fallbackResponse.generatedFramePlan?.frames.length ?? null,
          safeFallbackUsed: fallbackResponse.generatedFramePlan == null,
        }));

        return respondJson(responseBody);
      }

      if (structuredFramesResponse.decision === "question" && structuredFramesResponse.question.trim().length > 0) {
        const questionDecision = isGenerateFramesQuestionAllowed({
          analysis:
            generateFramesRuntimeAnalysis ??
            analyzeGenerateFramesRequest({
              userMessage: prompt,
              conversationHistory,
              workspaceContext,
              generateFramesState,
              projectAiMemory,
            }),
          question: structuredFramesResponse.question,
        });

        if (!questionDecision.allowed) {
          const fallbackResponse = buildSafeGenerateFramesFallback(prompt, generateFramesRuntimeAnalysis);
          const responseBody = createPipelineResponseBody({
            output: fallbackResponse.output,
            mode: "chat",
            taskType: effectiveTaskType,
            reasoningLevel,
            searchUsed: searchResults.length > 0,
            warnings: [
              ...fallbackResponse.warnings,
              `Generate Frames rejected a low-value question and used the intent-locked fallback instead: ${questionDecision.reason ?? "question was not allowed"}`,
            ],
            preReply: null,
            guidedPlanning: null,
            questionCardKind: fallbackResponse.questionCardKind,
            followUpMode: fallbackResponse.followUpMode,
            followUpQuestion: fallbackResponse.followUpQuestion,
            followUpMultiSelect: fallbackResponse.followUpMultiSelect,
            followUpOptions: fallbackResponse.followUpOptions,
            generatedFramePlan: fallbackResponse.generatedFramePlan,
            soundOptions: null,
            actionPlan: null,
          }, "generate-frames-question-rejected",
          buildGenerateFramesExecutionSummary({
            prompt,
            response: fallbackResponse.output,
            followUpMode: fallbackResponse.followUpMode,
            workspaceContext,
            generatedFrameCount: fallbackResponse.generatedFramePlan?.frames.length ?? null,
            safeFallbackUsed: fallbackResponse.generatedFramePlan == null,
          }));

          return respondJson(responseBody);
        }

        const responseBody = createPipelineResponseBody({
          output: "",
          mode: "chat",
          taskType: effectiveTaskType,
          reasoningLevel,
          searchUsed: searchResults.length > 0,
          warnings,
          preReply: null,
          guidedPlanning: null,
          questionCardKind: "drawing",
          followUpMode: "question-box",
          followUpQuestion: structuredFramesResponse.question,
          followUpMultiSelect: false,
          followUpOptions: null,
          generatedFramePlan: null,
          soundOptions: null,
          actionPlan: null,
        }, "generate-frames-question",
        buildGenerateFramesExecutionSummary({
          prompt,
          response: "",
          followUpMode: "question-box",
          workspaceContext,
          generatedFrameCount: null,
        }));

        return respondJson(responseBody);
      }

      if (structuredFramesResponse.decision === "no-plan") {
        const runtimeAnalysis =
          generateFramesRuntimeAnalysis ??
          analyzeGenerateFramesRequest({
            userMessage: prompt,
            conversationHistory,
            workspaceContext,
            generateFramesState,
            projectAiMemory,
          });
        const allowDeterministicFallback = shouldAllowDeterministicFallbackAfterStructuredFailure({
          analysis: runtimeAnalysis,
          promptValue: prompt,
          workspaceContextValue: workspaceContext,
          structuredSucceeded: false,
        });
        const fallbackResponse = allowDeterministicFallback
          ? buildSafeGenerateFramesFallback(prompt, runtimeAnalysis)
          : null;
        if (
          allowDeterministicFallback &&
          !isGenerateFramesHardNoPlanBlocker(runtimeAnalysis) &&
          fallbackResponse?.generatedFramePlan
        ) {
          const responseBody = createPipelineResponseBody({
            output: fallbackResponse.output,
            mode: "chat",
            taskType: effectiveTaskType,
            reasoningLevel,
            searchUsed: searchResults.length > 0,
            warnings: [
              ...fallbackResponse.warnings,
              "Generate Frames structured generation returned no-plan, so the route used the deterministic runtime fallback instead.",
            ],
            preReply: null,
            guidedPlanning: null,
            questionCardKind: fallbackResponse.questionCardKind,
            followUpMode: fallbackResponse.followUpMode,
            followUpQuestion: fallbackResponse.followUpQuestion,
            followUpMultiSelect: fallbackResponse.followUpMultiSelect,
            followUpOptions: fallbackResponse.followUpOptions,
            generatedFramePlan: fallbackResponse.generatedFramePlan,
            soundOptions: null,
            actionPlan: null,
          }, "generate-frames-no-plan-fallback",
          buildGenerateFramesExecutionSummary({
            prompt,
            response: fallbackResponse.output,
            followUpMode: fallbackResponse.followUpMode,
            workspaceContext,
            generatedFrameCount: fallbackResponse.generatedFramePlan.frames.length,
            safeFallbackUsed: true,
          }));

          return respondJson(responseBody);
        }

        const responseBody = createPipelineResponseBody({
          output: "",
          mode: "chat",
          taskType: effectiveTaskType,
          reasoningLevel,
          searchUsed: searchResults.length > 0,
          warnings: [
            ...warnings,
            ...(allowDeterministicFallback
              ? []
              : [
                  "Generate Frames blocked deterministic fallback because this prompt is high-complexity and the structured path still did not defend a usable plan.",
                ]),
            runtimeAnalysis.noPlanReason ?? "Generate Frames returned no-plan because the request could not be generated safely.",
          ],
          preReply: null,
          guidedPlanning: null,
          questionCardKind: null,
          followUpMode: "none",
          followUpQuestion: null,
          followUpMultiSelect: null,
          followUpOptions: null,
          generatedFramePlan: null,
          soundOptions: null,
          actionPlan: null,
        }, "generate-frames-no-plan",
        buildGenerateFramesExecutionSummary({
          prompt,
          response: "",
          followUpMode: "none",
          workspaceContext,
          generatedFrameCount: null,
          safeFallbackUsed: true,
        }));

        return respondJson(responseBody);
      }

      const structuredRecoveryWarnings: string[] = [];
      const structuredRecoveryLedger: GenerateFramesRecoveryLedgerEntry[] = [];
      const seenStructuredRecoverySignatures = new Set<string>();
      const recoveryGrounding = searchResults.length > 0 ? "search-grounded" : "local-only";
      const preservedRecoveryContext = buildGenerateFramesRecoveryPreservedContext(generateFramesRuntimeAnalysis);
      const recordStructuredRecoveryAttempt = ({
        attemptLabel,
        failureCategory,
        changed,
        modelTier,
        outcome,
        qualityResult,
        reason,
      }: {
        attemptLabel: string;
        failureCategory: GenerateFramesRecoveryFailureCategory;
        changed: string[];
        modelTier: string;
        outcome: GenerateFramesRecoveryAttemptOutcome;
        qualityResult: string;
        reason: string;
      }) => {
        const signature = buildGenerateFramesRecoveryAttemptSignature({
          failureCategory,
          preservedContext: preservedRecoveryContext,
          changed,
          modelTier,
          grounding: recoveryGrounding,
        });
        if (seenStructuredRecoverySignatures.has(signature)) {
          return false;
        }
        seenStructuredRecoverySignatures.add(signature);
        structuredRecoveryLedger.push({
          attemptLabel,
          failureCategory,
          preservedContext: preservedRecoveryContext,
          changed,
          modelTier,
          grounding: recoveryGrounding,
          outcome,
          qualityResult,
          reason,
          signature,
        });
        return true;
      };
      let structuredPlanAttempt = buildSafeGeneratedFramePlanAttempt({
        userPrompt: prompt,
        existingFrames: structuredFramesResponse.frames ?? [],
        workspaceContextValue: workspaceContext,
        runtimeAnalysis: generateFramesRuntimeAnalysis,
      });
      let generatedFramePlan = structuredPlanAttempt.generatedFramePlan;

      if (!generatedFramePlan && (structuredFramesResponse.frames?.length ?? 0) > 0) {
        let latestRecoveryReason =
          structuredPlanAttempt.validationReason ?? "The previous structured frame draft was rejected after runtime validation.";
        let latestFailureCategory = categorizeGenerateFramesRecoveryFailure(latestRecoveryReason);
        const qualityFloor = generateFramesRuntimeAnalysis?.qualityFloor ?? "simple-good";
        recordStructuredRecoveryAttempt({
          attemptLabel: "initial-structured-attempt",
          failureCategory: latestFailureCategory,
          changed: ["initial-attempt"],
          modelTier: structuredFramesResponse.modelSelection?.selectedModel ?? "unknown-model",
          outcome: "rejected",
          qualityResult: `below-${qualityFloor}`,
          reason: latestRecoveryReason,
        });
        const sameTierModel = structuredFramesResponse.modelSelection?.selectedModel ?? undefined;
        const escalatedModel = getNextGenerateFramesRecoveryModel(sameTierModel);
        const structuredRecoveryAttempts: Array<{
          attemptLabel: "same-tier-repair" | "justified-escalation";
          minimumModel: string | undefined;
          changedAxes: string[];
          escalatedModel: boolean;
        }> = [
          {
            attemptLabel: "same-tier-repair",
            minimumModel: sameTierModel,
            changedAxes: ["repair-guidance", "preserved-context"],
            escalatedModel: false,
          },
        ];
        let escalationAttemptQueued = false;
        for (let recoveryAttemptIndex = 0; recoveryAttemptIndex < structuredRecoveryAttempts.length; recoveryAttemptIndex += 1) {
          const recoveryAttempt = structuredRecoveryAttempts[recoveryAttemptIndex]!;
          const attemptModel = recoveryAttempt.minimumModel ?? sameTierModel ?? "unknown-model";
          const attemptSignature = buildGenerateFramesRecoveryAttemptSignature({
            failureCategory: latestFailureCategory,
            preservedContext: preservedRecoveryContext,
            changed: recoveryAttempt.changedAxes,
            modelTier: attemptModel,
            grounding: recoveryGrounding,
          });
          if (seenStructuredRecoverySignatures.has(attemptSignature)) {
            continue;
          }
          try {
            const recoveredStructuredResponse = await generateGenerateFramesStructuredResponse({
              taskPrompt,
              systemInstructions,
              userMessage: prompt,
              runtimeAnalysis: generateFramesRuntimeAnalysis ?? undefined,
              reasoningEffort: reasoningProfile.reasoningEffort,
              recovery: {
                validatorFeedback: latestRecoveryReason,
                minimumModel: recoveryAttempt.minimumModel,
                strongerRetryFirst: true,
                attemptLabel: recoveryAttempt.attemptLabel,
                failureCategory: latestFailureCategory,
                retryAxes: recoveryAttempt.changedAxes,
                preservedContext: preservedRecoveryContext,
              },
            });

            generateFramesModelSwitchLog = recoveredStructuredResponse.modelSelection ?? generateFramesModelSwitchLog;

            if (recoveredStructuredResponse.decision !== "result") {
              latestRecoveryReason =
                recoveredStructuredResponse.decision === "question"
                  ? "The recovery attempt asked a question instead of repairing the rejected frames."
                  : "The recovery attempt returned no-plan instead of repairing the rejected frames.";
              latestFailureCategory = categorizeGenerateFramesRecoveryFailure(latestRecoveryReason);
              recordStructuredRecoveryAttempt({
                attemptLabel: recoveryAttempt.attemptLabel,
                failureCategory: latestFailureCategory,
                changed: recoveryAttempt.changedAxes,
                modelTier: recoveredStructuredResponse.modelSelection?.selectedModel ?? attemptModel,
                outcome: "no-result",
                qualityResult: `below-${qualityFloor}`,
                reason: latestRecoveryReason,
              });
              structuredRecoveryWarnings.push(
                recoveryAttempt.escalatedModel
                  ? "Generate Frames escalated one rung after a failed repair, but that structured recovery still did not return a usable result."
                  : "Generate Frames rejected the first structured draft and retried with tighter validator-guided constraints instead of failing immediately.",
              );
              if (
                !recoveryAttempt.escalatedModel &&
                !escalationAttemptQueued &&
                escalatedModel &&
                shouldAllowGenerateFramesEscalationAttempt({
                  analysis: generateFramesRuntimeAnalysis,
                  failureCategory: latestFailureCategory,
                  latestReason: latestRecoveryReason,
                  searchGrounded: searchResults.length > 0,
                })
              ) {
                structuredRecoveryAttempts.push({
                  attemptLabel: "justified-escalation",
                  minimumModel: escalatedModel,
                  changedAxes: ["repair-guidance", "preserved-context", "model-tier"],
                  escalatedModel: true,
                });
                escalationAttemptQueued = true;
              }
              continue;
            }

            structuredFramesResponse = recoveredStructuredResponse;
            structuredPlanAttempt = buildSafeGeneratedFramePlanAttempt({
              userPrompt: prompt,
              existingFrames: recoveredStructuredResponse.frames ?? [],
              workspaceContextValue: workspaceContext,
              runtimeAnalysis: generateFramesRuntimeAnalysis,
            });
            generatedFramePlan = structuredPlanAttempt.generatedFramePlan;

            if (generatedFramePlan) {
              recordStructuredRecoveryAttempt({
                attemptLabel: recoveryAttempt.attemptLabel,
                failureCategory: latestFailureCategory,
                changed: recoveryAttempt.changedAxes,
                modelTier: recoveredStructuredResponse.modelSelection?.selectedModel ?? attemptModel,
                outcome: "recovered",
                qualityResult: `passes-${qualityFloor}`,
                reason: "Structured recovery cleared runtime validation.",
              });
              structuredRecoveryWarnings.push(
                recoveryAttempt.escalatedModel
                  ? "Generate Frames repaired a validator-rejected draft after one justified model escalation."
                  : "Generate Frames repaired a validator-rejected draft by retrying with tighter constraints before fallback.",
              );
              break;
            }

            latestRecoveryReason =
              structuredPlanAttempt.validationReason ??
              "The recovery attempt still produced frames that failed runtime validation.";
            latestFailureCategory = categorizeGenerateFramesRecoveryFailure(latestRecoveryReason);
            recordStructuredRecoveryAttempt({
              attemptLabel: recoveryAttempt.attemptLabel,
              failureCategory: latestFailureCategory,
              changed: recoveryAttempt.changedAxes,
              modelTier: recoveredStructuredResponse.modelSelection?.selectedModel ?? attemptModel,
              outcome: "rejected",
              qualityResult: `below-${qualityFloor}`,
              reason: latestRecoveryReason,
            });
            structuredRecoveryWarnings.push(
              recoveryAttempt.escalatedModel
                ? "Generate Frames escalated one rung after a failed repair, but that version still failed validation."
                : "Generate Frames retried the rejected structured draft with tighter constraints, but the recovered frames still failed validation.",
            );
            if (
              !recoveryAttempt.escalatedModel &&
              !escalationAttemptQueued &&
              escalatedModel &&
              shouldAllowGenerateFramesEscalationAttempt({
                analysis: generateFramesRuntimeAnalysis,
                failureCategory: latestFailureCategory,
                latestReason: latestRecoveryReason,
                searchGrounded: searchResults.length > 0,
              })
            ) {
              structuredRecoveryAttempts.push({
                attemptLabel: "justified-escalation",
                minimumModel: escalatedModel,
                changedAxes: ["repair-guidance", "preserved-context", "model-tier"],
                escalatedModel: true,
              });
              escalationAttemptQueued = true;
            }
          } catch (error) {
            const recoveryFailureReason = error instanceof Error ? error.message : "Unknown structured recovery failure.";
            latestRecoveryReason = `Structured recovery failed before validation: ${recoveryFailureReason}`;
            latestFailureCategory = categorizeGenerateFramesRecoveryFailure(latestRecoveryReason);
            recordStructuredRecoveryAttempt({
              attemptLabel: recoveryAttempt.attemptLabel,
              failureCategory: latestFailureCategory,
              changed: recoveryAttempt.changedAxes,
              modelTier: attemptModel,
              outcome: "failed-before-validation",
              qualityResult: `below-${qualityFloor}`,
              reason: latestRecoveryReason,
            });
            structuredRecoveryWarnings.push(
              recoveryAttempt.escalatedModel
                ? `Generate Frames attempted one justified model escalation after rejection, but it failed before validation: ${recoveryFailureReason}`
                : `Generate Frames attempted a validator-guided structured retry after rejection, but it failed before validation: ${recoveryFailureReason}`,
            );
            if (
              !recoveryAttempt.escalatedModel &&
              !escalationAttemptQueued &&
              escalatedModel &&
              shouldAllowGenerateFramesEscalationAttempt({
                analysis: generateFramesRuntimeAnalysis,
                failureCategory: latestFailureCategory,
                latestReason: latestRecoveryReason,
                searchGrounded: searchResults.length > 0,
              })
            ) {
              structuredRecoveryAttempts.push({
                attemptLabel: "justified-escalation",
                minimumModel: escalatedModel,
                changedAxes: ["repair-guidance", "preserved-context", "model-tier"],
                escalatedModel: true,
              });
              escalationAttemptQueued = true;
            }
          }
        }
      }
      const structuredResultWarnings =
        structuredRecoveryWarnings.length > 0 ? [...warnings, ...structuredRecoveryWarnings] : warnings;
      if (
        shouldPreferDeterministicRuntimePlan({
          analysis: generateFramesRuntimeAnalysis,
          structuredFrames: structuredFramesResponse.frames ?? [],
          deterministicPlan: candidateResolvedDeterministicRuntimePlan,
        })
      ) {
        const allowDeterministicFallback = shouldAllowDeterministicFallbackAfterStructuredFailure({
          analysis: generateFramesRuntimeAnalysis,
          promptValue: prompt,
          workspaceContextValue: workspaceContext,
          structuredSucceeded: true,
        });
        const deterministicRuntimePlan = candidateResolvedDeterministicRuntimePlan;
        if (allowDeterministicFallback && deterministicRuntimePlan) {
          const responseBody = createPipelineResponseBody({
            output: "",
            mode: "chat",
            taskType: effectiveTaskType,
            reasoningLevel,
            searchUsed: searchResults.length > 0,
            warnings: [
              ...structuredResultWarnings,
              "Generate Frames preferred the deterministic runtime plan because it preserved a clearer setup-to-ending motion arc than the structured draft.",
            ],
            preReply: null,
            guidedPlanning: null,
            questionCardKind: null,
            followUpMode: "none",
            followUpQuestion: null,
            followUpMultiSelect: null,
            followUpOptions: null,
            generatedFramePlan: deterministicRuntimePlan,
            soundOptions: null,
            actionPlan: null,
          }, "generate-frames-deterministic-quality-override",
          buildGenerateFramesExecutionSummary({
            prompt,
            response: "",
            followUpMode: "none",
            workspaceContext,
            generatedFrameCount: deterministicRuntimePlan.frames.length,
          }));

          return respondJson(responseBody);
        }
      }
      if (!generatedFramePlan) {
        const allowDeterministicFallback = shouldAllowDeterministicFallbackAfterStructuredFailure({
          analysis: generateFramesRuntimeAnalysis,
          promptValue: prompt,
          workspaceContextValue: workspaceContext,
          structuredSucceeded: false,
        });
        const fallbackResponse = allowDeterministicFallback
          ? buildSafeGenerateFramesFallback(prompt, generateFramesRuntimeAnalysis)
          : null;
        const qualityFloor = generateFramesRuntimeAnalysis?.qualityFloor ?? "simple-good";
        const finalRecoveryReason =
          structuredRecoveryLedger.at(-1)?.reason ??
          structuredPlanAttempt.validationReason ??
          "Structured recovery did not produce a usable plan.";
        if (allowDeterministicFallback && fallbackResponse?.generatedFramePlan) {
          recordStructuredRecoveryAttempt({
            attemptLabel: "deterministic-fallback-evaluation",
            failureCategory: categorizeGenerateFramesRecoveryFailure(finalRecoveryReason),
            changed: ["deterministic-fallback-family-path"],
            modelTier: "deterministic-runtime",
            outcome: "fallback-used",
            qualityResult: `passes-${qualityFloor}`,
            reason: "Deterministic fallback produced a safe plan after bounded structured recovery.",
          });
        } else {
          recordStructuredRecoveryAttempt({
            attemptLabel: "deterministic-fallback-evaluation",
            failureCategory: categorizeGenerateFramesRecoveryFailure(finalRecoveryReason),
            changed: ["deterministic-fallback-family-path"],
            modelTier: allowDeterministicFallback ? "deterministic-runtime" : "fallback-blocked",
            outcome: "fallback-blocked",
            qualityResult: `below-${qualityFloor}`,
            reason: allowDeterministicFallback
              ? "Deterministic fallback was evaluated but did not produce a safe usable plan."
              : "Deterministic fallback was blocked because the prompt remained too complex after bounded recovery.",
          });
        }
        const responseBody = createPipelineResponseBody({
          output: fallbackResponse?.output ?? "",
          mode: "chat",
          taskType: effectiveTaskType,
          reasoningLevel,
          searchUsed: searchResults.length > 0,
          warnings: Array.from(
            new Set([
              ...structuredResultWarnings,
              ...(fallbackResponse?.warnings ?? []),
              allowDeterministicFallback
                ? fallbackResponse?.generatedFramePlan
                  ? "Generate Frames structured generation returned no usable frame drafts even after recovery attempts, so the route used the deterministic runtime plan instead."
                  : "Generate Frames structured generation returned no usable frame drafts even after recovery attempts, so the route emitted no generatedFramePlan."
                : "Generate Frames blocked deterministic fallback because this prompt is high-complexity and the structured drafts were still not good enough after recovery attempts.",
              ...(fallbackResponse?.generatedFramePlan
                ? []
                : [
                    buildGenerateFramesControlledRecoveryWarning({
                      latestReason: finalRecoveryReason,
                      ledger: structuredRecoveryLedger,
                      qualityFloor,
                      fallbackEvaluated: true,
                    }),
                  ]),
            ]),
          ),
          preReply: null,
          guidedPlanning: null,
          questionCardKind: fallbackResponse?.questionCardKind ?? null,
          followUpMode: fallbackResponse?.followUpMode ?? "none",
          followUpQuestion: fallbackResponse?.followUpQuestion ?? null,
          followUpMultiSelect: fallbackResponse?.followUpMultiSelect ?? null,
          followUpOptions: fallbackResponse?.followUpOptions ?? null,
          generatedFramePlan: fallbackResponse?.generatedFramePlan ?? null,
          soundOptions: null,
          actionPlan: null,
        }, "generate-frames-no-usable-plan",
        buildGenerateFramesExecutionSummary({
          prompt,
          response: fallbackResponse?.output ?? "",
          followUpMode: fallbackResponse?.followUpMode ?? "none",
          workspaceContext,
          generatedFrameCount: fallbackResponse?.generatedFramePlan?.frames.length ?? null,
          safeFallbackUsed: fallbackResponse?.generatedFramePlan == null,
        }));

        return respondJson(responseBody);
      }
      const responseBody = createPipelineResponseBody({
        output: "",
        mode: "chat",
        taskType: effectiveTaskType,
        reasoningLevel,
        searchUsed: searchResults.length > 0,
        warnings: structuredResultWarnings,
        preReply: null,
        guidedPlanning: null,
        questionCardKind: null,
        followUpMode: "none",
        followUpQuestion: null,
        followUpMultiSelect: null,
        followUpOptions: null,
        generatedFramePlan,
        soundOptions: null,
        actionPlan: null,
      }, "generate-frames-result",
      buildGenerateFramesExecutionSummary({
        prompt,
        response: "",
        followUpMode: "none",
        workspaceContext,
        generatedFrameCount: generatedFramePlan?.frames.length ?? null,
      }));

      return respondJson(responseBody);
    }

    if (effectiveTaskType === "generate-sounds") {
      if (!isSoundGenerationEnabled()) {
        const responseBody = createPipelineResponseBody({
          mode: "chat",
          taskType: effectiveTaskType,
          reasoningLevel,
          searchUsed: searchResults.length > 0,
          warnings: [
            ...warnings,
            "Generate Sounds is temporarily disabled, so the sound pipeline was skipped before direction planning or preview execution.",
          ],
          preReply: null,
          guidedPlanning: null,
          ...buildGenerateSoundsDisabledResponseFields(),
        }, "generate-sounds-disabled",
        buildGenerateSoundsExecutionSummary({
          prompt,
          followUpMode: "none",
          soundOptions: null,
          safeFallbackUsed: true,
        }));

        return respondJson(responseBody);
      }

      const requestedFrameTarget = parseRequestedFrameTarget(prompt, workspaceContext);
      const currentFrameTarget =
        workspaceContext != null
          ? {
              frameNumber: workspaceContext.currentFrameIndex + 1,
              frameIndex: workspaceContext.currentFrameIndex,
            }
          : null;
      const buildSoundFrameAttachmentActionPlan = (
        soundOption: DrawingAiSoundOption,
        targetFrame: NonNullable<typeof requestedFrameTarget>,
      ): NonNullable<DrawingAiResponse["actionPlan"]> => ({
        type: "engine-command",
        commandType: "sound-command",
        action: "attach-sound-option-to-frame",
        label: `Attach ${soundOption.title} to frame ${targetFrame.frameNumber}`,
        targetSystem: "workspace-ui",
        executionGoal: "Attach the selected sound option to the requested frame.",
        executionMode: "execute-now",
        commandChain: "continue",
        parameters: {
          frameNumber: targetFrame.frameNumber,
          soundOptionTitle: soundOption.title,
        },
        frameIndex: targetFrame.frameIndex,
        soundOption,
      });

      const soundImportRequest = parseSoundOptionImportRequest(prompt);
      const selectedCurrentSoundOption = parseCurrentSoundOptionSelection(prompt, recentSoundOptions);
      if (soundImportRequest) {
        const selectedOption = recentSoundOptions?.[soundImportRequest.optionIndex] ?? null;

        if (selectedOption) {
          const actionPlan = buildSoundFrameAttachmentActionPlan(selectedOption, soundImportRequest);
          const responseBody = createPipelineResponseBody({
            output: buildPreparedEngineCommandOutput(actionPlan),
            mode: "chat",
            taskType: effectiveTaskType,
            reasoningLevel,
            searchUsed: searchResults.length > 0,
            warnings,
            preReply: null,
            guidedPlanning: null,
            questionCardKind: null,
            followUpMode: "none",
            followUpQuestion: null,
            followUpMultiSelect: null,
            followUpOptions: null,
            soundOptions: null,
            actionPlan,
          }, "generate-sounds-import-option-action",
          buildGenerateSoundsExecutionSummary({
            prompt,
            followUpMode: "none",
            soundOptions: null,
            actionPlan,
          }));

          return respondJson(responseBody);
        }

        const availableCount = recentSoundOptions?.length ?? 0;
        const responseBody = createPipelineResponseBody({
          output:
            availableCount > 0
              ? `I can import one of the current ${availableCount} engine behavior plans, but option ${soundImportRequest.optionNumber} is not available.`
              : "I can import an engine behavior plan to a frame after plans have been prepared, but I don't have a current option set to place yet.",
          mode: "chat",
          taskType: effectiveTaskType,
          reasoningLevel,
          searchUsed: searchResults.length > 0,
          warnings,
          preReply: null,
          guidedPlanning: null,
          questionCardKind: null,
          followUpMode: "none",
          followUpQuestion: null,
          followUpMultiSelect: null,
          followUpOptions: null,
          soundOptions: null,
          actionPlan: null,
        }, "generate-sounds-import-option-missing",
        buildGenerateSoundsExecutionSummary({
          prompt,
          followUpMode: "none",
          soundOptions: null,
          safeFallbackUsed: true,
        }));

        return respondJson(responseBody);
      }

      if (selectedCurrentSoundOption) {
        const attachTarget =
          SOUND_GENERIC_ATTACH_PATTERN.test(prompt) || /\bimport\b/i.test(prompt)
            ? requestedFrameTarget ?? currentFrameTarget
            : requestedFrameTarget && /\b(on|to|into|at)\s+frame\b/i.test(prompt)
              ? requestedFrameTarget
              : null;

        if (attachTarget) {
          const actionPlan = buildSoundFrameAttachmentActionPlan(selectedCurrentSoundOption.option, attachTarget);
          const responseBody = createPipelineResponseBody({
            output: buildPreparedEngineCommandOutput(actionPlan),
            mode: "chat",
            taskType: effectiveTaskType,
            reasoningLevel,
            searchUsed: searchResults.length > 0,
            warnings,
            preReply: null,
            guidedPlanning: null,
            questionCardKind: null,
            followUpMode: "none",
            followUpQuestion: null,
            followUpMultiSelect: null,
            followUpOptions: null,
            soundOptions: null,
            actionPlan,
          }, "generate-sounds-current-option-attach",
          buildGenerateSoundsExecutionSummary({
            prompt,
            followUpMode: "none",
            soundOptions: null,
            actionPlan,
          }));

          return respondJson(responseBody);
        }

        const responseBody = createPipelineResponseBody({
          output: `Keeping option ${selectedCurrentSoundOption.optionNumber} (${selectedCurrentSoundOption.option.title}) as the current pick. If you want, I can attach it to a frame or keep refining it.`,
          mode: "chat",
          taskType: effectiveTaskType,
          reasoningLevel,
          searchUsed: searchResults.length > 0,
          warnings,
          preReply: null,
          guidedPlanning: null,
          questionCardKind: null,
          followUpMode: "none",
          followUpQuestion: null,
          followUpMultiSelect: null,
          followUpOptions: null,
          soundOptions: [selectedCurrentSoundOption.option],
          actionPlan: null,
        }, "generate-sounds-current-option-select",
        buildGenerateSoundsExecutionSummary({
          prompt,
          followUpMode: "none",
          soundOptions: [selectedCurrentSoundOption.option],
        }));

        return respondJson(responseBody);
      }

      if (
        requestedFrameTarget &&
        SOUND_GENERIC_ATTACH_PATTERN.test(prompt) &&
        !soundImportRequest &&
        !looksLikeVoiceSpeechRequest(prompt)
      ) {
        if ((recentSoundOptions?.length ?? 0) === 1) {
          const selectedOption = recentSoundOptions?.[0] ?? null;
          if (selectedOption) {
            const actionPlan = buildSoundFrameAttachmentActionPlan(selectedOption, requestedFrameTarget);
            const responseBody = createPipelineResponseBody({
              output: buildPreparedEngineCommandOutput(actionPlan),
              mode: "chat",
              taskType: effectiveTaskType,
              reasoningLevel,
              searchUsed: searchResults.length > 0,
              warnings,
              preReply: null,
              guidedPlanning: null,
              questionCardKind: null,
              followUpMode: "none",
              followUpQuestion: null,
              followUpMultiSelect: null,
              followUpOptions: null,
              soundOptions: null,
              actionPlan,
            }, "generate-sounds-attach-current-option",
            buildGenerateSoundsExecutionSummary({
              prompt,
              followUpMode: "none",
              soundOptions: null,
              actionPlan,
            }));

            return respondJson(responseBody);
          }
        }

        if ((recentSoundOptions?.length ?? 0) > 1) {
          const responseBody = createPipelineResponseBody({
            output: "",
            mode: "chat",
            taskType: effectiveTaskType,
            reasoningLevel,
            searchUsed: searchResults.length > 0,
            warnings,
            preReply: null,
            guidedPlanning: null,
            questionCardKind: "sound",
            followUpMode: "question-box",
            followUpQuestion: `Which prepared sound command should attach to frame ${requestedFrameTarget.frameNumber}?`,
            followUpMultiSelect: false,
            followUpOptions: null,
            soundOptions: null,
            actionPlan: null,
          }, "generate-sounds-attach-current-option-question",
          buildGenerateSoundsExecutionSummary({
            prompt,
            followUpMode: "question-box",
            soundOptions: null,
          }));

          return respondJson(responseBody);
        }
      }

      if (looksLikeVoiceSpeechRequest(prompt)) {
        const voicePlaceholderOption = buildVoicePlaceholderSoundOption(prompt, workspaceContext);
        const actionPlan = requestedFrameTarget ? buildSoundFrameAttachmentActionPlan(voicePlaceholderOption, requestedFrameTarget) : null;
        const responseBody = createPipelineResponseBody({
          output: requestedFrameTarget && actionPlan
            ? buildPreparedEngineCommandOutput(actionPlan)
            : `Prepared voice-request placeholder intent. A target frame is still needed before the engine can attach it.`,
          mode: "chat",
          taskType: effectiveTaskType,
          reasoningLevel,
          searchUsed: searchResults.length > 0,
          warnings,
          preReply: null,
          guidedPlanning: null,
          questionCardKind: null,
          followUpMode: "none",
          followUpQuestion: null,
          followUpMultiSelect: null,
          followUpOptions: null,
          soundOptions: requestedFrameTarget ? null : [voicePlaceholderOption],
          actionPlan,
        }, "generate-sounds-voice-placeholder",
        buildGenerateSoundsExecutionSummary({
          prompt,
          followUpMode: "none",
          soundOptions: requestedFrameTarget ? null : [voicePlaceholderOption],
          actionPlan,
        }));

        return respondJson(responseBody);
      }

      const requestedOptionCount = 1;
      let orchestratedSound = orchestrateGenerateSound({
        userPrompt: prompt,
        examples: generateSoundTrainingExamples,
        workspaceContext,
        recentSoundOptions,
        requestedOptionCount,
        referenceSearchResults: searchResults,
        targetFrameNumber: requestedFrameTarget?.frameNumber ?? null,
      });

      if (
        orchestratedSound.referenceLookupQuery &&
        searchResults.length === 0
      ) {
        try {
          const referenceQuery = buildSearchQuery(orchestratedSound.referenceLookupQuery);
          searchResults = await searchInternet(referenceQuery, Math.min(3, reasoningProfile.maxSearchResults));
          if (searchResults.length === 0) {
            warnings.push("Generate Sounds v2 reference lookup did not return usable results, so planning continued from local examples only.");
          }
        } catch (error) {
          warnings.push("Generate Sounds v2 reference lookup failed, so planning continued from local examples only.");
          console.warn("Generate Sounds v2 reference lookup failed.", error);
        }

        orchestratedSound = orchestrateGenerateSound({
          userPrompt: prompt,
          examples: generateSoundTrainingExamples,
          workspaceContext,
          recentSoundOptions,
          requestedOptionCount,
          referenceSearchResults: searchResults,
          targetFrameNumber: requestedFrameTarget?.frameNumber ?? null,
        });
      }

      if (orchestratedSound.decision === "question" && orchestratedSound.question) {
        const responseBody = createPipelineResponseBody({
          output: orchestratedSound.response,
          mode: "chat",
          taskType: effectiveTaskType,
          reasoningLevel,
          searchUsed: searchResults.length > 0,
          warnings: [...warnings, ...orchestratedSound.warnings],
          preReply: null,
          guidedPlanning: null,
          questionCardKind: "sound",
          followUpMode: "question-box",
          followUpQuestion: orchestratedSound.question,
          followUpMultiSelect: false,
          followUpOptions: null,
          soundOptions: null,
          actionPlan: null,
        }, "generate-sounds-v2-question",
        buildGenerateSoundsExecutionSummary({
          prompt,
          followUpMode: "question-box",
          soundOptions: null,
        }));

        return respondJson(responseBody);
      }

      const repairedSoundOptions = repairSoundOptionsForRoute(
        orchestratedSound.soundOptions,
        "Generate Sounds v2 orchestrator",
      );

      if ((repairedSoundOptions?.length ?? 0) === 0) {
        const responseBody = createPipelineResponseBody({
          output: "One quick sound detail will lock this in.",
          mode: "chat",
          taskType: effectiveTaskType,
          reasoningLevel,
          searchUsed: searchResults.length > 0,
          warnings: [
            ...warnings,
            ...orchestratedSound.warnings,
            "Generate Sounds v2 returned no repairable sound options, so the route asked for clarification instead of falling back to a generic direction.",
          ],
          preReply: null,
          guidedPlanning: null,
          questionCardKind: "sound",
          followUpMode: "question-box",
          followUpQuestion: "Is this beat mainly an impact, a movement, an ambience layer, or a mechanical sound?",
          followUpMultiSelect: false,
          followUpOptions: null,
          soundOptions: null,
          actionPlan: null,
        }, "generate-sounds-v2-empty-result",
        buildGenerateSoundsExecutionSummary({
          prompt,
          followUpMode: "question-box",
          soundOptions: null,
          safeFallbackUsed: true,
        }));

        return respondJson(responseBody);
      }

      const safeRepairedSoundOptions = repairedSoundOptions as DrawingAiSoundOption[];

      const generatedSoundActionPlan =
        requestedFrameTarget &&
        SOUND_GENERIC_ATTACH_PATTERN.test(prompt) &&
        !looksLikeVoiceSpeechRequest(prompt) &&
        safeRepairedSoundOptions.length === 1
          ? buildSoundFrameAttachmentActionPlan(safeRepairedSoundOptions[0]!, requestedFrameTarget)
          : null;
      const generatedTargetFrameNumber = requestedFrameTarget?.frameNumber ?? null;
      const generatedSoundOutput =
        generatedSoundActionPlan && safeRepairedSoundOptions[0] && generatedTargetFrameNumber != null
          ? buildPreparedEngineCommandOutput(generatedSoundActionPlan)
          : orchestratedSound.response;
      const responseBody = createPipelineResponseBody({
        output: generatedSoundOutput,
        mode: "chat",
        taskType: effectiveTaskType,
        reasoningLevel,
        searchUsed: searchResults.length > 0,
        warnings: [...warnings, ...orchestratedSound.warnings],
        preReply: null,
        guidedPlanning: null,
        questionCardKind: null,
        followUpMode: "none",
        followUpQuestion: null,
        followUpMultiSelect: null,
        followUpOptions: null,
        soundOptions: safeRepairedSoundOptions,
        actionPlan: generatedSoundActionPlan,
      }, "generate-sounds-v2-result",
      buildGenerateSoundsExecutionSummary({
        prompt,
        followUpMode: "none",
        soundOptions: safeRepairedSoundOptions,
        actionPlan: generatedSoundActionPlan,
        safeFallbackUsed: orchestratedSound.fallbackUsed,
      }));

      return respondJson(responseBody);
    }

    if (effectiveTaskType === "other") {
      const directActionPlan = inferOtherActionPlan(prompt);
      const responseBody = createPipelineResponseBody(
        {
          output: directActionPlan ? buildOtherCommandEnvelopeOutput(directActionPlan) : buildOtherRoutingQuestion(prompt),
          mode: "chat",
          taskType: effectiveTaskType,
          reasoningLevel,
          searchUsed: searchResults.length > 0,
          warnings,
          preReply: null,
          guidedPlanning: null,
          followUpMode: directActionPlan ? "none" : "question-box",
          followUpQuestion: directActionPlan ? null : buildOtherRoutingQuestion(prompt),
          followUpMultiSelect: false,
          followUpOptions: null,
          actionPlan: directActionPlan,
        },
        directActionPlan ? "other-command-envelope" : "other-routing-question",
        buildOtherExecutionSummary({
          prompt,
          actionPlan: directActionPlan,
        }),
        {
          intentKindOverride: "task",
        },
      );

      return respondJson(responseBody);
    }

    if (isGeneratePlansFollowUpContinuation) {
      generatePlansContinuationPhase = "after-plan-generation-started";
    }
    let aiResponse = await generateAiText({
      prompt: taskPrompt,
      instructions: systemInstructions,
      reasoningEffort: reasoningProfile.reasoningEffort,
      maxOutputTokens,
    });

    let simplifiedOutput = simplifyAiOutput(aiResponse.output);

    if (
      effectiveTaskType === "generate-plans" &&
      generatePlansAnalysis &&
      !generatePlansAnalysis.needsClarification &&
      isWeakGeneratePlansOutput(simplifiedOutput)
    ) {
      const retryActionLengthInstruction =
        generatePlansAnalysis.responseScale === "simple"
          ? "Use 3 to 5 ordered actions only."
          : "Use as many ordered actions as needed to keep cause and effect readable, but do not pad with filler.";
      aiResponse = await generateAiText({
        prompt: [
          taskPrompt,
          "The request is already clear enough for a real plan.",
          "Do not ask follow-up questions.",
          "Do not loop back into questions once enough info is known.",
          "Return only valid JSON. No prose, no markdown fences, no commentary, and no handoff sentence.",
          'Use this exact shape: {"commands":[{"type":"...","target":"...","parameters":{...}}]}.',
          "Act like a command director defining what the engine should execute later, not a writer summarizing narrative.",
          "Choose one strongest direction only. Do not return multiple options.",
          retryActionLengthInstruction,
          "Each action must be ordered, explicit, and engine-ready.",
          "Define clear cause and effect across the chain: setup or opening pressure -> escalation or turn -> payoff or settle state.",
          "Use command types that describe what should happen, not how it feels.",
          "Each parameters object should lock the execution detail that matters for that action.",
          "If the user is continuing the same project, scene, or plan, extend the existing command chain instead of restarting it.",
          "If the user is improving an existing plan, modify only the weak section and preserve the current sequence direction.",
          "If the user already gives a sequence, midpoint turn, ending result, or winner, preserve that structure and expand it instead of replacing it.",
          "Do not change the user's beginning, middle, ending, or winner.",
          "Make the impact moment, reveal moment, payoff moment, and final visual state identifiable through the action order.",
          "Bad: prose sections, narrative explanation, multiple plan options, or wording that implies you already animated anything.",
          'Good: {"commands":[{"type":"define_execution_target","target":"sequence","parameters":{"instruction":"..."}}]}',
        ].join("\n\n"),
        instructions: systemInstructions,
        reasoningEffort: reasoningProfile.reasoningEffort,
        maxOutputTokens,
      });
      simplifiedOutput = simplifyAiOutput(aiResponse.output);
    }

    generatePlansHadPreReply = false;
    const finalizedGeneratePlansOutput =
      effectiveTaskType === "generate-plans" && generatePlansAnalysis
        ? finalizeGeneratePlansOutput({
            output: simplifiedOutput,
            analysis: generatePlansAnalysis,
          })
        : simplifiedOutput;

    if (
      effectiveTaskType === "generate-plans" &&
      generatePlansAnalysis &&
      !generatePlansAnalysis.needsClarification
    ) {
      generatePlansGuidedPlanningStatus =
        finalizedGeneratePlansOutput === DRAWING_AI_FINAL_PLAN_FALLBACK_OUTPUT
          ? "ready-to-plan"
          : "plan-complete";
      if (finalizedGeneratePlansOutput === DRAWING_AI_FINAL_PLAN_FALLBACK_OUTPUT) {
        logGeneratePlansFinalFormattingFailure("before-model-output-normalization");
      }
    }

    const responseBody = createPipelineResponseBody({
      output: finalizedGeneratePlansOutput,
      mode: "chat",
      taskType: effectiveTaskType,
      reasoningLevel,
      searchUsed: searchResults.length > 0,
      warnings,
      preReply: null,
      guidedPlanning:
        effectiveTaskType === "generate-plans" && generatePlansAnalysis
          ? buildGeneratePlansGuidedPlanningState(
              generatePlansAnalysis.sceneType,
              generatePlansGuidedPlanningStatus,
            )
          : null,
      followUpMode: "none",
      followUpQuestion: null,
      followUpMultiSelect: null,
      followUpOptions: null,
      actionPlan: null,
    }, "main-response",
    effectiveTaskType === "generate-plans"
      ? buildGeneratePlansExecutionSummary({
          prompt,
          followUpMode: "none",
        })
      : null,
    effectiveTaskType === "generate-plans" && generatePlansAnalysis && !generatePlansAnalysis.needsClarification
      ? {
          fallbackOutputOverride: DRAWING_AI_FINAL_PLAN_FALLBACK_OUTPUT,
          onFallbackUsed: () =>
            logGeneratePlansFinalFormattingFailure("after-model-output-normalization"),
        }
      : undefined);

    return respondJson(responseBody);
  } catch (error) {
    if (isGeneratePlansFollowUpContinuation) {
      console.warn("Generate Plans follow-up continuation failed.", {
        reason: "exception",
        interactionKind: generatePlansFollowUpInteractionKind ?? "unknown",
        followUpKey: activeFollowUp?.question?.trim() || "unknown-follow-up",
        storedAnswerKeys: normalizedFollowUpMemoryKeys,
        isEditAnswer: isEditingGeneratePlansFollowUp,
        sceneType: generatePlansContinuationSceneType,
        continuationPhase: generatePlansContinuationPhase,
        followUpAnswerSource: followUpAnswerSource ?? "unknown",
        rawTypedAnswer: generatePlansRawTypedAnswer,
        prompt,
        error,
      });

      const safeFollowUpFallback = normalizeDrawingAiResponse(
        {
          output: buildNaturalGeneratePlansReaskLeadIn(generatePlansFollowUpInteractionKind),
          mode: "chat",
          taskType: effectiveTaskType,
          reasoningLevel,
          searchUsed: false,
          warnings: [],
          preReply: null,
          guidedPlanning: buildGeneratePlansGuidedPlanningState(
            generatePlansContinuationSceneType as DrawingAiGuidedPlanningSceneType,
            "questioning",
          ),
          followUpMode: activeFollowUp ? "question-box" : "none",
          followUpQuestion: activeFollowUp?.question ?? null,
          followUpMultiSelect: activeFollowUp?.followUpMultiSelect === true,
          followUpOptions: activeFollowUp?.followUpOptions ?? null,
          actionPlan: null,
        },
        {
          fallbackTaskType: effectiveTaskType,
          fallbackReasoningLevel: reasoningLevel,
          logContext: "Drawing AI route (generate-plans-follow-up-fallback)",
        },
      );

      return respondJson(safeFollowUpFallback);
    }

    if (effectiveTaskType === "generate-plans" && generatePlansGuidedPlanningStatus !== "questioning") {
      console.warn("Generate Plans final plan formatting failed.", {
        sceneType: generatePlansContinuationSceneType,
        guidedPlanningStatus: generatePlansGuidedPlanningStatus,
        hadPreReply: generatePlansHadPreReply,
        formattingPhase: "before-model-output-normalization",
        error,
      });

      const safeFinalPlanFallback = normalizeDrawingAiResponse(
        {
          output: DRAWING_AI_FINAL_PLAN_FALLBACK_OUTPUT,
          mode: "chat",
          taskType: effectiveTaskType,
          reasoningLevel,
          searchUsed: false,
          warnings: [],
          preReply: null,
          guidedPlanning: buildGeneratePlansGuidedPlanningState(
            generatePlansContinuationSceneType as DrawingAiGuidedPlanningSceneType,
            "ready-to-plan",
          ),
          followUpMode: "none",
          followUpQuestion: null,
          followUpMultiSelect: null,
          followUpOptions: null,
          actionPlan: null,
        },
        {
          fallbackOutput: DRAWING_AI_FINAL_PLAN_FALLBACK_OUTPUT,
          fallbackTaskType: effectiveTaskType,
          fallbackReasoningLevel: reasoningLevel,
          logContext: "Drawing AI route (generate-plans-final-plan-fallback)",
        },
      );

      return respondJson(safeFinalPlanFallback);
    }

    console.error("OpenAI route error:", error);
    const errorMessage =
      error instanceof Error && error.message.trim().length > 0
        ? error.message.trim()
        : "Failed to generate response";
    return respondJson(
      { error: errorMessage },
      { status: 500 },
    );
  } finally {
    if (shouldLogDevAiCostRequest) {
      try {
        const usageSummary = getCurrentDevAiRequestUsageSummary();
        const loggedSearchUsed =
          responseBodyForLogging &&
          typeof responseBodyForLogging === "object" &&
          "searchUsed" in responseBodyForLogging &&
          typeof (responseBodyForLogging as { searchUsed?: unknown }).searchUsed === "boolean"
            ? (responseBodyForLogging as { searchUsed: boolean }).searchUsed
            : requestedSearch;
        const fallbackInitialModel = usageSummary.modelNames.length > 0 ? usageSummary.modelNames[0] ?? null : null;
        const fallbackSelectedModel =
          usageSummary.modelNames.length > 0 ? usageSummary.modelNames[usageSummary.modelNames.length - 1] ?? null : null;
        const fallbackEscalatedFromDefault =
          effectiveTaskType === "generate-frames" &&
          usageSummary.modelNames.includes(AI_TEXT_ECONOMY_MODEL) &&
          (usageSummary.modelNames.includes(AI_TEXT_BALANCED_MODEL) || usageSummary.modelNames.includes(AI_TEXT_MODEL));
        const fallbackEscalatedTo =
          usageSummary.modelNames.length > 1 ? usageSummary.modelNames[usageSummary.modelNames.length - 1] ?? null : null;
        const loggedInitialModel = generateFramesModelSwitchLog?.initialModel ?? fallbackInitialModel;
        const loggedSelectedModel = generateFramesModelSwitchLog?.selectedModel ?? fallbackSelectedModel;
        const loggedEscalatedFromDefault =
          generateFramesModelSwitchLog?.escalatedFromDefault ?? fallbackEscalatedFromDefault;
        const loggedFallbackModelUsed =
          generateFramesModelSwitchLog?.fallbackModelUsed ?? usageSummary.modelNames.length > 1;
        const loggedEscalatedTo = generateFramesModelSwitchLog?.escalatedTo ?? fallbackEscalatedTo;
        const loggedEscalationReason =
          generateFramesModelSwitchLog?.escalationReason ??
          (usageSummary.modelNames.length > 1 ? "request-upgraded-after-initial-pass" : null);
        const loggedComplexityTier = generateFramesModelSwitchLog?.complexityTier ?? null;

        await appendDevAiCostLogEntry({
          id: requestId,
          requestId,
          timestamp: requestTimestamp,
          workspaceType,
          taskType: effectiveTaskType || taskType,
          reasoningLevel,
          modelNames: usageSummary.modelNames,
          initialModel: loggedInitialModel,
          selectedModel: loggedSelectedModel,
          fallbackModelUsed: loggedFallbackModelUsed,
          escalatedFromDefault: loggedEscalatedFromDefault,
          escalatedTo: loggedEscalatedTo,
          escalationReason: loggedEscalationReason,
          complexityTier: loggedComplexityTier,
          prompt,
          searchUsed: loggedSearchUsed,
          success: responseStatusForLogging < 400,
          statusCode: responseStatusForLogging,
          failureMessage: responseFailureMessage,
          durationMs: Date.now() - requestStartedAt,
          modelCallCount: usageSummary.modelCallCount,
          actualModelCallCount: usageSummary.actualModelCallCount,
          usageSource: usageSummary.usageSource,
          actualInputTokens: usageSummary.actualInputTokens,
          actualOutputTokens: usageSummary.actualOutputTokens,
          actualTotalTokens: usageSummary.actualTotalTokens,
          estimatedInputTokens: usageSummary.estimatedInputTokens,
          estimatedOutputTokens: usageSummary.estimatedOutputTokens,
          estimatedTotalTokens: usageSummary.estimatedTotalTokens,
          estimatedRequestCostUsd: usageSummary.estimatedRequestCostUsd,
        });
      } catch (loggingError) {
        console.warn("Failed to write local AI cost dashboard log entry.", {
          requestId,
          error: loggingError instanceof Error ? loggingError.message : loggingError,
        });
      }
    }
  }
}
