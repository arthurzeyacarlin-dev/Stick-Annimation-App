import OpenAI from "openai";

let openAiClientInstance: OpenAI | null = null;

type OpenAiClientPurpose = "generate-frames" | "terra-conversation";

export const getOpenAiClient = (purpose: OpenAiClientPurpose = "generate-frames") => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(purpose === "terra-conversation"
      ? "Terra conversation is unavailable because this server is missing its OpenAI API key."
      : "OpenAI API key is missing. Set OPENAI_API_KEY so Generate Frames can reach the AI route.");
  }

  if (openAiClientInstance == null) {
    openAiClientInstance = new OpenAI({
      apiKey,
    });
  }

  return openAiClientInstance;
};
