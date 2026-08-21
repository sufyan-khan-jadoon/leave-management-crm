"use client";

import {
  CalendarCheck,
  CalendarOff,
  CheckCircle2,
  CircleDashed,
  Clock,
  House,
  Palmtree,
  XCircle,
} from "lucide-react";

import { StatCard } from "@/components/shared/stat-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/date";
import { describeLateness } from "@/lib/lateness";
import { roleLabel } from "@/lib/report-labels";
import { initialsOf } from "@/lib/utils";
import type { ReportRecordTypeView, ReportView } from "@/types";

/**
 * What a report adds up to, overall and person by person.
 *
 * **Every tile here is rendered from a number the server computed**, never from
 * anything summed in the browser. The rows are paged, so a total counted on this
 * side would describe page one and claim to describe the report.
 *
 * Which tiles appear follows the record types the report was generated with,
 * which is the same thing as following the rows it holds: a report that asked
 * for leave alone has no absences in it, and a tile reading "Absent: 0" beside
 * that is a statement about the whole period rather than about the report — the
 * two are different, and the wrong one reads as good news.
 */
export function ReportSummary({ report }: { report: ReportView }) {
  const shows = (type: ReportRecordTypeView) => report.recordTypes.includes(type);

  // Whether the period actually holds any remote day for anybody, which is a
  // different question from whether the record type was asked for — see the
  // eligible-days note below.
  const anyRemote = report.summaries.some((summary) => summary.coverage.remoteDays > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/*
          A property of the calendar rather than a sum, and labelled as one.
          Adding 22 working days across eleven people to report 242 is a number
          nobody asked for and everybody misreads.
        */}
        <StatCard
          label="Working days"
          value={report.coverage.workingDays}
          icon={CalendarCheck}
          tone="neutral"
          hint="per person, in this period"
        />
        <StatCard
          label="Days off"
          value={report.coverage.daysOff}
          icon={CalendarOff}
          tone="neutral"
          hint={
            report.coverage.closedDays > 0
              ? `${report.coverage.closedDays} office ${report.coverage.closedDays === 1 ? "closure" : "closures"}, rest weekly`
              : "weekly days off"
          }
        />

        {shows("ATTENDANCE") && (
          <>
            <StatCard
              label="Present days"
              value={report.totals.present}
              icon={CheckCircle2}
              tone="success"
            />
            {/*
              Labelled as a share of Present rather than as a total of its own,
              because it is one: somebody late was still there, and tiles that
              summed past the day count would read as a bug. The same
              relationship the attendance roster's tiles already carry.
            */}
            <StatCard
              label={`Late (of ${report.totals.present} present)`}
              value={report.totals.late}
              icon={Clock}
              tone="warning"
              hint={
                report.totals.lateMinutes > 0
                  ? `${report.totals.lateMinutes} minutes late in total`
                  : "nobody arrived past the deadline"
              }
            />
          </>
        )}

        {shows("ABSENT") && (
          <StatCard label="Absent days" value={report.totals.absent} icon={XCircle} tone="destructive" />
        )}

        {shows("LEAVE") && (
          <StatCard label="Leave days" value={report.totals.onLeave} icon={Palmtree} tone="warning" />
        )}

        {shows("REMOTE") && (
          <StatCard label="Remote days" value={report.totals.remote} icon={House} tone="warning" />
        )}
      </div>

      {/*
        §12's arithmetic, stated rather than left to be worked out. The tiles
        above give present and absent; without this line somebody reads them
        against "Working days" and gets the wrong denominator — 16 of 22 rather
        than 16 of 17. Shown whenever the period actually holds a remote day, not
        only when the record type was ticked, because the sum is wrong either way
        and hiding it does not make it right.
      */}
      {report.coverage.remoteDays > 0 && (
        <div className="glass-inset text-muted-foreground flex items-start gap-2 rounded-xl p-3 text-sm">
          <House className="text-warning-ink mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <span className="text-foreground font-medium">
              {report.coverage.attendanceEligibleDays} attendance-eligible{" "}
              {report.coverage.attendanceEligibleDays === 1 ? "day" : "days"}
            </span>{" "}
            — {report.coverage.workingDays} working{" "}
            {report.coverage.workingDays === 1 ? "day" : "days"} less{" "}
            {report.coverage.remoteDays} spent working remotely. Remote days are exempt from
            attendance: nobody is present or absent for them and they cost no leave, so any
            attendance percentage should be measured against this figure rather than the working
            days.
          </p>
        </div>
      )}

      {/*
        A period holding nothing, said out loud rather than left as a run of
        zeroes. After a reset — or before a company has recorded anything — every
        working day holds no check-in and no leave for anybody, and nobody is
        marked absent for it. A report that showed "0 absent" without this would
        read as a clean month.
      */}
      {report.coverage.noRecordDays > 0 && (
        <div className="glass-inset text-muted-foreground flex items-start gap-2 rounded-xl p-3 text-sm">
          <CircleDashed className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            {report.coverage.noRecordDays} working{" "}
            {report.coverage.noRecordDays === 1 ? "day in this period holds" : "days in this period hold"}{" "}
            nothing at all — no check-ins and no leave for anybody in the company. Nobody is counted
            absent for {report.coverage.noRecordDays === 1 ? "it" : "them"}, and{" "}
            {report.coverage.noRecordDays === 1 ? "it appears" : "they appear"} in no record below.
          </p>
        </div>
      )}

      {report.coverage.upcomingDays > 0 && (
        <div className="glass-inset text-muted-foreground flex items-start gap-2 rounded-xl p-3 text-sm">
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            This period reaches {report.coverage.upcomingDays} working{" "}
            {report.coverage.upcomingDays === 1 ? "day" : "days"} that {report.coverage.upcomingDays === 1 ? "has" : "have"}{" "}
            not happened yet. Nobody can have missed{" "}
            {report.coverage.upcomingDays === 1 ? "it" : "them"}, so{" "}
            {report.coverage.upcomingDays === 1 ? "it is" : "they are"} counted as neither present nor
            absent. Leave booked across {report.coverage.upcomingDays === 1 ? "it" : "them"} still
            appears.
          </p>
        </div>
      )}

      {/*
        Individual summaries. Shown whenever the report covers anybody at all,
        including a single person — a report about one person is exactly the
        place their own totals belong, and hiding the section for them would mean
        the numbers moved depending on how many colleagues were selected.
      */}
      {report.summaries.length > 0 && (
        <Card className="py-0">
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <h3 className="text-sm font-semibold tracking-[-0.012em]">Individual summary</h3>
              <span className="text-muted-foreground text-xs tabular-nums">
                {report.peopleCount} {report.peopleCount === 1 ? "person" : "people"}
              </span>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4 sm:pl-6">Person</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Working days</TableHead>
                    {/*
                      Shown whenever anybody in the report holds a remote day,
                      not only when the record type was ticked — this is the pair
                      of numbers that makes "22 working days, 16 present, 1
                      absent" add up, and a reader owed them is owed them either
                      way. The exports apply the same rule.
                    */}
                    {anyRemote && <TableHead className="text-right">Remote</TableHead>}
                    {anyRemote && <TableHead className="text-right">Eligible</TableHead>}
                    {shows("ATTENDANCE") && <TableHead className="text-right">Present</TableHead>}
                    {shows("ABSENT") && <TableHead className="text-right">Absent</TableHead>}
                    {shows("LEAVE") && <TableHead className="text-right">Leave</TableHead>}
                    {shows("ATTENDANCE") && <TableHead className="text-right">Late</TableHead>}
                    {shows("ATTENDANCE") && (
                      <TableHead className="pr-4 text-right sm:pr-6">Minutes late</TableHead>
                    )}
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {report.summaries.map((summary) => (
                    <TableRow key={summary.employee.id}>
                      <TableCell className="pl-4 sm:pl-6">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="size-8">
                            {summary.employee.profilePhoto && (
                              <AvatarImage src={summary.employee.profilePhoto} alt="" />
                            )}
                            <AvatarFallback>{initialsOf(summary.employee.name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{summary.employee.name}</p>
                            <p className="text-muted-foreground truncate text-xs">
                              {summary.employee.email}
                            </p>
                            {/*
                              Reported, never acted on. A day before somebody's
                              first one is judged exactly as the attendance
                              roster judges it — quietly reclassifying it here
                              would be a second opinion about a date, which is
                              the one thing a report must not form.
                            */}
                            {summary.joinedDuringPeriod && (
                              <p className="text-warning-ink text-xs">
                                Joined {formatDate(summary.joinedDuringPeriod)} — part of this period
                                predates them
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline">{roleLabel(summary.employee.role)}</Badge>
                          {summary.employee.status !== "ACTIVE" && (
                            <Badge variant="warning">Suspended</Badge>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-right tabular-nums">
                        {summary.coverage.workingDays}
                      </TableCell>

                      {anyRemote && (
                        <TableCell className="text-right tabular-nums">
                          {summary.coverage.remoteDays}
                        </TableCell>
                      )}
                      {anyRemote && (
                        <TableCell className="text-right tabular-nums">
                          {summary.coverage.attendanceEligibleDays}
                        </TableCell>
                      )}

                      {shows("ATTENDANCE") && (
                        <TableCell className="text-right tabular-nums">{summary.totals.present}</TableCell>
                      )}
                      {shows("ABSENT") && (
                        <TableCell className="text-right tabular-nums">{summary.totals.absent}</TableCell>
                      )}
                      {shows("LEAVE") && (
                        <TableCell className="text-right tabular-nums">{summary.totals.onLeave}</TableCell>
                      )}
                      {shows("ATTENDANCE") && (
                        <TableCell className="text-right tabular-nums">{summary.totals.late}</TableCell>
                      )}
                      {shows("ATTENDANCE") && (
                        <TableCell className="pr-4 text-right whitespace-nowrap sm:pr-6">
                          {summary.totals.lateMinutes > 0 ? (
                            <span className="text-warning-ink text-xs font-medium">
                              {describeLateness(summary.totals.lateMinutes)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground tabular-nums">0</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
