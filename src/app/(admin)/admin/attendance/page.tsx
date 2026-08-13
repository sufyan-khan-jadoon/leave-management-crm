import type { Metadata } from "next";

import { AttendanceManager } from "@/components/admin/attendance-manager";
import { PageHeader } from "@/components/layout/page-header";
import { auth } from "@/lib/auth/auth";
import { populationService } from "@/services/population.service";

export const metadata: Metadata = { title: "Attendance" };

export default async function AdminAttendancePage() {
  const session = await auth();
  const user = session?.user;

  // The layout has already established that this is an administrator. The
  // population filter needs `canViewAdminRecords` on top of that, and the grant
  // is read from the row rather than from the session — a withdrawn grant has to
  // take the filter away on the next load, not when a week-old token expires.
  // This decides what is rendered, never what is allowed: the roster and its CSV
  // export both refuse the filter regardless of what appeared on screen.
  const canFilterByPopulation = user
    ? await populationService.mayViewAdminRecords({ id: user.id, role: user.role })
    : false;

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
