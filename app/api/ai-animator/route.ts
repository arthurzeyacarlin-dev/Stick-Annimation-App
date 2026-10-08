import { after, NextResponse } from "next/server";
import { normalizeAiAnimatorRequest } from "@/src/lib/ai/aiAnimatorContract";
import { AiAnimatorJobService } from "@/src/lib/ai/aiAnimatorJobService";
import { generateAiAnimatorReply } from "@/src/lib/openai/generateAiAnimatorReply";
import { recordUsageEvent } from "@/src/lib/usage-journal/usageJournalRuntime";
import { requireAccountRequest } from "@/src/lib/account/access";
import { accountProjectBelongsToOwner } from "@/src/lib/account/projectServer";
import { flushAccountUsageWrites, withAccountUsageOwner } from "@/src/lib/account-usage/accountUsageStore";
import { sharedJobStoreFromEnv } from "@/src/lib/ai-jobs/postgresSharedJobStore";

export const runtime = "nodejs";
// Online the AI call keeps running after the 202 reply (Next's after()); the job's own deadline is 90 s.
export const maxDuration = 120;

const globalJobs = globalThis as typeof globalThis & { diamondAiAnimatorJobs?: AiAnimatorJobService };
const jobs = globalJobs.diamondAiAnimatorJobs ?? new AiAnimatorJobService(generateAiAnimatorReply, recordUsageEvent);
globalJobs.diamondAiAnimatorJobs = jobs;

const safeError = (error: unknown) => {
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : 500;
  const message = error instanceof Error ? error.message : "AI Animator could not start the request.";
  return NextResponse.json({ error: message }, { status });
};

// Online only: a database problem is reported in plain words, never with the database's own error text.
const sharedOnly = <T>(work: () => Promise<T>) => work().catch((error: unknown) => {
  if (typeof error === "object" && error !== null && "status" in error) throw error;
  throw Object.assign(new Error("AI Animator could not reach its job storage. No animation changed. Try again."), { status: 503 });
});

export async function POST(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
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
    if (!await accountProjectBelongsToOwner(access.session.user.id, normalized.workspace.projectId)) {
      return NextResponse.json({ error: "Project is not available to this account." }, { status: 403 });
    }
    const ownerId = access.session.user.id;
    const store = sharedJobStoreFromEnv();
    if (!store) {
      return NextResponse.json(withAccountUsageOwner(ownerId, () => jobs.submit(normalized, ownerId)), { status: 202 });
    }
    // Online: job state lives in the shared table, and after() keeps the AI call alive past this reply.
    const { snapshot, work } = await withAccountUsageOwner(ownerId, () => sharedOnly(() => jobs.submitShared(store, normalized, ownerId)));
    after(async () => { await work; await flushAccountUsageWrites(); }); // its usage record is saved before the server copy stops
    return NextResponse.json(snapshot, { status: 202 });
  } catch (error) {
    return safeError(error);
  }
}

export async function GET(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId")?.trim() ?? "";
  const projectId = url.searchParams.get("projectId")?.trim() ?? "";
  if (!jobId || !projectId) {
    return NextResponse.json({ error: "Job and project identity are required." }, { status: 400 });
  }
  if (!await accountProjectBelongsToOwner(access.session.user.id, projectId)) {
    return NextResponse.json({ error: "Project is not available to this account." }, { status: 403 });
  }
  const store = sharedJobStoreFromEnv();
  let snapshot;
  try {
    snapshot = store
      ? await sharedOnly(() => jobs.getShared(store, jobId, projectId, access.session.user.id))
      : jobs.get(jobId, projectId, access.session.user.id);
  } catch (error) {
    return safeError(error);
  }
  return snapshot
    ? NextResponse.json(snapshot)
    : NextResponse.json({ error: "This AI Animator job is no longer available. No animation changed." }, { status: 404 });
}

export async function DELETE(request: Request) {
  const access = await requireAccountRequest(request);
  if ("response" in access) return access.response;
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
  if (!await accountProjectBelongsToOwner(access.session.user.id, projectId)) {
    return NextResponse.json({ error: "Project is not available to this account." }, { status: 403 });
  }
  const ownerId = access.session.user.id;
  const store = sharedJobStoreFromEnv();
  let snapshot;
  try {
    snapshot = store
      ? await withAccountUsageOwner(ownerId, () => sharedOnly(() => jobs.cancelShared(store, jobId, projectId, ownerId)))
      : withAccountUsageOwner(ownerId, () => jobs.cancel(jobId, projectId, ownerId));
  } catch (error) {
    return safeError(error);
  }
  return snapshot
    ? NextResponse.json(snapshot)
    : NextResponse.json({ error: "This AI Animator job is no longer available." }, { status: 404 });
}
