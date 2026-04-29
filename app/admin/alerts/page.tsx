import { notFound } from "next/navigation";
import { getCurrentAdminIdentity } from "@/lib/auth";
import AlertsAdminClient from "./alerts-admin-client";

export const dynamic = "force-dynamic";

export default async function AlertsAdminPage() {
  if (process.env.ADMIN_UI_ENABLED !== "true") {
    notFound();
  }
  if (process.env.ADMIN_EMAILS && !(await getCurrentAdminIdentity())) {
    notFound();
  }

  return <AlertsAdminClient />;
}
