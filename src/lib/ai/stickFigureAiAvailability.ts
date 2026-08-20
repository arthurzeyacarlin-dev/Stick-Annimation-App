export type StickFigureAiAvailabilityReason =
  | "available"
  | "capability_disabled"
  | "server_not_configured"
  | "production_forbidden"
  | "temporarily_unavailable";

export type StickFigureAiAvailability = {
  available: boolean;
  reason: StickFigureAiAvailabilityReason;
};

export type StickFigureAiServerEnvironment = {
  nodeEnv: string | undefined;
  configuredMode: string | undefined;
};

export const readStickFigureAiServerEnvironment = (): StickFigureAiServerEnvironment => ({
  nodeEnv: process.env.NODE_ENV,
  configuredMode: process.env.DIAMOND_STICK_AI_V1_MODE,
});

export const resolveStickFigureAiAvailability = (
  environment: StickFigureAiServerEnvironment,
): StickFigureAiAvailability => {
  if (environment.nodeEnv === "production") {
    return {available: false, reason: "production_forbidden"};
  }
  if (environment.configuredMode === "mock") {
    return {available: true, reason: "available"};
  }
  if (environment.configuredMode === "off") {
    return {available: false, reason: "capability_disabled"};
  }
  if (environment.configuredMode === "live") {
    return {available: false, reason: "temporarily_unavailable"};
  }
  return {available: false, reason: "server_not_configured"};
};

export const getStickFigureAiAvailability = () =>
  resolveStickFigureAiAvailability(readStickFigureAiServerEnvironment());
