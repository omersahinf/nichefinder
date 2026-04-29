import { notFound } from "next/navigation";
import { getCurrentAdminIdentity } from "@/lib/auth";
import SeedAdminClient from "./seed-admin-client";

export const dynamic = "force-dynamic";

export default async function SeedsAdminPage() {
  if (process.env.ADMIN_UI_ENABLED !== "true") {
    notFound();
  }
  if (process.env.ADMIN_EMAILS && !(await getCurrentAdminIdentity())) {
    notFound();
  }

  return <SeedAdminClient />;
}
