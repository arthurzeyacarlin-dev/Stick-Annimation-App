import { ResetPasswordScreen } from "@/src/components/account/ResetPasswordScreen";

// SPEC-0020 Phase 1: the page the "reset your password" email links to (works signed out).
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;
  const linkBroken = typeof params.error === "string";
  return <ResetPasswordScreen token={linkBroken ? null : token} />;
}
