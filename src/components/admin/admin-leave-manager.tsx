"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Eye, X } from "lucide-react";
import { toast } from "sonner";

import { LeaveTable } from "@/components/leaves/leave-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useApiResource } from "@/hooks/use-api-resource";
import { useLeaveTable } from "@/hooks/use-leave-table";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import { LEAVE_STATUS } from "@/lib/enums";
import { formatDate } from "@/lib/date";
import type { LeaveWithEmployeeView, PaginatedEmployees } from "@/types";

export function AdminLeaveManager() {
  const table = useLeaveTable(10);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Reuse the employee endpoint purely for its department list, which powers
  // the department filter.
  const { data: employeeData } = useApiResource<PaginatedEmployees>("/api/admin/employees?pageSize=1");

  async function decide(leave: LeaveWithEmployeeView, status: "APPROVED" | "REJECTED") {
    setPendingId(leave.id);

    try {
      await apiClient.patch(`/api/leaves/${leave.id}`, { status });

      toast.success(
        status === LEAVE_STATUS.APPROVED
          ? `Approved ${leave.employee.name}'s leave for ${formatDate(leave.leaveDate)}.`
          : `Declined ${leave.employee.name}'s leave for ${formatDate(leave.leaveDate)}.`,
      );

      await table.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : "Could not update this request. Please try again.",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <LeaveTable
      table={table}
      showEmployee
      departments={employeeData?.departments ?? []}
      renderActions={(leave) => (
        <div className="flex items-center justify-end gap-1">
          {leave.status !== LEAVE_STATUS.APPROVED && (
            <ConfirmDialog
              title="Approve this leave?"
              description={`${leave.employee.name} will be notified by email that their leave on ${formatDate(leave.leaveDate)} is approved.`}
              confirmLabel="Approve"
              onConfirm={() => decide(leave, "APPROVED")}
              trigger={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={pendingId === leave.id}
                  aria-label={`Approve leave for ${leave.employee.name}`}
                  className="text-success-ink hover:text-success-ink hover:bg-success/10"
                >
                  <Check className="size-4" />
                </Button>
              }
            />
          )}

          {leave.status !== LEAVE_STATUS.REJECTED && (
            <ConfirmDialog
              destructive
              title="Decline this leave?"
              description={`${leave.employee.name} will be notified by email that their leave on ${formatDate(leave.leaveDate)} was declined.`}
              confirmLabel="Decline"
              onConfirm={() => decide(leave, "REJECTED")}
              trigger={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={pendingId === leave.id}
                  aria-label={`Decline leave for ${leave.employee.name}`}
                  className="text-destructive-ink hover:text-destructive-ink hover:bg-destructive/10"
                >
                  <X className="size-4" />
                </Button>
              }
            />
          )}

          <Button variant="ghost" size="icon-sm" asChild aria-label={`View ${leave.employee.name}'s profile`}>
            <Link href={`${ROUTES.adminEmployees}/${leave.employeeId}`}>
              <Eye className="size-4" />
            </Link>
          </Button>
        </div>
      )}
    />
  );
}
