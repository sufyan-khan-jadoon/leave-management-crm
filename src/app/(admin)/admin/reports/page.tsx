import type { Metadata } from "next";

import { ReportBuilder } from "@/components/admin/report-builder";
import { PageHeader } from "@/components/layout/page-header";
import { auth } from "@/lib/auth/auth";
import { populationService } from "@/services/population.service";

export const metadata: Metadata = { title: "Reports" };

/**
 * The workforce report.
 *
 * The layout has already established that this is an administrator. Reporting
 * needs `canViewAdminRecords` on top of that — the grant an HR administrator
 * holds — and it is read from the row rather than from the session, so a
 * withdrawn grant takes the screen away on the next load rather than when a
 * week-old token expires.
 *
 * This decides what is **rendered**, never what is allowed: `/api/admin/reports`
 * and its export both ask `populationService.assertMayReport` again on every
 * request, so a hand-written POST is refused regardless of what appeared here.
 * The page is shown to every administrator rather than hidden from the sidebar,
 * the same courtesy the Send email screen extends — an item that silently
 * vanishes reads as a broken sidebar rather than as a permission.
 */
export default async function AdminReportsPage() {
  const session = await auth();
  const user = session?.user;

  const canReport = user
    ? await populationService.mayViewAdminRecords({ id: user.id, role: user.role })
    : false;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Attendance, absence and leave across any period, for anyone. Every figure is judged by the same rules the attendance screen uses — office closures and weekly days off count as neither present nor absent, and cost nobody a leave."
      />
      <ReportBuilder canReport={canReport} />
    </>
  );
}
