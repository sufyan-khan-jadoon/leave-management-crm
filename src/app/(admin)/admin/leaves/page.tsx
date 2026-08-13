import type { Metadata } from "next";

import { AdminLeaveManager } from "@/components/admin/admin-leave-manager";
import { PageHeader } from "@/components/layout/page-header";
import { auth } from "@/lib/auth/auth";
import { populationService } from "@/services/population.service";

export const metadata: Metadata = { title: "Leave requests" };

export default async function AdminLeavesPage() {
  const session = await auth();
  const user = session?.user;

  // The same grant the attendance roster's filter needs, read from the row
  // rather than the session so withdrawing it takes the control off the screen
  // on the next load. Rendering only — `/api/leaves` and its export both refuse
  // the filter regardless of what was drawn.
  const canFilterByPopulation = user
    ? await populationService.mayViewAdminRecords({ id: user.id, role: user.role })
    : false;

  return (
    <>
      <PageHeader
        title="Leave requests"
        description="Search, filter and export leave across the organisation. Requests are decided automatically against the monthly allowance."
      />
      <AdminLeaveManager canFilterByPopulation={canFilterByPopulation} />
    </>
  );
}
