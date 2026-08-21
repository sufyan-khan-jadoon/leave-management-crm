import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AttendanceChangeLog } from "@/components/admin/attendance-change-log";
import { PageHeader } from "@/components/layout/page-header";
import { auth } from "@/lib/auth/auth";
import { ROUTES } from "@/lib/constants";
import { isSuperAdminRole } from "@/lib/enums";

export const metadata: Metadata = { title: "Attendance changes" };

/**
 * Every historical correction anybody has made, for the super admin alone.
 *
 * **The page checks, not only the nav** — the lesson `staff/[id]/page.tsx`
 * records and the complaints page repeats: hiding a link is presentation, and
 * typing the address bypasses it entirely. `/api/admin/attendance/edits` refuses
 * the same callers independently, so the two agree without either relying on the
 * other. A page is as reachable as an endpoint; gate it the same way.
 *
 * Owner-only rather than delegable, deliberately. `canEditHistoricalAttendance`
 * buys the ability to *make* a correction; reviewing what every administrator has
 * corrected is oversight of them, and an administrator who could read this would
 * be auditing themselves. It is the same argument the reset panel makes for
 * staying with the owner.
 *
 * Redirected rather than shown a refusal, matching Complaints: the whole content
 * of this screen is the thing being withheld, so an ungranted version would be a
 * page whose only content is its own refusal.
 */
export default async function AdminAttendanceChangesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect(ROUTES.adminLogin);
  if (!isSuperAdminRole(session.user.role)) redirect(ROUTES.adminAttendance);

  return (
    <>
      <PageHeader
        title="Attendance changes"
        description="Every past day an administrator has moved between Present, Absent and On leave — who changed what, for whom, and when. Written automatically; nobody types any of it."
      />
      <AttendanceChangeLog />
    </>
  );
}
