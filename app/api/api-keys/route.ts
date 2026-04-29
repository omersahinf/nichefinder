import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthIdentity } from "@/lib/auth";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api-keys";
import { enforceQuota } from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const identity = await getCurrentAuthIdentity();
    if (!identity?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const quota = await enforceQuota(identity.id, "api_access");
    if (!quota.allowed) {
      return NextResponse.json(
        { error: quota.reason ?? "API access requires Pro", plan: quota.plan },
        { status: 403 },
      );
    }

    const keys = await listApiKeys(identity.id);
    return NextResponse.json({ keys });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list API keys";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const identity = await getCurrentAuthIdentity();
    if (!identity?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const quota = await enforceQuota(identity.id, "api_access");
    if (!quota.allowed) {
      return NextResponse.json(
        { error: quota.reason ?? "API access requires Pro", plan: quota.plan },
        { status: 403 },
      );
    }

    const body = (await req.json()) as { label?: string };
    const { apiKey, keys } = await createApiKey(identity.id, body.label ?? "");
    return NextResponse.json({ apiKey, keys });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create API key";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const identity = await getCurrentAuthIdentity();
    if (!identity?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const id = req.nextUrl.searchParams.get("id") ?? "";
    const keys = await revokeApiKey(identity.id, id);
    return NextResponse.json({ keys });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to revoke API key";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
