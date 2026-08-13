"use client";

import { CalendarDays, Download, Search, SlidersHorizontal } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { LeaveStatusBadge } from "@/components/shared/leave-status-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SortButton } from "@/components/ui/sort-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { initialsOf } from "@/lib/utils";
import type { useLeaveTable } from "@/hooks/use-leave-table";
import { LEAVE_STATUS_VALUES } from "@/lib/enums";
import { formatDate, relativeTime } from "@/lib/date";
import type { LeaveWithEmployeeView } from "@/types";

type LeaveTableProps = {
  table: ReturnType<typeof useLeaveTable>;
  /** Admin view adds the employee column, department filter and row actions. */
  showEmployee?: boolean;
  departments?: string[];
  /**
   * Whether to offer the population filter. Decided on the server from
   * `canViewAdminRecords` and passed in, never worked out here — and both
   * `/api/leaves` and its CSV export refuse the filter to anyone else however
   * this renders.
   */
  canFilterByPopulation?: boolean;
  renderActions?: (leave: LeaveWithEmployeeView) => React.ReactNode;
};

/**
 * Employees, administrators, or everybody — the same three options, wording and
 * reasoning as the attendance roster's filter, so the two screens read alike.
 */
const POPULATION_FILTERS = [
  { value: "ALL", label: "Everyone" },
  { value: "EMPLOYEE", label: "Employees" },
  { value: "ADMIN", label: "Administrators" },
] as const;

export function LeaveTable({
  table,
  showEmployee = false,
  departments = [],
  canFilterByPopulation = false,
  renderActions,
}: LeaveTableProps) {
  const { filters, update, toggleSort, reset, hasActiveFilters, exportUrl, data, loading, error } = table;
  const leaves = data?.items ?? [];

  return (
    <Card className="py-0">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={filters.search}
              onChange={(event) => update({ search: event.target.value })}
              placeholder={showEmployee ? "Search reason, employee, department…" : "Search your leave reasons…"}
              className="pl-9"
              aria-label="Search leave requests"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={filters.status} onValueChange={(value) => update({ status: value as never })}>
              <SelectTrigger className="w-36" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {LEAVE_STATUS_VALUES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status.charAt(0) + status.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {showEmployee && canFilterByPopulation && (
              <Select
                value={filters.population}
                onValueChange={(value) => update({ population: value as never })}
              >
                <SelectTrigger className="w-40" aria-label="Filter by population">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POPULATION_FILTERS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {showEmployee && departments.length > 0 && (
              <Select
                value={filters.department}
                onValueChange={(value) => update({ department: value as never })}
              >
                <SelectTrigger className="w-44" aria-label="Filter by department">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All departments</SelectItem>
                  {departments.map((department) => (
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

            <Button variant="outline" size="sm" asChild>
              <a href={exportUrl} download>
                <Download className="size-4" />
                Export CSV
              </a>
            </Button>
          </div>
        </div>

        {loading && <TableSkeleton showEmployee={showEmployee} />}

        {!loading && error && (
          <EmptyState icon={CalendarDays} title="Couldn't load leave requests" description={error} />
        )}

        {!loading && !error && leaves.length === 0 && (
          <EmptyState
            icon={CalendarDays}
            title={hasActiveFilters ? "No matching requests" : "No leave requests yet"}
            description={
              hasActiveFilters
                ? "Try adjusting your search or filters to widen the results."
                : "Leave requests will appear here once they are submitted."
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

        {!loading && !error && leaves.length > 0 && (
          <div className="-mx-4 sm:-mx-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 sm:pl-6">
                    <SortButton
                      label="Leave date"
                      active={filters.sortBy === "leaveDate"}
                      direction={filters.sortDir}
                      onClick={() => toggleSort("leaveDate")}
                    />
                  </TableHead>
                  {showEmployee && <TableHead>Employee</TableHead>}
                  <TableHead>Reason</TableHead>
                  <TableHead>
                    <SortButton
                      label="Status"
                      active={filters.sortBy === "status"}
                      direction={filters.sortDir}
                      onClick={() => toggleSort("status")}
                    />
                  </TableHead>
                  <TableHead>
                    <SortButton
                      label="Requested"
                      active={filters.sortBy === "createdAt"}
                      direction={filters.sortDir}
                      onClick={() => toggleSort("createdAt")}
                    />
                  </TableHead>
                  {renderActions && <TableHead className="pr-4 text-right sm:pr-6">Actions</TableHead>}
                </TableRow>
              </TableHeader>

              <TableBody>
                {leaves.map((leave) => (
                  <TableRow key={leave.id}>
                    <TableCell className="pl-4 font-medium whitespace-nowrap sm:pl-6">
                      {formatDate(leave.leaveDate)}
                    </TableCell>

                    {showEmployee && (
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="size-8">
                            {leave.employee.profilePhoto && (
                              <AvatarImage src={leave.employee.profilePhoto} alt="" />
                            )}
                            <AvatarFallback>{initialsOf(leave.employee.name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{leave.employee.name}</p>
                            <p className="text-muted-foreground truncate text-xs">
                              {leave.employee.department ?? "No department"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                    )}

                    <TableCell className="max-w-64">
                      <span className="line-clamp-2 text-sm">{leave.reason}</span>
                    </TableCell>

                    <TableCell>
                      <LeaveStatusBadge status={leave.status} />
                    </TableCell>

                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {relativeTime(leave.createdAt)}
                    </TableCell>

                    {renderActions && (
                      <TableCell className="pr-4 text-right sm:pr-6">{renderActions(leave)}</TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {data && (
              <PaginationControls
                pagination={data.pagination}
                onPageChange={(page) => update({ page })}
                label="requests"
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TableSkeleton({ showEmployee }: { showEmployee: boolean }) {
  return (
    <div className="space-y-3 py-2">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-4">
          <Skeleton className="h-5 w-28" />
          {showEmployee && <Skeleton className="h-9 w-40" />}
          <Skeleton className="h-5 flex-1" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}
