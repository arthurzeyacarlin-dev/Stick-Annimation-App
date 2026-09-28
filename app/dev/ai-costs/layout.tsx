import { getServerAccountSession } from "@/src/lib/account/access";
import { redirect } from "next/navigation";

export default async function DevAiCostsLayout({ children }: { children: React.ReactNode }) {
  if (!await getServerAccountSession()) redirect("/");
  return children;
}
