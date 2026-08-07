"use client";

import { LeaveTable } from "@/components/leaves/leave-table";
import { useLeaveTable } from "@/hooks/use-leave-table";

/**
 * The viewer's own history. The id is passed explicitly rather than left to the
 * endpoint's default, which widens to the whole roster for an administrator —
 * they read this screen as themselves, and the Manage side as an admin.
 */
export function EmployeeLeaveHistory({ employeeId }: { employeeId: string }) {
  const table = useLeaveTable(10, employeeId);

  return <LeaveTable table={table} />;
}
