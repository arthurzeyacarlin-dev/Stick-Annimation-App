import { sanitizeDrawingAiProjectMemory, type DrawingAiProjectMemory } from "./drawingAiContract.ts";
import { scopeDrawingAiProjectMemoryToProject } from "./drawingAiProjectMemory.ts";

const PROJECT_AI_MEMORY_ROUTE = "/api/drawing-project-ai-memory";

export type DrawingProjectAiMemorySaveResult = "saved" | "rejected-stale" | "failed";

export const loadDrawingProjectAiMemoryFromSupabase = async (projectId: string) => {
  try {
    const response = await fetch(`${PROJECT_AI_MEMORY_ROUTE}?projectId=${encodeURIComponent(projectId)}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") {
      return null;
    }

    return scopeDrawingAiProjectMemoryToProject(
      sanitizeDrawingAiProjectMemory((payload as { memory?: unknown }).memory ?? null),
      projectId,
    );
  } catch {
    return null;
  }
};

export const saveDrawingProjectAiMemoryToSupabase = async (
  projectId: string,
  memory: DrawingAiProjectMemory | null,
) : Promise<DrawingProjectAiMemorySaveResult> => {
  const scopedMemory = scopeDrawingAiProjectMemoryToProject(memory, projectId);
  if (!scopedMemory) {
    return "failed";
  }

  try {
    const response = await fetch(PROJECT_AI_MEMORY_ROUTE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId,
        memory: scopedMemory,
      }),
    });

    if (response.ok) {
      return "saved";
    }

    if (response.status === 409) {
      return "rejected-stale";
    }

    return "failed";
  } catch {
    return "failed";
  }
};

export const deleteDrawingProjectAiMemoryFromSupabase = async (projectId: string) => {
  try {
    const response = await fetch(`${PROJECT_AI_MEMORY_ROUTE}?projectId=${encodeURIComponent(projectId)}`, {
      method: "DELETE",
    });

    return response.ok;
  } catch {
    return false;
  }
};
