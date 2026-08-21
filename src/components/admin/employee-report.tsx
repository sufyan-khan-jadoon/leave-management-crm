"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  CheckCircle2,
  CircleDashed,
  Clock,
  FileSpreadsheet,
  FileText,
  Gauge,
  House,
  MapPin,
  Palmtree,
  RotateCcw,
  Table2,
  TriangleAlert,
  UserCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { EmployeeReportCalendar } from "@/components/admin/employee-report-calendar";
import { AttendanceMixChart, type AttendanceMixSlice } from "@/components/charts/attendance-mix-chart";
import { AttendanceTrendChart } from "@/components/charts/attendance-trend-chart";
import { AttendanceStatusBadge } from "@/components/shared/attendance-status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { LeaveStatusBadge } from "@/components/shared/leave-status-badge";
import { StatCard, StatCardSkeleton } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { friendlyTimeLabel } from "@/lib/attendance-policy";
import { formatDate, formatDateTime, formatTimeInAppZone, toIsoDate, todayUtc } from "@/lib/date";
import {
  EMPLOYEE_REPORT_RANGE_LABELS,
  EMPLOYEE_REPORT_RANGES,
  type EmployeeReportRange,
} from "@/lib/employee-report-range";
import { formatDistance } from "@/lib/geo";
import { describeLateness } from "@/lib/lateness";
import { formatAttendanceRate } from "@/lib/report-labels";
import { MAX_REPORT_RANGE_DAYS } from "@/lib/report-period";
import { bucketTrend, trendGranularityFor } from "@/lib/report-trend";
import { cn } from "@/lib/utils";
import type { AttendanceDayStatus, EmployeeReportView } from "@/types";

const PAGE_SIZE = 31;

/**
 * The three files this report can become.
 *
 * The same three the workforce report offers, pointed at this person's own
 * endpoints — and, the part that matters, **posting the same body the screen was
 * generated from**. Each one re-runs the report through
 * `reportService.forEmployeeAll` and renders the document `report-document.ts`
 * builds, so all three hold exactly the days on screen and describe them in
 * exactly the same words. A file assembled in the browser from what happens to
 * be rendered would be a second implementation of a report that already exists —
 * and it would be page one of it, since the table is paged on the server.
 */
const EXPORTS = {
  xlsx: { label: "Export Excel", path: "export/xlsx", icon: FileSpreadsheet, fallback: "Zovencia_Report.xlsx" },
  pdf: { label: "Export PDF", path: "export/pdf", icon: FileText, fallback: "Zovencia_Report.pdf" },
  csv: { label: "Export CSV", path: "export/csv", icon: Table2, fallback: "Zovencia_Report.csv" },
} as const;

type ExportFormat = keyof typeof EXPORTS;

const EXPORT_ORDER: ExportFormat[] = ["xlsx", "pdf", "csv"];

/** Hands a downloaded blob to the browser under the name the server chose. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();

  // Revoking in the same turn as the click races the download in some browsers,
  // and the file that fails to arrive gives no error to catch.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * One person's report, reached from their profile.
 *
 * **Nothing here computes a figure.** The tiles, the attendance rate, the
 * coverage, the leave spells and the page count all arrive from
 * `/api/admin/reports/employees/[id]`, which read them off the day walk. The
 * charts bucket days the server already judged — see `report-trend.ts` — and
 * cannot contradict the tiles, because both are counting the same verdicts.
 *
 * The period is the **only** filter, deliberately: with a headline rate, four
 * tiles, a calendar and a chart all describing the report, a status filter would
 * either move every one of them or leave some of them describing a different set
 * of rows than the table beneath. See `employee-report.schema.ts`.
 */
export function EmployeeReport({ employeeId }: { employeeId: string }) {
  const today = useMemo(() => todayUtc(), []);

  const [range, setRange] = useState<EmployeeReportRange>("THIS_MONTH");
  const [startDate, setStartDate] = useState(() =>
    toIsoDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))),
  );
  const [endDate, setEndDate] = useState(() => toIsoDate(today));
  const [page, setPage] = useState(1);

  const [report, setReport] = useState<EmployeeReportView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  /**
   * What is wrong with the range before it is sent.
   *
   * A courtesy exactly as the report builder's draft check is: every one of
   * these is checked again by `employeeReportRequestSchema`, which is the rule.
   * It exists so the answer arrives while the field is still on screen.
   */
  const rangeProblem = useMemo(() => {
    if (range !== "CUSTOM") return null;
    if (!startDate || !endDate) return "Choose a start and an end date.";
    if (startDate > endDate) return "The end date cannot be before the start date.";

    const days = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1;
    if (days > MAX_REPORT_RANGE_DAYS) {
      return `A report can cover at most ${MAX_REPORT_RANGE_DAYS} days. Choose a shorter range.`;
    }

    return null;
  }, [range, startDate, endDate]);

  /**
   * The request body, in the shape the schema wants.
   *
   * A preset carries **no dates** — the server resolves them against the
   * company's calendar day, and the schema refuses a preset that arrives with
   * its own rather than ignoring them. One builder shared by the fetch and all
   * three exports, so a file can never be generated from a different request
   * than the screen it was taken from.
   */
  const body = useCallback(
    (forPage: number) => ({
      range,
      ...(range === "CUSTOM" ? { startDate, endDate } : {}),
      page: forPage,
      pageSize: PAGE_SIZE,
    }),
    [range, startDate, endDate],
  );

  /** The one place the report is fetched, so there is no second path to drift. */
  useEffect(() => {
    if (rangeProblem) return;

    let current = true;
    setLoading(true);
    setError(null);

    apiClient
      .post<EmployeeReportView>(`/api/admin/reports/employees/${employeeId}`, body(page))
      .then((data) => {
        if (current) setReport(data);
      })
      .catch((caught: unknown) => {
        if (!current) return;

        // The previous report is deliberately left on screen: a range change
        // that failed should not destroy the answer somebody already had, and
        // the message above says plainly that this one did not land.
        setError(
          caught instanceof ApiClientError
            ? caught.message
            : "Something went wrong. Please try again.",
        );
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
    };
  }, [employeeId, body, page, rangeProblem]);

  async function runExport(format: ExportFormat) {
    if (exporting || !report) return;

    const target = EXPORTS[format];
    setExporting(format);

    try {
      const response = await fetch(`/api/admin/reports/employees/${employeeId}/${target.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Page one at the screen's size; the server opens the paging up itself
        // through `forEmployeeAll`, so a file is never page one of a report.
        body: JSON.stringify(body(1)),
      });

      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const filename =
        response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? target.fallback;

      saveBlob(blob, filename);
      toast.success(`${filename} downloaded.`);
    } catch {
      toast.error("Couldn't export that report. Please try again.");
    } finally {
      setExporting(null);
    }
  }

  function changeRange(next: EmployeeReportRange) {
    setRange(next);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <Card className="py-0">
        <CardContent className="space-y-4 p-4 sm:p-5">
          {/*
            The period controls and the exports as two groups rather than four
            cells of one grid. As a grid the three buttons were squeezed into a
            quarter of the row and wrapped into a vertical stack — a column of
            buttons where a toolbar belongs.
          */}
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid flex-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="report-range">Period</Label>
                <Select value={range} onValueChange={(value) => changeRange(value as EmployeeReportRange)}>
                  <SelectTrigger id="report-range" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYEE_REPORT_RANGES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {EMPLOYEE_REPORT_RANGE_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {range === "CUSTOM" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="report-start">Start date</Label>
                    <Input
                      id="report-start"
                      type="date"
                      value={startDate}
                      onChange={(event) => {
                        setStartDate(event.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="report-end">End date</Label>
                    <Input
                      id="report-end"
                      type="date"
                      value={endDate}
                      onChange={(event) => {
                        setEndDate(event.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {EXPORT_ORDER.map((format) => {
                const target = EXPORTS[format];
                const Icon = target.icon;

                return (
                  <Button
                    key={format}
                    variant={format === "xlsx" ? "default" : "outline"}
                    size="sm"
                    onClick={() => runExport(format)}
                    disabled={!report || exporting !== null}
                  >
                    {exporting === format ? (
                      <RotateCcw className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Icon className="size-4" aria-hidden />
                    )}
                    {target.label}
                  </Button>
                );
              })}
            </div>
          </div>

          {rangeProblem && (
            <p className="text-destructive-ink flex items-center gap-2 text-sm">
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              {rangeProblem}
            </p>
          )}

          {report && !rangeProblem && (
            <p className="text-muted-foreground text-sm">
              <span className="text-foreground font-medium">{report.periodLabel}</span> · generated{" "}
              {formatDateTime(report.generatedAt)}
            </p>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/40 py-0">
          <CardContent className="text-destructive-ink flex items-start gap-2 p-4 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{error}</p>
          </CardContent>
        </Card>
      )}

      {loading && !report ? (
        <ReportSkeleton />
      ) : report ? (
        <div className={cn("space-y-4", loading && "pointer-events-none opacity-60")}>
          <Summary report={report} />
          <Analytics report={report} />

          <Card className="py-0">
            <CardHeader className="pt-6">
              <CardTitle className="text-base">Calendar</CardTitle>
              <CardDescription>
                Every day in the period, coloured by what it amounted to. Select a day for the detail
                behind it.
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-6">
              <EmployeeReportCalendar days={report.calendar} />
            </CardContent>
          </Card>

          <Leaves report={report} />
          <Records report={report} onPageChange={setPage} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * What the period came to.
 *
 * Every tile is a number the server computed. The attendance rate in particular
 * is **not** divided here — `reportService.forEmployee` divided it once, against
 * `attendanceEligibleDays` rather than `workingDays`, and the exports print that
 * same figure. Two divisions would be two answers.
 */
function Summary({ report }: { report: EmployeeReportView }) {
  const { coverage, totals } = report;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/*
          Out of the days the register actually judged them on — present plus
          absent — and the hint says so rather than leaving somebody to work out
          what the percentage divided by. A month half in the future would
          otherwise report a perfect attender at a quarter, which is what driving
          this against real data turned up. See `EmployeeReportResult`.
        */}
        <StatCard
          label="Attendance rate"
          value={formatAttendanceRate(report.attendanceRate)}
          icon={Gauge}
          tone="primary"
          hint={
            report.attendanceRate === null
              ? "no day in this period was assessed"
              : `${totals.present} of ${report.attendanceAssessedDays} assessed ${report.attendanceAssessedDays === 1 ? "day" : "days"}`
          }
        />
        <StatCard
          label="Working days"
          value={coverage.workingDays}
          icon={CalendarCheck}
          tone="neutral"
          hint="in this period"
        />
        <StatCard label="Present" value={totals.present} icon={CheckCircle2} tone="success" />
        <StatCard label="Absent" value={totals.absent} icon={XCircle} tone="destructive" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Leave" value={totals.onLeave} icon={Palmtree} tone="warning" hint="approved days" />
        <StatCard label="Remote" value={totals.remote} icon={House} tone="warning" hint="attendance-exempt" />
        <StatCard
          label={`Late (of ${totals.present} present)`}
          value={totals.late}
          icon={Clock}
          tone="warning"
          hint={
            totals.lateMinutes > 0
              ? `${describeLateness(totals.lateMinutes)} late in total`
              : "nothing past the deadline"
          }
        />
        <StatCard
          label="Days off"
          value={coverage.daysOff}
          icon={CalendarOff}
          tone="neutral"
          hint={
            coverage.closedDays > 0
              ? `${coverage.closedDays} office ${coverage.closedDays === 1 ? "closure" : "closures"}, rest weekly`
              : "weekly days off"
          }
        />
      </div>

      {/*
        §12's arithmetic, stated rather than left to be worked out. Without it
        somebody reads Present against Working days and gets the wrong
        denominator — 16 of 22 rather than 16 of 17.
      */}
      {coverage.remoteDays > 0 && (
        <Note icon={House} tone="warning">
          <span className="text-foreground font-medium">
            {coverage.attendanceEligibleDays} attendance-eligible{" "}
            {coverage.attendanceEligibleDays === 1 ? "day" : "days"}
          </span>{" "}
          — {coverage.workingDays} working {coverage.workingDays === 1 ? "day" : "days"} less{" "}
          {coverage.remoteDays} spent working remotely. Remote days are exempt from attendance:
          nobody is present or absent for them and they cost no leave, which is why the rate above is
          measured against this figure rather than the working days.
        </Note>
      )}

      {/*
        A period holding nothing, said out loud rather than left as a run of
        zeroes. After a reset — or before a company has recorded anything — every
        working day holds no check-in and no leave for anybody, and nobody is
        marked absent for it.
      */}
      {coverage.noRecordDays > 0 && (
        <Note icon={CircleDashed}>
          {coverage.noRecordDays} working{" "}
          {coverage.noRecordDays === 1 ? "day in this period holds" : "days in this period hold"}{" "}
          nothing at all — no check-ins and no leave for anybody in the company. This person is not
          counted absent for {coverage.noRecordDays === 1 ? "it" : "them"}.
        </Note>
      )}

      {coverage.upcomingDays > 0 && (
        <Note icon={Clock}>
          This period reaches {coverage.upcomingDays} working{" "}
          {coverage.upcomingDays === 1 ? "day" : "days"} that{" "}
          {coverage.upcomingDays === 1 ? "has" : "have"} not happened yet. Nobody can have missed{" "}
          {coverage.upcomingDays === 1 ? "it" : "them"}, so{" "}
          {coverage.upcomingDays === 1 ? "it is" : "they are"} counted as neither present nor absent.
          Leave booked across {coverage.upcomingDays === 1 ? "it" : "them"} still appears.
        </Note>
      )}

      {/*
        Reported, never acted on. `describeDay` takes no notice of when somebody
        started, so a day before their first one reads exactly as it does on the
        attendance roster — quietly reclassifying it would be this screen forming
        an opinion about a date.
      */}
      {report.summaries[0]?.joinedDuringPeriod && (
        <Note icon={CalendarDays} tone="warning">
          They joined on {formatDate(report.summaries[0].joinedDuringPeriod)}, so part of this period
          predates them. Those earlier days are judged exactly as they are on the attendance screen
          and are not reclassified here.
        </Note>
      )}
    </div>
  );
}

/** The two charts. Both read days the server already judged. */
function Analytics({ report }: { report: EmployeeReportView }) {
  const granularity = trendGranularityFor(report.calendar.length);

  const buckets = useMemo(
    () =>
      bucketTrend(
        report.calendar.map((day) => ({ date: new Date(day.date), status: day.status })),
        granularity,
      ),
    [report.calendar, granularity],
  );

  // Every day is in exactly one slice, which is what makes a proportional chart
  // honest here — `describeDay` reaches one verdict per date.
  const mix = useMemo(() => {
    const counts = new Map<AttendanceDayStatus, number>();
    for (const day of report.calendar) {
      counts.set(day.status, (counts.get(day.status) ?? 0) + 1);
    }

    return [...counts.entries()].map(([status, value]): AttendanceMixSlice => ({ status, value }));
  }, [report.calendar]);

  const hasRecords = report.totals.records > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="py-0 lg:col-span-2">
        <CardHeader className="pt-6">
          <CardTitle className="text-base">How the period was spent</CardTitle>
          <CardDescription>Every day in the period, in exactly one slice.</CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          <AttendanceMixChart data={mix} />
        </CardContent>
      </Card>

      <Card className="py-0 lg:col-span-3">
        <CardHeader className="pt-6">
          <CardTitle className="text-base">Attendance over time</CardTitle>
          <CardDescription>
            {granularity === "DAY"
              ? "Day by day."
              : granularity === "WEEK"
                ? "By week, since the period is too long to read a day at a time."
                : "By month, since the period is too long to read a week at a time."}{" "}
            Days off and closures are in no column — nobody was expected in.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          {hasRecords ? (
            <AttendanceTrendChart data={buckets} granularity={granularity} />
          ) : (
            <EmptyState
              icon={CircleDashed}
              title="Nothing to plot"
              description="This period holds no attendance, absence, leave or remote day for this person."
              inset={false}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Approved leave in the period, as the stretches it was booked as.
 *
 * The **days** figure is the number of leave rows in the run, never the span
 * between the two dates: a Friday and the Monday after is two days off, not
 * four. There is no leave *type* on `Leave`, so there is no type column — the
 * reason is the free text the assistant extracted, and it is printed as that.
 */
function Leaves({ report }: { report: EmployeeReportView }) {
  return (
    <Card className="py-0">
      <CardHeader className="pt-6">
        <CardTitle className="text-base">Leave</CardTitle>
        <CardDescription>
          Approved leave falling in this period, grouped into the stretches it was taken as. Days
          count the leave days themselves, so a weekend or a closure inside a stretch costs nothing.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-6">
        {report.leaveSpells.length === 0 ? (
          <EmptyState
            icon={Palmtree}
            title="No approved leave"
            description="This person took no leave in this period."
            inset={false}
            className="mx-6"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 sm:pl-6">From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4 sm:pr-6">Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.leaveSpells.map((spell) => (
                  <TableRow key={`${spell.from}-${spell.to}-${spell.reason}`}>
                    <TableCell className="pl-4 font-medium whitespace-nowrap sm:pl-6">
                      {formatDate(spell.from)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(spell.to)}</TableCell>
                    <TableCell className="text-right tabular-nums">{spell.days}</TableCell>
                    <TableCell>
                      <LeaveStatusBadge status={spell.status} />
                    </TableCell>
                    <TableCell className="max-w-72 pr-4 sm:pr-6">
                      <span className="line-clamp-2">{spell.reason}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The detailed records: one line per day that amounted to something.
 *
 * Deliberately not `ReportTable`, which carries a Name and a Role column on
 * every row — constant noise on a report about one person — and has no room for
 * the distance. What it does **not** do differently is derive anything: the
 * status, the lateness and the distance are all fields the server put on the
 * row, exactly as they are there.
 *
 * There is no check-out column and no working-hours column, and that is not an
 * omission: `Attendance` records a check-in and nothing else, so hours worked is
 * a figure this system does not hold and one this screen will not invent. If a
 * check-out ever lands, the hours belong beside `lateMinutesOf` — derived on
 * read, in one place — rather than computed here.
 */
function Records({
  report,
  onPageChange,
}: {
  report: EmployeeReportView;
  onPageChange: (page: number) => void;
}) {
  return (
    <Card className="py-0">
      <CardHeader className="pt-6">
        <CardTitle className="text-base">Records</CardTitle>
        <CardDescription>
          One row per day that holds something. Office closures, weekly days off, days the system
          holds nothing about and days still to come are counted above and appear in the calendar,
          not here.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-0 pb-6">
        {report.rows.length === 0 ? (
          <EmptyState
            icon={CircleDashed}
            title="No records for this period"
            description="Nothing was recorded for this person in the period you chose. The days may all be closures or weekly days off, the period may not have happened yet, or there may simply be nothing on record for it."
            inset={false}
            className="mx-6"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4 sm:pl-6">Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>Arrival</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Leave</TableHead>
                    <TableHead className="pr-4 sm:pr-6">Notes</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={row.date}>
                      <TableCell className="pl-4 whitespace-nowrap sm:pl-6">
                        {formatDate(row.date)}
                      </TableCell>

                      <TableCell>
                        <AttendanceStatusBadge status={row.status} />
                      </TableCell>

                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {row.checkInAt ? formatTimeInAppZone(row.checkInAt) : "—"}
                      </TableCell>

                      <TableCell className="whitespace-nowrap">
                        {row.lateMinutes > 0 ? (
                          <span
                            className="text-warning-ink text-xs font-medium"
                            title={
                              row.lateBasisMinutes !== null
                                ? `Measured from the ${friendlyTimeLabel(row.lateBasisMinutes)} cutoff in force that day`
                                : undefined
                            }
                          >
                            {describeLateness(row.lateMinutes)} late
                          </span>
                        ) : row.checkInAt ? (
                          <span className="text-muted-foreground text-xs">On time</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/*
                        A hand-recorded day carries no distance and never has one
                        invented for it — the office's own coordinates would make
                        a claim indistinguishable from somebody who stood there.
                        It names who vouched for it instead.
                      */}
                      <TableCell className="whitespace-nowrap">
                        {row.markedBy ? (
                          <Badge variant="outline">
                            <UserCheck aria-hidden />
                            Recorded by hand
                          </Badge>
                        ) : row.distanceMeters !== null ? (
                          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                            <MapPin className="size-3.5 shrink-0" aria-hidden />
                            {formatDistance(row.distanceMeters)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="whitespace-nowrap">
                        {row.leaveStatus ? <LeaveStatusBadge status={row.leaveStatus} /> : "—"}
                      </TableCell>

                      <TableCell className="pr-4 sm:pr-6">
                        <div className="text-muted-foreground max-w-64 space-y-0.5 text-xs">
                          {row.markedBy && <p className="truncate">Recorded by {row.markedBy.name}</p>}
                          {row.markedReason && <p className="truncate">{row.markedReason}</p>}
                          {row.leaveReason && <p className="truncate">Leave: {row.leaveReason}</p>}
                          {!row.markedBy && !row.markedReason && !row.leaveReason && <span>—</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

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
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** A line of context beneath the tiles, in the wording the report builder uses. */
function Note({
  icon: Icon,
  tone = "neutral",
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: "neutral" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div className="glass-inset text-muted-foreground flex items-start gap-2 rounded-xl p-3 text-sm">
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", tone === "warning" && "text-warning-ink")}
        aria-hidden
      />
      <p>{children}</p>
    </div>
  );
}

/** The shape of the answer, while it is on its way. */
function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <StatCardSkeleton key={index} />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <StatCardSkeleton key={index} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-2xl lg:col-span-3" />
      </div>

      <Skeleton className="h-80 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}
