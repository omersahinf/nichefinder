import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthIdentity } from "@/lib/auth";
import { entitlementFromSubscription, getSubscriptionByUserId } from "@/lib/billing";
import { countTodayTitleGenerations, generateTitlesForNiche } from "@/lib/ai/title-gen";

const FREE_DAILY_LIMIT = 3;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const identity = await getCurrentAuthIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { keyword?: string };
  const keyword = body.keyword?.trim() || "";
  if (!keyword) {
    return NextResponse.json({ error: "Keyword is required" }, { status: 400 });
  }

  try {
    const subscription = await getSubscriptionByUserId(identity.id);
    const plan = entitlementFromSubscription(subscription);
    const usedToday = await countTodayTitleGenerations(identity.id);

    if (plan !== "pro" && usedToday >= FREE_DAILY_LIMIT) {
      return NextResponse.json(
        {
          error: `Free plan allows ${FREE_DAILY_LIMIT} title generations per day`,
          plan,
          usedToday,
          remainingToday: 0,
        },
        { status: 403 },
      );
    }

    const generation = await generateTitlesForNiche({
      userId: identity.id,
      keyword,
    });
    const nextUsedToday = usedToday + 1;

    return NextResponse.json({
      generation,
      plan,
      usedToday: nextUsedToday,
      remainingToday: plan === "pro" ? null : Math.max(0, FREE_DAILY_LIMIT - nextUsedToday),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "Unable to generate titles";

    const status =
      message === "ANTHROPIC_API_KEY missing"
        ? 503
        : message === "No cached niche snapshot available for this keyword" ||
            message === "Not enough outlier titles available for this niche"
          ? 404
          : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
