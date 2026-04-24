import { notFound } from "next/navigation";
import AlertsAdminClient from "./alerts-admin-client";

export const dynamic = "force-dynamic";

export default function AlertsAdminPage() {
  if (process.env.ADMIN_UI_ENABLED !== "true") {
    notFound();
  }

  return <AlertsAdminClient />;
}
