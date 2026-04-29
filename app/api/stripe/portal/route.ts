import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthIdentity } from "@/lib/auth";
import { appBaseUrl, getStripe, getSubscriptionByUserId } from "@/lib/billing";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const identity = await getCurrentAuthIdentity();
    if (!identity?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const subscription = await getSubscriptionByUserId(identity.id);
    if (!subscription?.stripeCustomerId) {
      return NextResponse.json({ error: "No Stripe customer found" }, { status: 400 });
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${appBaseUrl(req.nextUrl.origin)}/account`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to open billing portal";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
