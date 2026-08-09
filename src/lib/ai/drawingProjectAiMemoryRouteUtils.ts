import { sanitizeDrawingAiProjectMemory } from "./drawingAiContract.ts";

export const shouldRejectStaleDrawingProjectAiMemorySave = ({
  existingMemory,
  incomingMemory,
}: {
  existingMemory: unknown;
  incomingMemory: unknown;
}) => {
  const sanitizedExistingMemory = sanitizeDrawingAiProjectMemory(existingMemory);
  const sanitizedIncomingMemory = sanitizeDrawingAiProjectMemory(incomingMemory);
  if (!sanitizedExistingMemory || !sanitizedIncomingMemory) {
    return false;
  }

  const existingUpdatedAt = Date.parse(sanitizedExistingMemory.lastUpdatedAt);
  const incomingUpdatedAt = Date.parse(sanitizedIncomingMemory.lastUpdatedAt);
  if (!Number.isFinite(existingUpdatedAt) || !Number.isFinite(incomingUpdatedAt)) {
    return false;
  }

  return existingUpdatedAt > incomingUpdatedAt;
};
