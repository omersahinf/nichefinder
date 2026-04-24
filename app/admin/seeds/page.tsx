import { notFound } from "next/navigation";
import SeedAdminClient from "./seed-admin-client";

export const dynamic = "force-dynamic";

export default function SeedsAdminPage() {
  if (process.env.ADMIN_UI_ENABLED !== "true") {
    notFound();
  }

  return <SeedAdminClient />;
}
