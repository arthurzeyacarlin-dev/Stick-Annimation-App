import {buildDeterministicStickFigureAiMockEnvelope} from "./stickFigureAiMockServer.ts";
import {
  readStickFigureAiServerEnvironment,
  resolveStickFigureAiAvailability,
  type StickFigureAiServerEnvironment,
} from "./stickFigureAiAvailability.ts";
import {
  STICK_AI_REQUEST_BYTE_LIMIT,
  readStrictStickJson,
} from "./strictStickJson.ts";

export const STICK_FIGURE_AI_WORKSPACE_HEADER = "x-diamond-ai-workspace" as const;
export const STICK_FIGURE_AI_WORKSPACE_HEADER_VALUE = "stick-figure" as const;

type StickDispatchErrorCode =
  | "capability_disabled"
  | "temporarily_unavailable"
  | "invalid_request"
  | "request_too_large"
  | "unsupported_prompt"
  | "unsupported_project_state"
  | "unsupported_version"
  | "capability_mismatch";

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "cache-control": "no-store",
    "content-type": "application/json",
  },
});

const errorResponse = (code: StickDispatchErrorCode, status: number) =>
  jsonResponse({error: {code, message: "Stick AI request could not be completed."}}, status);

const availabilityErrorCode = (reason: ReturnType<typeof resolveStickFigureAiAvailability>["reason"]): StickDispatchErrorCode =>
  reason === "temporarily_unavailable" ? "temporarily_unavailable" : "capability_disabled";

export const handleStickFigureAiAvailabilityGet = (
  request: Request,
  environment: StickFigureAiServerEnvironment = readStickFigureAiServerEnvironment(),
) => {
  if (request.headers.get(STICK_FIGURE_AI_WORKSPACE_HEADER) !== STICK_FIGURE_AI_WORKSPACE_HEADER_VALUE) {
    return errorResponse("invalid_request", 405);
  }
  return jsonResponse(resolveStickFigureAiAvailability(environment));
};

export const dispatchStickFigureAiPost = async (
  request: Request,
  environment: StickFigureAiServerEnvironment = readStickFigureAiServerEnvironment(),
): Promise<Response | null> => {
  const strict = await readStrictStickJson(request.clone());
  const headerMarked = request.headers.get(STICK_FIGURE_AI_WORKSPACE_HEADER) === STICK_FIGURE_AI_WORKSPACE_HEADER_VALUE;
  const bodyMarked = strict.markers.length > 0;
  if (!headerMarked && !bodyMarked) return null;

  if (strict.rawUtf8ByteLength > STICK_AI_REQUEST_BYTE_LIMIT) {
    return errorResponse("request_too_large", 413);
  }
  if (!strict.ok || !headerMarked || !bodyMarked) {
    return errorResponse("invalid_request", 400);
  }

  const availability = resolveStickFigureAiAvailability(environment);
  if (!availability.available) {
    return errorResponse(availabilityErrorCode(availability.reason), 503);
  }

  const envelope = await buildDeterministicStickFigureAiMockEnvelope(strict.parsedValue);
  if (!envelope.ok) {
    const code = envelope.error.code;
    const status = code === "request_too_large" ? 413 : 400;
    if (
      code === "invalid_request" ||
      code === "request_too_large" ||
      code === "unsupported_prompt" ||
      code === "unsupported_project_state" ||
      code === "unsupported_version" ||
      code === "capability_mismatch"
    ) return errorResponse(code, status);
    return errorResponse("invalid_request", 400);
  }
  return jsonResponse(envelope.value);
};
