import { NextResponse } from "next/server";
import { getCurrentAdminIdentity } from "./auth";

export async function requireAdminApi(): Promise<NextResponse | null> {
  if (process.env.ADMIN_UI_ENABLED !== "true") {
    return NextResponse.json({ error: "Admin UI disabled" }, { status: 404 });
  }

  if (process.env.ADMIN_EMAILS && !(await getCurrentAdminIdentity())) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  return null;
}
