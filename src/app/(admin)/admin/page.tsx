import type { Metadata } from "next";

import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { auth } from "@/lib/auth/auth";
import { populationService } from "@/services/population.service";

export const metadata: Metadata = { title: "Admin overview" };

export default async function AdminDashboardPage() {
  const session = await auth();
  const user = session?.user;
  const firstName = user?.name?.split(" ")[0] ?? "Admin";

  // The switch needs `canViewAdminRecords`, the same grant the attendance
  // roster's filter needs, and it is read from the row rather than the session
  // so withdrawing it takes the switch away on the next load. This decides what
  // is rendered, never what is allowed — the stats route refuses the
  // administrator population regardless of what appeared on screen.
  const canViewAdmins = user
    ? await populationService.mayViewAdminRecords({ id: user.id, role: user.role })
    : false;

  return <AdminDashboard firstName={firstName} canViewAdmins={canViewAdmins} />;
}
