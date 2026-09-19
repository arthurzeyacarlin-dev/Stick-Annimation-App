import { NextResponse } from "next/server";
import { normalizeAiAnimatorRequest } from "@/src/lib/ai/aiAnimatorContract";
import { AiAnimatorJobService } from "@/src/lib/ai/aiAnimatorJobService";
import { generateAiAnimatorReply } from "@/src/lib/openai/generateAiAnimatorReply";

export const runtime = "nodejs";

const globalJobs = globalThis as typeof globalThis & { diamondAiAnimatorJobs?: AiAnimatorJobService };
const jobs = globalJobs.diamondAiAnimatorJobs ?? new AiAnimatorJobService(generateAiAnimatorReply);
globalJobs.diamondAiAnimatorJobs = jobs;

const safeError = (error: unknown) => {
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : 500;
  const message = error instanceof Error ? error.message : "AI Animator could not start the request.";
  return NextResponse.json({ error: message }, { status });
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "AI Animator request JSON is invalid." }, { status: 400 });
  }
  const normalized = normalizeAiAnimatorRequest(body);
  if (!normalized) {
    return NextResponse.json({ error: "AI Animator request is invalid or too large." }, { status: 400 });
  }
  try {
    return NextResponse.json(jobs.submit(normalized), { status: 202 });
  } catch (error) {
    return safeError(error);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId")?.trim() ?? "";
  const projectId = url.searchParams.get("projectId")?.trim() ?? "";
  if (!jobId || !projectId) {
    return NextResponse.json({ error: "Job and project identity are required." }, { status: 400 });
  }
  const snapshot = jobs.get(jobId, projectId);
  return snapshot
    ? NextResponse.json(snapshot)
    : NextResponse.json({ error: "This AI Animator job is no longer available. No animation changed." }, { status: 404 });
}

export async function DELETE(request: Request) {
  let body: { jobId?: unknown; projectId?: unknown } | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cancellation request JSON is invalid." }, { status: 400 });
  }
  const jobId = typeof body?.jobId === "string" ? body.jobId.trim() : "";
  const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
  if (!jobId || !projectId) {
    return NextResponse.json({ error: "Job and project identity are required." }, { status: 400 });
  }
  const snapshot = jobs.cancel(jobId, projectId);
  return snapshot
    ? NextResponse.json(snapshot)
    : NextResponse.json({ error: "This AI Animator job is no longer available." }, { status: 404 });
}
