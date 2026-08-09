import OpenAI from "openai";

let openAiClientInstance: OpenAI | null = null;

export const getOpenAiClient = () => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OpenAI API key is missing. Set OPENAI_API_KEY so Generate Frames can reach the AI route.");
  }

  if (openAiClientInstance == null) {
    openAiClientInstance = new OpenAI({
      apiKey,
    });
  }

  return openAiClientInstance;
};
