import { NextRequest, NextResponse } from "next/server";
import { createAlert, deleteAlert, listAlerts } from "@/lib/alerts";
import { requireAdminApi } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard) return guard;

  try {
    const alerts = await listAlerts();
    return NextResponse.json({ alerts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list alerts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard) return guard;

  try {
    const body = (await req.json()) as {
      keyword?: string;
      minOutlier?: number;
      minSubs?: number;
      maxSubs?: number;
      email?: string;
    };
    const alerts = await createAlert({
      keyword: body.keyword ?? "",
      minOutlier: Number(body.minOutlier ?? 2),
      minSubs: Number(body.minSubs ?? 0),
      maxSubs: Number(body.maxSubs ?? 10_000_000),
      email: body.email ?? "",
    });
    return NextResponse.json({ alerts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create alert";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard) return guard;

  try {
    const id = req.nextUrl.searchParams.get("id") ?? "";
    const alerts = await deleteAlert(id);
    return NextResponse.json({ alerts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete alert";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
