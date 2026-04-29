import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthIdentity } from "@/lib/auth";
import { enforceQuota } from "@/lib/billing";
import { getNicheInsight } from "@/lib/ai/niche-insights";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const keyword = req.nextUrl.searchParams.get("q")?.trim() || "";
  const forceRefresh = req.nextUrl.searchParams.get("force") === "1";

  if (!keyword) {
    return NextResponse.json({ error: "Missing q parameter" }, { status: 400 });
  }

  const identity = await getCurrentAuthIdentity();
  const quotaCheck = await enforceQuota(identity?.id, "ai_insights");

  if (!quotaCheck.allowed) {
    return NextResponse.json(
      {
        error: quotaCheck.reason ?? "AI analysis requires Pro",
        plan: quotaCheck.plan,
        loginRequired: !identity,
      },
      { status: identity ? 403 : 401 },
    );
  }

  try {
    const insight = await getNicheInsight(keyword, { forceRefresh });
    if (!insight) {
      return NextResponse.json(
        { error: "No cached niche snapshot available for this keyword" },
        { status: 404 },
      );
    }

    return NextResponse.json({ insight });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "Unable to generate AI analysis";

    const status = message === "ANTHROPIC_API_KEY missing" ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
