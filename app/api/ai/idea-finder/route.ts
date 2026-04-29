import { NextRequest, NextResponse } from "next/server";
import { generateIdeasForNiche } from "@/lib/ai/idea-finder";
import { getCurrentAuthIdentity } from "@/lib/auth";
import { enforceQuota } from "@/lib/billing";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const identity = await getCurrentAuthIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  const quota = await enforceQuota(identity.id, "idea_generation");
  if (!quota.allowed) {
    return NextResponse.json(
      {
        error: quota.reason ?? "Idea finder requires Pro",
        plan: quota.plan,
      },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { keyword?: string };
  const keyword = body.keyword?.trim() || "";
  if (!keyword) {
    return NextResponse.json({ error: "Keyword is required" }, { status: 400 });
  }

  try {
    const generation = await generateIdeasForNiche({
      userId: identity.id,
      keyword,
    });

    return NextResponse.json({
      generation,
      plan: quota.plan,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "Unable to generate ideas";

    const status =
      message === "ANTHROPIC_API_KEY missing"
        ? 503
        : message === "No cached niche snapshot available for this keyword" ||
            message === "Not enough outlier examples available for this niche"
          ? 404
          : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
