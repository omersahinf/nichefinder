import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { getCurrentAuthIdentity } from "@/lib/auth";
import {
  listThumbnailPatterns,
  computePatternSummary,
  upsertThumbnailPattern,
  deleteThumbnailPattern,
  type ThumbnailLabel,
} from "@/lib/thumbnail-patterns";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("q")?.trim();

  if (!keyword) {
    return NextResponse.json({ error: "Missing keyword" }, { status: 400 });
  }

  const patterns = await listThumbnailPatterns(keyword);
  const summary = computePatternSummary(patterns);

  return NextResponse.json({
    patterns,
    summary,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const adminGuard = await requireAdminApi();
  if (adminGuard) return adminGuard;

  const identity = await getCurrentAuthIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const keyword = body.keyword?.trim();
  const videoId = body.videoId?.trim();
  const labels = body.labels as ThumbnailLabel[] | undefined;
  const notes = body.notes?.trim() ?? null;

  if (!keyword || !videoId) {
    return NextResponse.json({ error: "Missing keyword or videoId" }, { status: 400 });
  }

  if (!Array.isArray(labels)) {
    return NextResponse.json({ error: "Labels must be an array" }, { status: 400 });
  }

  try {
    const pattern = await upsertThumbnailPattern(keyword, videoId, labels, notes, identity.id);

    return NextResponse.json({ pattern });
  } catch (error) {
    console.error("[thumbnail-patterns] POST error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save pattern" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const adminGuard = await requireAdminApi();
  if (adminGuard) return adminGuard;

  const identity = await getCurrentAuthIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();

  if (!id) {
    return NextResponse.json({ error: "Missing pattern id" }, { status: 400 });
  }

  try {
    await deleteThumbnailPattern(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[thumbnail-patterns] DELETE error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete pattern" },
      { status: 500 },
    );
  }
}