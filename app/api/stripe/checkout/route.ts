import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthIdentity } from "@/lib/auth";
import { appBaseUrl, ensureStripeCustomer, getStripe, priceIds } from "@/lib/billing";

type CheckoutPlan = "pro_monthly" | "pro_yearly";

function parsePlan(value: unknown): CheckoutPlan | null {
  return value === "pro_monthly" || value === "pro_yearly" ? value : null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const identity = await getCurrentAuthIdentity();
    if (!identity?.id || !identity.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = (await req.json()) as { plan?: CheckoutPlan };
    const plan = parsePlan(body.plan);
    if (!plan) return NextResponse.json({ error: "Valid plan required" }, { status: 400 });

    const stripe = getStripe();
    const customerId = await ensureStripeCustomer(identity);
    const prices = priceIds();
    const priceId = plan === "pro_monthly" ? prices.proMonthly : prices.proYearly;
    if (!priceId) {
      return NextResponse.json({ error: "Stripe price is not configured" }, { status: 400 });
    }

    const baseUrl = appBaseUrl(req.nextUrl.origin);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${baseUrl}/account?checkout=success`,
      cancel_url: `${baseUrl}/pricing?checkout=cancelled`,
      metadata: {
        userId: identity.id,
        plan,
      },
      subscription_data: {
        metadata: {
          userId: identity.id,
          plan,
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create checkout session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
