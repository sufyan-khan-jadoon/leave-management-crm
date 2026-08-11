import type { Metadata } from "next";

import { AttendanceManager } from "@/components/admin/attendance-manager";
import { PageHeader } from "@/components/layout/page-header";
import { auth } from "@/lib/auth/auth";
import { isSuperAdminRole } from "@/lib/enums";

export const metadata: Metadata = { title: "Attendance" };

export default async function AdminAttendancePage() {
  const session = await auth();

  // The layout has already established that this is an administrator. Only the
  // super admin additionally gets the population filter — the API refuses it to
  // anyone else regardless of what is rendered here. Resolved on the server and
  // passed down, exactly as the Staff screen decides its administrator tab.
  const canFilterByPopulation = isSuperAdminRole(session?.user?.role ?? "");

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Who was in the office on a given day. Choose a date to look back; days the office was closed, and people on approved leave, are marked as such rather than counted absent."
      />
      <AttendanceManager canFilterByPopulation={canFilterByPopulation} />
    </>
  );
}
