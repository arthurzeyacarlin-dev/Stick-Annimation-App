import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  DEV_AI_COST_DASHBOARD_ROUTE,
  isDevAiCostDashboardEnabledForRequestHost,
  setDevAiDashboardBaseline,
} from "@/src/lib/ai/devAiCostDashboard";

const getSafeReturnTo = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") {
    return DEV_AI_COST_DASHBOARD_ROUTE;
  }

  const normalizedValue = value.trim();
  return normalizedValue.startsWith(DEV_AI_COST_DASHBOARD_ROUTE) ? normalizedValue : DEV_AI_COST_DASHBOARD_ROUTE;
};

export async function POST(request: Request) {
  const requestHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!isDevAiCostDashboardEnabledForRequestHost(requestHost)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const formData = await request.formData();
  const redirectPath = getSafeReturnTo(formData.get("returnTo"));

  await setDevAiDashboardBaseline(new Date());
  revalidatePath(DEV_AI_COST_DASHBOARD_ROUTE);

  return NextResponse.redirect(new URL(redirectPath, request.url));
}
