"use client";

import { useState } from "react";
import Link from "next/link";
import type { EmployeeStatus } from "@prisma/client";
import {
  Ban,
  CircleCheck,
  Eye,
  MoreHorizontal,
  Pencil,
  Search,
  SlidersHorizontal,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { EmployeeEditDialog } from "@/components/admin/employee-edit-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SortButton } from "@/components/ui/sort-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEmployeeTable } from "@/hooks/use-employee-table";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import { initialsOf } from "@/lib/utils";
import { formatDate } from "@/lib/date";
import { EMPLOYEE_STATUS, ROLE, type InviteRole } from "@/lib/enums";
import type { EmployeeView } from "@/types";

/**
 * Wording per population. The table itself is identical — an administrator is an
 * employee holding a role, so managing one needs no separate screen.
 */
const COPY = {
  [ROLE.EMPLOYEE]: {
    noun: "employee",
    plural: "employees",
    column: "Employee",
    searchLabel: "Search employees",
    emptyTitle: "No employees yet",
    emptyBody: "Employees appear here once they accept an invitation and verify their email.",
    deleteBody: "along with their leave history and the invitation they joined with",
  },
  [ROLE.ADMIN]: {
    noun: "administrator",
    plural: "administrators",
    column: "Administrator",
    searchLabel: "Search administrators",
    emptyTitle: "No administrators yet",
    emptyBody: "Administrators appear here once you approve their request.",
    // Worth stating plainly: the cascade takes the audit trail with it.
    deleteBody:
      "along with their leave history, the invitation they joined with, and every invitation they sent",
  },
} as const;

/**
 * Every status gets its own badge, not just suspended-or-not.
 *
 * Employees are only ever ACTIVE or SUSPENDED, but administrators also pass
 * through approval — so a declined administrator would otherwise be painted
 * green and read as in good standing.
 */
const STATUS_BADGE: Record<EmployeeStatus, { label: string; variant: "success" | "destructive" | "warning" }> = {
  [EMPLOYEE_STATUS.ACTIVE]: { label: "Active", variant: "success" },
  [EMPLOYEE_STATUS.SUSPENDED]: { label: "Suspended", variant: "destructive" },
  [EMPLOYEE_STATUS.PENDING_APPROVAL]: { label: "Pending approval", variant: "warning" },
  [EMPLOYEE_STATUS.REJECTED]: { label: "Declined", variant: "destructive" },
};

/** Suspend/reactivate applies to settled accounts; the rest await a decision. */
const isSettled = (status: EmployeeStatus) =>
  status === EMPLOYEE_STATUS.ACTIVE || status === EMPLOYEE_STATUS.SUSPENDED;

export function EmployeeManager({ role = ROLE.EMPLOYEE }: { role?: InviteRole }) {
  const table = useEmployeeTable(10, role);
  const { filters, update, toggleSort, reset, hasActiveFilters, data, loading, error, refresh } = table;
  const copy = COPY[role];

  const [editing, setEditing] = useState<EmployeeView | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Confirmations are rendered outside the dropdown: a menu unmounts its own
  // children on select, which would tear down a nested dialog before it opens.
  const [confirming, setConfirming] = useState<{
    employee: EmployeeView;
    action: "status" | "delete";
  } | null>(null);

  const employees = data?.items ?? [];
  const confirmingSuspended = confirming?.employee.status === EMPLOYEE_STATUS.SUSPENDED;

  async function setStatus(employee: EmployeeView, status: "ACTIVE" | "SUSPENDED") {
    try {
      await apiClient.patch(`/api/admin/employees/${employee.id}/status`, { status });

      toast.success(
        status === EMPLOYEE_STATUS.SUSPENDED
          ? `${employee.name}'s account is suspended.`
          : `${employee.name}'s account is active again.`,
      );

      await refresh();
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : "Could not update the account.");
    }
  }

  async function remove(employee: EmployeeView) {
    try {
      await apiClient.delete(`/api/admin/employees/${employee.id}`);

      toast.success(`${employee.name} was removed.`);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : `Could not delete this ${copy.noun}.`);
    }
  }

  return (
    <>
      <Card className="py-0">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={filters.search}
                onChange={(event) => update({ search: event.target.value })}
                placeholder="Search by name, email, department or position…"
                className="pl-9"
                aria-label={copy.searchLabel}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={filters.status} onValueChange={(value) => update({ status: value as never })}>
                <SelectTrigger className="w-36" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  <SelectItem value={EMPLOYEE_STATUS.ACTIVE}>Active</SelectItem>
                  <SelectItem value={EMPLOYEE_STATUS.SUSPENDED}>Suspended</SelectItem>
                  {/* Only administrators pass through approval, so these two
                      would match nothing on the employee tab. */}
                  {role === ROLE.ADMIN && (
                    <>
                      <SelectItem value={EMPLOYEE_STATUS.PENDING_APPROVAL}>Pending approval</SelectItem>
                      <SelectItem value={EMPLOYEE_STATUS.REJECTED}>Declined</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>

              {(data?.departments.length ?? 0) > 0 && (
                <Select
                  value={filters.department}
                  onValueChange={(value) => update({ department: value as never })}
                >
                  <SelectTrigger className="w-44" aria-label="Filter by department">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All departments</SelectItem>
                    {data?.departments.map((department) => (
                      <SelectItem key={department} value={department}>
                        {department}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={reset}>
                  <SlidersHorizontal className="size-4" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {loading && <TableSkeleton />}

          {!loading && error && (
            <EmptyState icon={Users} title={`Couldn't load ${copy.plural}`} description={error} />
          )}

          {!loading && !error && employees.length === 0 && (
            <EmptyState
              icon={Users}
              title={hasActiveFilters ? `No matching ${copy.plural}` : copy.emptyTitle}
              description={
                hasActiveFilters ? "Try adjusting your search or filters." : copy.emptyBody
              }
              action={
                hasActiveFilters ? (
                  <Button variant="outline" size="sm" onClick={reset}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          )}

          {!loading && !error && employees.length > 0 && (
            <div className="-mx-4 sm:-mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4 sm:pl-6">
                      <SortButton
                        label={copy.column}
                        active={filters.sortBy === "name"}
                        direction={filters.sortDir}
                        onClick={() => toggleSort("name")}
                      />
                    </TableHead>
                    <TableHead>
                      <SortButton
                        label="Department"
                        active={filters.sortBy === "department"}
                        direction={filters.sortDir}
                        onClick={() => toggleSort("department")}
                      />
                    </TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>
                      <SortButton
                        label="Joined"
                        active={filters.sortBy === "createdAt"}
                        direction={filters.sortDir}
                        onClick={() => toggleSort("createdAt")}
                      />
                    </TableHead>
                    <TableHead className="pr-4 text-right sm:pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {employees.map((employee) => {
                    const suspended = employee.status === EMPLOYEE_STATUS.SUSPENDED;

                    return (
                      <TableRow key={employee.id}>
                        <TableCell className="pl-4 sm:pl-6">
                          <div className="flex items-center gap-3">
                            <Avatar className="size-9">
                              {employee.profilePhoto && <AvatarImage src={employee.profilePhoto} alt="" />}
                              <AvatarFallback>{initialsOf(employee.name)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{employee.name}</p>
                              <p className="text-muted-foreground truncate text-xs">
                                {employee.position ?? "No position"}
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="text-sm">
                          {employee.department ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>

                        <TableCell className="text-sm">
                          <p className="truncate">{employee.email}</p>
                          <p className="text-muted-foreground truncate text-xs">{employee.phone ?? "—"}</p>
                        </TableCell>

                        <TableCell>
                          <Badge variant={STATUS_BADGE[employee.status].variant}>
                            {STATUS_BADGE[employee.status].label}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {employee.joiningDate ? formatDate(employee.joiningDate) : "—"}
                        </TableCell>

                        <TableCell className="pr-4 text-right sm:pr-6">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Actions for ${employee.name}`}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem asChild>
                                <Link href={`${ROUTES.adminEmployees}/${employee.id}`}>
                                  <Eye className="size-4" />
                                  View profile
                                </Link>
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onClick={() => {
                                  setEditing(employee);
                                  setDialogOpen(true);
                                }}
                              >
                                <Pencil className="size-4" />
                                Edit details
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />

                              {/* Hidden for accounts still in approval — the
                                  service refuses the toggle for those. */}
                              {isSettled(employee.status) && (
                                <DropdownMenuItem onClick={() => setConfirming({ employee, action: "status" })}>
                                  {suspended ? <CircleCheck className="size-4" /> : <Ban className="size-4" />}
                                  {suspended ? "Reactivate" : "Suspend"}
                                </DropdownMenuItem>
                              )}

                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setConfirming({ employee, action: "delete" })}
                              >
                                <Trash2 className="size-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {data && (
                <PaginationControls
                  pagination={data.pagination}
                  onPageChange={(page) => update({ page })}
                  label={copy.plural}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <EmployeeEditDialog
        employee={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={refresh}
      />

      {confirming?.action === "status" && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirming(null)}
          title={confirmingSuspended ? "Reactivate this account?" : "Suspend this account?"}
          description={
            confirmingSuspended
              ? `${confirming.employee.name} will be able to sign in and submit leave again.`
              : `${confirming.employee.name} will be blocked from signing in or submitting leave until reactivated.`
          }
          confirmLabel={confirmingSuspended ? "Reactivate" : "Suspend"}
          destructive={!confirmingSuspended}
          onConfirm={async () => {
            await setStatus(confirming.employee, confirmingSuspended ? "ACTIVE" : "SUSPENDED");
            setConfirming(null);
          }}
        />
      )}

      {confirming?.action === "delete" && (
        <ConfirmDialog
          open
          destructive
          onOpenChange={(open) => !open && setConfirming(null)}
          title={`Delete this ${copy.noun}?`}
          description={`This permanently removes ${confirming.employee.name} ${copy.deleteBody}. This cannot be undone.`}
          confirmLabel="Delete permanently"
          onConfirm={async () => {
            await remove(confirming.employee);
            setConfirming(null);
          }}
        />
      )}
    </>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3 py-2">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-4">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-5 flex-1" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-8 w-8" />
        </div>
      ))}
    </div>
  );
}
