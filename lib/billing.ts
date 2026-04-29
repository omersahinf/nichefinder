import Stripe from "stripe";
import { countTodayTitleGenerations } from "./ai/title-gen";
import { getSupabaseAdmin } from "./supabase";

export type SubscriptionPlan = "free" | "pro_monthly" | "pro_yearly";
export type EntitlementPlan = "free" | "pro";
export type QuotaAction =
  | "search"
  | "save_search"
  | "alert"
  | "export_csv"
  | "api_access"
  | "ai_insights"
  | "title_generation"
  | "idea_generation";

export interface SubscriptionRecord {
  userId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  plan: SubscriptionPlan;
  status: string;
  currentPeriodEnd?: string;
  createdAt: string;
  updatedAt: string;
}

interface SubscriptionRow {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: SubscriptionPlan;
  status: string;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

let stripeClient: Stripe | null = null;

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

const PLAN_LIMITS: Record<EntitlementPlan, Record<QuotaAction, number>> = {
  free: {
    search: 10,
    save_search: 5,
    alert: 0,
    export_csv: 0,
    api_access: 0,
    ai_insights: 0,
    title_generation: 3,
    idea_generation: 0,
  },
  pro: {
    search: Number.POSITIVE_INFINITY,
    save_search: Number.POSITIVE_INFINITY,
    alert: 10,
    export_csv: Number.POSITIVE_INFINITY,
    api_access: Number.POSITIVE_INFINITY,
    ai_insights: Number.POSITIVE_INFINITY,
    title_generation: Number.POSITIVE_INFINITY,
    idea_generation: Number.POSITIVE_INFINITY,
  },
};

export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY missing");

  stripeClient ??= new Stripe(secretKey);
  return stripeClient;
}

export function priceIds() {
  return {
    proMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY?.trim() || "",
    proYearly: process.env.STRIPE_PRICE_PRO_YEARLY?.trim() || "",
  };
}

export function appBaseUrl(fallbackOrigin?: string): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    fallbackOrigin ||
    "http://localhost:3000"
  );
}

const toSubscription = (row: SubscriptionRow): SubscriptionRecord => ({
  userId: row.user_id,
  stripeCustomerId: row.stripe_customer_id ?? undefined,
  stripeSubscriptionId: row.stripe_subscription_id ?? undefined,
  plan: row.plan,
  status: row.status,
  currentPeriodEnd: row.current_period_end ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function entitlementFromSubscription(
  subscription: Pick<SubscriptionRecord, "plan" | "status"> | null | undefined,
): EntitlementPlan {
  if (!subscription) return "free";
  return ACTIVE_STATUSES.has(subscription.status) && subscription.plan !== "free" ? "pro" : "free";
}

export async function getSubscriptionByUserId(userId: string): Promise<SubscriptionRecord | null> {
  const client = getSupabaseAdmin();
  if (!client || !userId) return null;

  const { data, error } = await client
    .from("subscriptions")
    .select(
      "user_id,stripe_customer_id,stripe_subscription_id,plan,status,current_period_end,created_at,updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ? toSubscription(data as SubscriptionRow) : null;
}

async function getSubscriptionByCustomerId(customerId: string): Promise<SubscriptionRecord | null> {
  const client = getSupabaseAdmin();
  if (!client || !customerId) return null;

  const { data, error } = await client
    .from("subscriptions")
    .select(
      "user_id,stripe_customer_id,stripe_subscription_id,plan,status,current_period_end,created_at,updated_at",
    )
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error) throw error;
  return data ? toSubscription(data as SubscriptionRow) : null;
}

export async function ensureStripeCustomer(user: { id: string; email?: string }): Promise<string> {
  const existing = await getSubscriptionByUserId(user.id);
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { userId: user.id },
  });

  await upsertSubscriptionRecord({
    userId: user.id,
    stripeCustomerId: customer.id,
    stripeSubscriptionId: existing?.stripeSubscriptionId,
    plan: existing?.plan ?? "free",
    status: existing?.status ?? "inactive",
    currentPeriodEnd: existing?.currentPeriodEnd,
  });

  return customer.id;
}

export async function upsertSubscriptionRecord(input: {
  userId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  plan: SubscriptionPlan;
  status: string;
  currentPeriodEnd?: string;
}): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const { error } = await client.from("subscriptions").upsert(
    {
      user_id: input.userId,
      stripe_customer_id: input.stripeCustomerId ?? null,
      stripe_subscription_id: input.stripeSubscriptionId ?? null,
      plan: input.plan,
      status: input.status,
      current_period_end: input.currentPeriodEnd ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
}

export function planFromPriceId(priceId?: string | null): SubscriptionPlan {
  const prices = priceIds();
  if (priceId && priceId === prices.proMonthly) return "pro_monthly";
  if (priceId && priceId === prices.proYearly) return "pro_yearly";
  return "free";
}

export async function syncStripeSubscription(
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  const userId =
    subscription.metadata.userId ||
    (customerId ? (await getSubscriptionByCustomerId(customerId))?.userId : undefined);

  if (!userId) throw new Error("Subscription user mapping missing");

  const currentPeriodEnd = subscription.items.data[0]?.current_period_end;

  await upsertSubscriptionRecord({
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    plan: planFromPriceId(subscription.items.data[0]?.price?.id),
    status: subscription.status,
    currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : undefined,
  });
}

export async function cancelStripeSubscription(
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  const userId =
    subscription.metadata.userId ||
    (customerId ? (await getSubscriptionByCustomerId(customerId))?.userId : undefined);

  if (!userId) return;

  const currentPeriodEnd = subscription.items.data[0]?.current_period_end;

  await upsertSubscriptionRecord({
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    plan: "free",
    status: subscription.status,
    currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : undefined,
  });
}

async function countTodaySearches(userId: string): Promise<number> {
  const client = getSupabaseAdmin();
  if (!client) return 0;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count, error } = await client
    .from("searches")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfDay.toISOString());

  if (error) throw error;
  return count ?? 0;
}

async function countRows(table: "saved_searches" | "user_alerts", userId: string): Promise<number> {
  const client = getSupabaseAdmin();
  if (!client) return 0;

  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw error;
  return count ?? 0;
}

export async function enforceQuota(userId: string | undefined, action: QuotaAction): Promise<{
  allowed: boolean;
  plan: EntitlementPlan;
  reason?: string;
}> {
  if (!userId) {
    return action === "export_csv" ||
      action === "alert" ||
      action === "api_access" ||
      action === "ai_insights" ||
      action === "title_generation" ||
      action === "idea_generation"
      ? { allowed: false, plan: "free", reason: "Login required" }
      : { allowed: true, plan: "free" };
  }

  const subscription = await getSubscriptionByUserId(userId);
  const plan = entitlementFromSubscription(subscription);
  const limit = PLAN_LIMITS[plan][action];

  if (!Number.isFinite(limit)) return { allowed: true, plan };

  let used = 0;
  if (action === "search") used = await countTodaySearches(userId);
  if (action === "save_search") used = await countRows("saved_searches", userId);
  if (action === "alert") used = await countRows("user_alerts", userId);
  if (action === "export_csv") used = 0;
  if (action === "title_generation") used = await countTodayTitleGenerations(userId);

  if (used >= limit) {
    return {
      allowed: false,
      plan,
      reason:
        action === "search"
          ? `Free plan allows ${limit} searches per day`
          : action === "save_search"
            ? `Free plan allows ${limit} saved searches`
            : action === "alert"
              ? `Your current plan allows ${limit} alerts`
              : action === "export_csv"
                ? "Export CSV requires Pro"
                : action === "api_access"
                  ? "API access requires Pro"
                : action === "ai_insights"
                  ? "AI analysis requires Pro"
                : action === "title_generation"
                  ? `Free plan allows ${limit} title generations per day`
                  : "Idea finder requires Pro",
    };
  }

  return { allowed: true, plan };
}
