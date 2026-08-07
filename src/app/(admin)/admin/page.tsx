import type { Metadata } from "next";

import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { auth } from "@/lib/auth/auth";
import { isSuperAdminRole } from "@/lib/enums";

export const metadata: Metadata = { title: "Admin overview" };

export default async function AdminDashboardPage() {
  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0] ?? "Admin";

  // Only the super admin may look at administrators, so only they get the
  // switch. This decides what is rendered, never what is allowed — the stats
  // route refuses the administrator population to anyone else regardless.
  const canViewAdmins = isSuperAdminRole(session?.user?.role ?? "");

  return <AdminDashboard firstName={firstName} canViewAdmins={canViewAdmins} />;
}
