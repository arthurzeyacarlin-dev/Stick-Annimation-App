import { execFile } from "node:child_process";
import { NextResponse } from "next/server";
import { isTrustedAccountRequest } from "@/src/lib/account/accountConfig";

// (Nov 4 PM12) DEVELOPMENT ONLY: runs the engine's AI checker probe (ltx-effects/v1k/ai_checker.py <job.json>) with the server's own AI key,
// so the reliability test on known videos never needs the key outside the server. 404 outside `next dev`.
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return new NextResponse(null, { status: 404 });
  if (!isTrustedAccountRequest(request)) return new NextResponse(null, { status: 404 });   // (Nov 12 security) this computer, same-site only: never a web page or the network
  const body = await request.json().catch(() => null) as { job?: unknown } | null;
  const root = process.env.DIAMOND_ENGINE_ROOT;
  if (!root || typeof body?.job !== "string" || !body.job.endsWith(".json")) return NextResponse.json({ error: "job (a .json path) and DIAMOND_ENGINE_ROOT needed" }, { status: 400 });
  const out = await new Promise<string>((resolve) => execFile(`${root}/ltx-effects/video-ai-check/.venv/bin/python`, [`${root}/ltx-effects/v1k/ai_checker.py`, body.job as string],
    { env: { PATH: process.env.PATH, HOME: process.env.HOME, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, CLAUDE_TEST_BUDGET_USD: process.env.CLAUDE_TEST_BUDGET_USD } as unknown as NodeJS.ProcessEnv, timeout: 600_000, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" },
    (error: Error | null, stdout: string, stderr: string) => resolve(stdout || String(stderr || error).slice(-2000))));
  return NextResponse.json({ lines: out.trim().split("\n") });
}
