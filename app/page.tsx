import { AccountEntry } from "@/src/components/account/AccountEntry";
import ExistingHome from "@/src/components/account/ExistingHome";
import { getServerAccountSession } from "@/src/lib/account/access";

export default async function Page() {
  const session = await getServerAccountSession();
  return session ? <ExistingHome /> : <AccountEntry />;
}
