"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck, MapPin } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiResource } from "@/hooks/use-api-resource";
import { toQueryString } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/date";
import { formatDistance } from "@/lib/geo";
import { describeLateness } from "@/lib/lateness";
import type { PaginatedAttendance } from "@/types";

/**
 * Every day this person has checked in.
 *
 * Deliberately read-only: marking present lives on the dashboard alone, because
 * two places to press the same button read as two different actions. Today's
 * check-in still appears here the moment it is made — it is a row like any
 * other — so nothing is lost by not repeating the control.
 */
export function EmployeeAttendance() {
  const [page, setPage] = useState(1);

  const { data, loading, error } = useApiResource<PaginatedAttendance>(
    `/api/attendance${toQueryString({ page, pageSize: 10 })}`,
  );

  const records = data?.items ?? [];

  return (
    <Card className="py-0">
      <CardHeader className="pt-6">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheck className="text-primary-ink size-4" aria-hidden />
          Attendance history
        </CardTitle>
        <CardDescription>
          Each day you were checked in from the office, with how far away you were when it was
          recorded.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
        {loading && (
          <div className="space-y-3 py-2">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="flex items-center gap-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 flex-1" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <EmptyState icon={MapPin} title="Couldn't load your attendance" description={error} />
        )}

        {!loading && !error && records.length === 0 && (
          <EmptyState
            icon={MapPin}
            title="No attendance recorded yet"
            description="Mark yourself present from your dashboard while you're at the office, and the day will appear here."
            inset={false}
            action={
              <Button size="sm" asChild>
                <Link href={ROUTES.dashboard}>Go to dashboard</Link>
              </Button>
            }
          />
        )}

        {!loading && !error && records.length > 0 && (
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
                      {record.lateMinutes > 0 && (
                        <span className="text-warning-ink ml-2 text-xs font-medium">
                          {describeLateness(record.lateMinutes)}
                        </span>
                      )}
                    </TableCell>
                    {/*
                      A day recorded by an administrator has no position, so
                      there is nothing to put in either column. Said in words
                      rather than left blank: this is the employee's own record,
                      and "how did this day get here when I never checked in"
                      is exactly the question they would ask.
                    */}
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {record.distanceMeters !== null
                        ? formatDistance(record.distanceMeters)
                        : `Recorded by ${record.markedBy?.name ?? "an administrator"}`}
                    </TableCell>
                    <TableCell className="text-muted-foreground pr-4 whitespace-nowrap sm:pr-6">
                      {record.accuracyMeters !== null ? `±${formatDistance(record.accuracyMeters)}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {data && (
              <PaginationControls pagination={data.pagination} onPageChange={setPage} label="days" />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
