"use client";

import { LeaveTable } from "@/components/leaves/leave-table";
import { useLeaveTable } from "@/hooks/use-leave-table";

export function EmployeeLeaveHistory() {
  const table = useLeaveTable(10);

  return <LeaveTable table={table} />;
}
