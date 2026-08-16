"use client";

import { FileSearch, UserCheck } from "lucide-react";

import { AttendanceStatusBadge } from "@/components/shared/attendance-status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { LeaveStatusBadge } from "@/components/shared/leave-status-badge";
import { Badge } from "@/components/ui/badge";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { friendlyTimeLabel } from "@/lib/attendance-policy";
import { formatDate, formatTimeInAppZone } from "@/lib/date";
import { describeLateness } from "@/lib/lateness";
import { roleLabel } from "@/lib/report-labels";
import type { ReportRecordTypeView, ReportView } from "@/types";

const RECORD_TYPE_BADGE = {
  ATTENDANCE: { label: "Attendance", variant: "success" },
  ABSENT: { label: "Absent", variant: "destructive" },
  LEAVE: { label: "Leave", variant: "warning" },
} as const satisfies Record<ReportRecordTypeView, { label: string; variant: string }>;

/**
 * The detailed records: one line per person per day.
 *
 * **The columns adapt to what was asked for.** A leave-only report has no
 * check-in times and no lateness to show, so those columns are not rendered
 * empty — a table two-thirds dashes reads as missing data rather than as a
 * question that never applied. The rule is the record types the report holds,
 * not what happens to be on the page: page two of an attendance report must not
 * lose a column because everybody on it happened to be on time.
 *
 * Paging is the server's. The controls hand a page number back and the report is
 * re-fetched, so the summary above never describes a different set of rows from
 * the ones below it.
 */
export function ReportTable({
  report,
  onPageChange,
  filtered,
}: {
  report: ReportView;
  onPageChange: (page: number) => void;
  /** Whether a search or a status filter is narrowing what is shown. */
  filtered: boolean;
}) {
  const shows = (type: ReportRecordTypeView) => report.recordTypes.includes(type);

  // Attendance columns earn their place only when the report can hold a
  // check-in at all. Absence and leave rows never carry one, by construction.
  const showsAttendanceColumns = shows("ATTENDANCE");
  const showsLeaveColumns = shows("LEAVE");

  if (report.rows.length === 0) {
    return (
      <EmptyState
        icon={FileSearch}
        title={filtered ? "Nothing matches those filters" : "No records for this report"}
        description={
          filtered
            ? "Try clearing the search, the role filter or the status filter."
            : // Deliberately not phrased as an error. A period genuinely holding
              // no records is an answer, and the commonest reasons are ordinary
              // ones worth naming rather than a failure worth apologising for.
              "Nothing was recorded for the people and period you chose. The days may all be closures or weekly days off, the period may not have happened yet, or these people may simply have nothing on record for it."
        }
      />
    );
  }

  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4 sm:pl-6">Date</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Record</TableHead>
            <TableHead>Status</TableHead>
            {showsAttendanceColumns && <TableHead>Check-in</TableHead>}
            {showsAttendanceColumns && <TableHead>Late</TableHead>}
            {showsLeaveColumns && <TableHead>Leave</TableHead>}
            <TableHead className="pr-4 sm:pr-6">Notes</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {report.rows.map((row) => {
            const badge = RECORD_TYPE_BADGE[row.recordType];

            return (
              <TableRow key={`${row.employeeId}-${row.date}`}>
                <TableCell className="pl-4 whitespace-nowrap sm:pl-6">{formatDate(row.date)}</TableCell>

                <TableCell>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {row.department ?? "No department"}
                    </p>
                  </div>
                </TableCell>

                <TableCell>
                  <Badge variant="outline">{roleLabel(row.role)}</Badge>
                </TableCell>

                <TableCell>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </TableCell>

                {/*
                  The roster's own verdict, rendered by the roster's own badge.
                  Somebody late is still Present — they were there — so the
                  lateness rides beside it as a qualifier rather than replacing
                  it, exactly as it does on the attendance screen.
                */}
                <TableCell>
                  <AttendanceStatusBadge status={row.status} />
                </TableCell>

                {showsAttendanceColumns && (
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {row.checkInAt ? formatTimeInAppZone(row.checkInAt) : "—"}
                  </TableCell>
                )}

                {showsAttendanceColumns && (
                  <TableCell className="whitespace-nowrap">
                    {row.lateMinutes > 0 ? (
                      <span
                        className="text-warning-ink text-xs font-medium"
                        // The deadline as well as the figure: a report outlives
                        // the setting, and "15 min late" is unreadable once
                        // somebody has moved the cutoff underneath it.
                        title={
                          row.lateBasisMinutes !== null
                            ? `Measured from the ${friendlyTimeLabel(row.lateBasisMinutes)} cutoff in force that day`
                            : undefined
                        }
                      >
                        {describeLateness(row.lateMinutes)}
                      </span>
                    ) : row.checkInAt ? (
                      <span className="text-muted-foreground text-xs">On time</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}

                {showsLeaveColumns && (
                  <TableCell className="whitespace-nowrap">
                    {row.leaveStatus ? <LeaveStatusBadge status={row.leaveStatus} /> : "—"}
                  </TableCell>
                )}

                <TableCell className="pr-4 sm:pr-6">
                  <div className="text-muted-foreground max-w-64 space-y-0.5 text-xs">
                    {/*
                      A day vouched for by an administrator says so, everywhere
                      it appears. It is the whole difference between a record the
                      building proved and one somebody asserted, and a report is
                      exactly where that must not be lost.
                    */}
                    {row.markedBy && (
                      <p className="flex items-center gap-1.5">
                        <UserCheck className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">Recorded by {row.markedBy.name}</span>
                      </p>
                    )}
                    {row.markedReason && <p className="truncate">{row.markedReason}</p>}
                    {row.leaveReason && <p className="truncate">Leave: {row.leaveReason}</p>}
                    {!row.markedBy && !row.markedReason && !row.leaveReason && <span>—</span>}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <PaginationControls
        pagination={{
          page: report.page,
          pageSize: report.pageSize,
          total: report.totalRows,
          totalPages: report.totalPages,
        }}
        onPageChange={onPageChange}
        label="records"
      />
    </div>
  );
}
