import type { Metadata } from "next";

import { EmployeeComplaints } from "@/components/complaints/employee-complaints";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Complaints" };

/**
 * Everybody's own complaints, administrators included.
 *
 * No session is read here and no id is passed down: `/api/complaints` is scoped
 * to the signed-in account with no parameter that could widen it, so unlike the
 * leave history — which takes an `employeeId` and would otherwise hand an admin
 * the whole roster — there is nothing for this page to get wrong.
 */
export default function ComplaintsPage() {
  return (
    <>
      <PageHeader
        title="Complaints"
        description="Raise something that needs attention, and follow what happens to it. Only the administrators who handle complaints can see what you write."
      />
      <EmployeeComplaints />
    </>
  );
}
