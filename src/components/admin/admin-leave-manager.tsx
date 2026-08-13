"use client";

import Link from "next/link";
import { Eye } from "lucide-react";

import { LeaveTable } from "@/components/leaves/leave-table";
import { Button } from "@/components/ui/button";
import { useApiResource } from "@/hooks/use-api-resource";
import { useLeaveTable } from "@/hooks/use-leave-table";
import { ROUTES } from "@/lib/constants";
import type { PaginatedEmployees } from "@/types";

/**
 * The organisation-wide view of leave.
 *
 * Read-only by design: the allowance decides every request as it is booked, so
 * there is nothing here to approve or decline. What is left is looking things
 * up — searching, filtering, exporting, and opening the person behind a row.
 */
export function AdminLeaveManager({
  /**
   * Whether to offer the population filter. Resolved on the server from
   * `canViewAdminRecords`, never from the session role — and the endpoint
   * refuses the filter regardless of what renders here.
   */
  canFilterByPopulation = false,
}: {
  canFilterByPopulation?: boolean;
}) {
  const table = useLeaveTable(10);

  // Reuse the employee endpoint purely for its department list, which powers
  // the department filter.
  const { data: employeeData } = useApiResource<PaginatedEmployees>("/api/admin/employees?pageSize=1");

  return (
    <LeaveTable
      table={table}
      showEmployee
      canFilterByPopulation={canFilterByPopulation}
      departments={employeeData?.departments ?? []}
      renderActions={(leave) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon-sm" asChild aria-label={`View ${leave.employee.name}'s profile`}>
            <Link href={`${ROUTES.adminStaff}/${leave.employeeId}`}>
              <Eye className="size-4" />
            </Link>
          </Button>
        </div>
      )}
    />
  );
}
