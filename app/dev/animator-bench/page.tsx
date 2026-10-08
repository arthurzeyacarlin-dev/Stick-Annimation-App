// SPEC-0017 Phase 3 test bench (dev only, signed in): runs the bench prompts through Terra → the engine and plays
// each result, with cost, time, repairs and good / OK / bad ratings.
import { notFound, redirect } from "next/navigation";
import { getServerAccountSession } from "@/src/lib/account/access";
import { BenchClient } from "./BenchClient";

export const dynamic = "force-dynamic";

export default async function AnimatorBenchPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  if (!await getServerAccountSession()) redirect("/");
  return <BenchClient />;
}
