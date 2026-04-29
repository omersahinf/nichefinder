import { NextRequest, NextResponse } from "next/server";
import {
  createSavedSearch,
  deleteSavedSearchForUser,
  listSavedSearchesForUser,
  touchSavedSearchForUser,
} from "@/lib/saved-searches";
import { getCurrentAuthIdentity } from "@/lib/auth";
import { enforceQuota } from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const identity = await getCurrentAuthIdentity();
    const savedSearches = await listSavedSearchesForUser(identity?.id);
    return NextResponse.json({ savedSearches });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list saved searches";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as {
      label?: string;
      keyword?: string;
      filtersJson?: Record<string, unknown>;
    };
    const identity = await getCurrentAuthIdentity();
    const quota = await enforceQuota(identity?.id, "save_search");
    if (!quota.allowed) {
      return NextResponse.json(
        { error: quota.reason ?? "Saved search quota exceeded", plan: quota.plan },
        { status: 403 },
      );
    }
    const savedSearches = await createSavedSearch({
      label: body.label ?? "",
      keyword: body.keyword,
      filtersJson: body.filtersJson,
      userId: identity?.id,
    });
    return NextResponse.json({ savedSearches });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save search";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { id?: string };
    const identity = await getCurrentAuthIdentity();
    const savedSearches = await touchSavedSearchForUser(body.id ?? "", identity?.id);
    return NextResponse.json({ savedSearches });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update saved search";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const id = req.nextUrl.searchParams.get("id") ?? "";
    const identity = await getCurrentAuthIdentity();
    const savedSearches = await deleteSavedSearchForUser(id, identity?.id);
    return NextResponse.json({ savedSearches });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete saved search";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
