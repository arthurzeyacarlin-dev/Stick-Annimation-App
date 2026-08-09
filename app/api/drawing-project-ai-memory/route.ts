import { sanitizeDrawingAiProjectMemory } from "@/src/lib/ai/drawingAiContract";
import { scopeDrawingAiProjectMemoryToProject } from "@/src/lib/ai/drawingAiProjectMemory";
import { shouldRejectStaleDrawingProjectAiMemorySave } from "@/src/lib/ai/drawingProjectAiMemoryRouteUtils";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/src/lib/dbAdmin";
import { NextRequest, NextResponse } from "next/server";

/**
 * Supabase table: public.drawing_project_ai_memory
 *
 * Suggested SQL:
 * create table if not exists public.drawing_project_ai_memory (
 *   project_id text primary key,
 *   memory jsonb not null,
 *   updated_at timestamptz not null default timezone('utc', now())
 * );
 */
const DRAWING_PROJECT_AI_MEMORY_TABLE = "drawing_project_ai_memory";

const readProjectId = (request: NextRequest) => request.nextUrl.searchParams.get("projectId")?.trim() ?? "";

const scopeIncomingProjectAiMemory = (memory: unknown, projectId: string) =>
  scopeDrawingAiProjectMemoryToProject(sanitizeDrawingAiProjectMemory(memory), projectId);

export async function GET(request: NextRequest) {
  const projectId = readProjectId(request);
  if (!projectId) {
    return NextResponse.json({ memory: null, synced: false }, { status: 400 });
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ memory: null, synced: false }, { status: 200 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from(DRAWING_PROJECT_AI_MEMORY_TABLE)
      .select("memory")
      .eq("project_id", projectId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        memory: scopeDrawingAiProjectMemoryToProject(
          sanitizeDrawingAiProjectMemory((data as { memory?: unknown } | null)?.memory ?? null),
          projectId,
        ),
        synced: true,
      },
      { status: 200 },
    );
  } catch (error) {
    console.warn("Drawing project AI memory load failed.", error);
    return NextResponse.json({ memory: null, synced: false }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { projectId?: unknown; memory?: unknown } | null;
  const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
  const memory = scopeIncomingProjectAiMemory(body?.memory ?? null, projectId);

  if (!projectId || !memory) {
    return NextResponse.json({ saved: false, synced: false }, { status: 400 });
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ saved: false, synced: false }, { status: 200 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data: existingRecord, error: existingRecordError } = await supabase
      .from(DRAWING_PROJECT_AI_MEMORY_TABLE)
      .select("memory")
      .eq("project_id", projectId)
      .maybeSingle();

    if (existingRecordError) {
      throw existingRecordError;
    }

    if (shouldRejectStaleDrawingProjectAiMemorySave({
      existingMemory: (existingRecord as { memory?: unknown } | null)?.memory ?? null,
      incomingMemory: memory,
    })) {
      return NextResponse.json({ saved: false, synced: true, rejected: "stale-memory" }, { status: 409 });
    }

    const { error } = await supabase.from(DRAWING_PROJECT_AI_MEMORY_TABLE).upsert(
      {
        project_id: projectId,
        memory,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "project_id",
      },
    );

    if (error) {
      throw error;
    }

    return NextResponse.json({ saved: true, synced: true }, { status: 200 });
  } catch (error) {
    console.warn("Drawing project AI memory save failed.", error);
    return NextResponse.json({ saved: false, synced: false }, { status: 200 });
  }
}

export async function DELETE(request: NextRequest) {
  const projectId = readProjectId(request);
  if (!projectId) {
    return NextResponse.json({ deleted: false, synced: false }, { status: 400 });
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ deleted: false, synced: false }, { status: 200 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from(DRAWING_PROJECT_AI_MEMORY_TABLE).delete().eq("project_id", projectId);
    if (error) {
      throw error;
    }

    return NextResponse.json({ deleted: true, synced: true }, { status: 200 });
  } catch (error) {
    console.warn("Drawing project AI memory delete failed.", error);
    return NextResponse.json({ deleted: false, synced: false }, { status: 200 });
  }
}
