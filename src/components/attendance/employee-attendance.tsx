"use client";

import { useCallback, useState } from "react";
import { CalendarCheck, MapPin } from "lucide-react";

import { MarkAttendanceCard } from "@/components/attendance/mark-attendance-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiResource } from "@/hooks/use-api-resource";
import { toQueryString } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/date";
import { formatDistance } from "@/lib/geo";
import type { AttendanceTodayView, PaginatedAttendance } from "@/types";

/**
 * The employee's attendance screen: where they stand today, and every day they
 * have been in before.
 *
 * Today is fetched separately from the history because the two change at
 * different moments — checking in rewrites today and prepends one row, and
 * re-reading both from the server afterwards is what keeps the screen showing
 * what was actually recorded rather than what was hoped for.
 */
export function EmployeeAttendance() {
  const [page, setPage] = useState(1);

  const today = useApiResource<AttendanceTodayView>("/api/attendance/today");
  const history = useApiResource<PaginatedAttendance>(
    `/api/attendance${toQueryString({ page, pageSize: 10 })}`,
  );

  const { refresh: refreshToday } = today;
  const { refresh: refreshHistory } = history;

  const onMarked = useCallback(async () => {
    await Promise.all([refreshToday(), refreshHistory()]);
  }, [refreshToday, refreshHistory]);

  const records = history.data?.items ?? [];

  return (
    <div className="grid gap-4">
      <MarkAttendanceCard
        today={today.data}
        loading={today.loading}
        error={today.error}
        onMarked={onMarked}
      />

      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="text-primary-ink size-4" aria-hidden />
            Attendance history
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
          {history.loading && (
            <div className="space-y-3 py-2">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 flex-1" />
                </div>
              ))}
            </div>
          )}

          {!history.loading && history.error && (
            <EmptyState icon={MapPin} title="Couldn't load your attendance" description={history.error} />
          )}

          {!history.loading && !history.error && records.length === 0 && (
            <EmptyState
              icon={MapPin}
              title="No attendance recorded yet"
              description="Once you mark yourself present from the office, the day will appear here."
              inset={false}
            />
          )}

          {!history.loading && !history.error && records.length > 0 && (
            <div className="-mx-4 overflow-x-auto sm:-mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4 sm:pl-6">Date</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>Distance from office</TableHead>
                    <TableHead className="pr-4 sm:pr-6">GPS accuracy</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="pl-4 font-medium whitespace-nowrap sm:pl-6">
                        {formatDate(record.date)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDateTime(record.checkInAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatDistance(record.distanceMeters)}
                      </TableCell>
                      <TableCell className="text-muted-foreground pr-4 whitespace-nowrap sm:pr-6">
                        ±{formatDistance(record.accuracyMeters)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {history.data && (
                <PaginationControls
                  pagination={history.data.pagination}
                  onPageChange={setPage}
                  label="days"
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
