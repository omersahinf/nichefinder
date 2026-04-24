import { NextResponse } from "next/server";
import { getTodayQuotaUsage } from "@/lib/cache";

export async function GET(): Promise<NextResponse> {
  const quota = await getTodayQuotaUsage();
  return NextResponse.json(quota);
}
