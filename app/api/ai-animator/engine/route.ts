import { NextResponse } from "next/server";
import { readJson } from "@/src/lib/account/readJson";
import { requireAccountRequest } from "@/src/lib/account/access";
import { accountProjectBelongsToOwner } from "@/src/lib/account/projectServer";
import { cancelJob, engineBlocksServerEnabled, getJob, planStory, startBlock } from "@/src/lib/ai/engineBlocks/engineBlocksServer";

// AI Animator engine blocks (switch DIAMOND_ENGINE_BLOCKS=1, default OFF -> 404). Same account + project checks as
// /api/ai-animator. The director (PM plan file, Luna, or the blind contest's Director A/B) lives in engineBlocksServer.ts.
export const runtime = "nodejs";

const off = () => NextResponse.json({ error: "Not found." }, { status: 404 });
const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null);

async function owner(request: Request, projectId: string | null) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return { response: access.response };
  if (!projectId) return { response: NextResponse.json({ error: "Project identity is required." }, { status: 400 }) };
  if (!await accountProjectBelongsToOwner(access.session.user.id, projectId)) {
    return { response: NextResponse.json({ error: "Project is not available to this account." }, { status: 403 }) };
  }
  return { ownerId: access.session.user.id };
}

// POST { action: "plan", projectId, message } -> the story plan in blocks
// POST { action: "make", projectId, storyId, blockIndex } -> an engine job
export async function POST(request: Request) {
  if (!engineBlocksServerEnabled()) return off();
  let body: Record<string, unknown>;
  try { body = await readJson(request); } catch { return NextResponse.json({ error: "Request JSON is invalid." }, { status: 400 }); }
  const projectId = text(body.projectId, 256);
  const who = await owner(request, projectId);
  if ("response" in who) return who.response;
  if (body.action === "plan") {
    const message = text(body.message, 4000);
    if (!message) return NextResponse.json({ error: "Say what should happen in the story." }, { status: 400 });
    const letter = body.director === "A" || body.director === "B" ? body.director : null;
    return NextResponse.json(await planStory(message, who.ownerId, projectId!, letter));
  }
  if (body.action === "make") {
    const storyId = text(body.storyId, 128);
    const blockIndex = Number(body.blockIndex);
    if (!storyId || !Number.isSafeInteger(blockIndex) || blockIndex < 0) return NextResponse.json({ error: "Story and block are required." }, { status: 400 });
    const started = startBlock(storyId, blockIndex, who.ownerId, projectId!);
    return started.ok ? NextResponse.json(started.job, { status: 202 }) : NextResponse.json({ error: started.message }, { status: started.status });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export async function GET(request: Request) {
  if (!engineBlocksServerEnabled()) return off();
  const url = new URL(request.url);
  const who = await owner(request, url.searchParams.get("projectId")?.trim() || null);
  if ("response" in who) return who.response;
  const job = getJob(url.searchParams.get("jobId")?.trim() ?? "", who.ownerId, url.searchParams.get("projectId")!.trim());
  return job ? NextResponse.json(job) : NextResponse.json({ error: "This engine job is no longer available. Nothing was added." }, { status: 404 });
}

export async function DELETE(request: Request) {
  if (!engineBlocksServerEnabled()) return off();
  let body: Record<string, unknown>;
  try { body = await readJson(request); } catch { return NextResponse.json({ error: "Request JSON is invalid." }, { status: 400 }); }
  const projectId = text(body.projectId, 256);
  const who = await owner(request, projectId);
  if ("response" in who) return who.response;
  const job = cancelJob(text(body.jobId, 128) ?? "", who.ownerId, projectId!);
  return job ? NextResponse.json(job) : NextResponse.json({ error: "This engine job is no longer available." }, { status: 404 });
}
