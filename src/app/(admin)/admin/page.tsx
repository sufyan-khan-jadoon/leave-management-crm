import type { Metadata } from "next";

import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { auth } from "@/lib/auth/auth";

export const metadata: Metadata = { title: "Admin overview" };

export default async function AdminDashboardPage() {
  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0] ?? "Admin";

  return <AdminDashboard firstName={firstName} />;
}
