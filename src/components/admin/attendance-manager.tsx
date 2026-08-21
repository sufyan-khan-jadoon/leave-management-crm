"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarOff,
  CheckCircle2,
  CircleDashed,
  Clock,
  Download,
  Eye,
  House,
  MapPin,
  Search,
  SlidersHorizontal,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { AttendanceStatusBadge } from "@/components/shared/attendance-status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard, StatCardSkeleton } from "@/components/shared/stat-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useApiResource } from "@/hooks/use-api-resource";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiClientError, apiClient, toQueryString } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import {
  describeHrMarkWindow,
  formatWindowCountdown,
  friendlyTimeLabel,
  isAfterClosing,
  timeLabelToMinutes,
} from "@/lib/attendance-policy";
import { currentAppZoneTimeInput, formatDate, formatDateTime, toIsoDate, todayUtc } from "@/lib/date";
import { formatDistance } from "@/lib/geo";
import { describeLateness, minutesLate } from "@/lib/lateness";
import { initialsOf } from "@/lib/utils";
import type { AttendanceRosterView, PaginatedEmployees } from "@/types";

const STATUS_FILTERS = [
  { value: "ALL", label: "All statuses" },
  { value: "PRESENT", label: "Present" },
  // Narrows within Present rather than beside it — somebody late was still
  // there. See `attendanceRosterQuerySchema`.
  { value: "LATE", label: "Late" },
  { value: "ABSENT", label: "Absent" },
  { value: "ON_LEAVE", label: "On leave" },
  // A real day status, unlike LATE above: these people are exempt from the
  // register rather than a narrowing of somebody already on it.
  { value: "REMOTE", label: "Remote" },
  { value: "NO_RECORD", label: "No record" },
] as const;

/**
 * The super admin's population filter.
 *
 * `Administrators` covers the super admin as well as the administrators, which
 * is why the field is not called `role` — see `attendanceRosterQuerySchema`.
 * Between them the two options account for everybody, so nobody falls out of
 * the organisation's own attendance figures by belonging to neither.
 */
const POPULATION_FILTERS = [
  { value: "ALL", label: "Everyone" },
  { value: "EMPLOYEE", label: "Employees" },
  { value: "ADMIN", label: "Administrators" },
] as const;

/**
 * The organisation-wide attendance view, and it is day-centric on purpose.
 *
 * "Present or absent" is only answerable about one day at a time — absence is
 * the *lack* of a check-in, so it exists per person per day rather than as rows
 * to page through. Moving the date is therefore how history is read, and it is
 * the first control on the screen for that reason.
 *
 * Read-only but for one act, and the exception is deliberately narrow: an
 * administrator holding `canMarkAttendance` may turn an **absent** day into a
 * present one. Presence is still proved by standing in the office — this exists
 * for the case that rule cannot serve, where somebody came in and their phone
 * did not cooperate. The button appears on no other status, and the server
 * refuses every other status regardless of what renders here.
 */
export function AttendanceManager({
  /**
   * Whether to offer the population filter. Decided on the server from the
   * session and passed in, never worked out here — and the endpoint refuses the
   * filter to anyone else however this renders.
   */
  canFilterByPopulation = false,
}: {
  canFilterByPopulation?: boolean;
}) {
  const [date, setDate] = useState(() => toIsoDate(todayUtc()));
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("ALL");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["value"]>("ALL");
  const [population, setPopulation] = useState<(typeof POPULATION_FILTERS)[number]["value"]>("ALL");
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search.trim(), 350);

  const query = useMemo(
    () => ({
      date,
      search: debouncedSearch || undefined,
      department: department === "ALL" ? undefined : department,
      status,
      // Left off entirely unless it is actually narrowing something, so an
      // ordinary administrator never sends the parameter the server refuses.
      population: population === "ALL" ? undefined : population,
      page,
      pageSize: 20,
    }),
    [date, debouncedSearch, department, status, population, page],
  );

  const { data, loading, error, refresh } = useApiResource<AttendanceRosterView>(
    `/api/admin/attendance${toQueryString(query)}`,
  );

  /** The person about to be recorded present, and what goes with it. */
  const [pending, setPending] = useState<{ id: string; name: string } | null>(null);
  const [arrivalTime, setArrivalTime] = useState("");
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);

  const cutoffMinutes = data?.cutoffMinutes ?? null;
  const closingMinutes = data?.closingMinutes ?? null;
  const hrWindow = data?.hrMarkWindow ?? null;

  /**
   * How far this browser's clock is from the server's, measured once per
   * response.
   *
   * The countdown is drawn from `expiresAt`, which is an instant the server
   * computed — so a machine set an hour fast would otherwise render a window
   * that had already closed, or worse one that had not. Correcting for the
   * difference keeps the number honest without ever making the browser the
   * authority: the endpoint judges every request against its own clock, and this
   * is only here so the figure on screen agrees with the answer that comes back.
   */
  const clockSkewMs = useMemo(
    () => (data ? Date.now() - Date.parse(data.serverTime) : 0),
    [data],
  );

  // Ticks only while there is a live window to count down, so an expired one —
  // or a super admin, whom it does not bind — costs no timer at all.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!hrWindow?.boundByWindow) return;

    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hrWindow?.boundByWindow, hrWindow?.expiresAt]);

  /**
   * What remains of the window, and whether anything does.
   *
   * Derived from the expiry rather than from a duration started at page load,
   * which is the whole of requirement: refreshing, reopening the page, signing
   * out and back in, or having a second tab open all land on the same moment
   * because they all read the same timestamp. Nothing here restarts.
   */
  const windowRemainingMs = hrWindow ? Date.parse(hrWindow.expiresAt) - (now - clockSkewMs) : 0;
  const windowOpen = hrWindow ? !hrWindow.boundByWindow || windowRemainingMs > 0 : false;

  /**
   * What the typed arrival time would come to, shown while it is being typed.
   *
   * A courtesy only — every one of these is judged again on the server, exactly
   * as `EmailAttachmentsField` warns about a file the service re-judges. It
   * exists because "17:15" and "15 min late" are not the same thought, and the
   * person typing the first is deciding the second.
   */
  const arrivalVerdict = useMemo(() => {
    if (cutoffMinutes === null || closingMinutes === null) return null;

    const minutes = timeLabelToMinutes(arrivalTime);
    if (minutes === null) return null;

    // Refused before it can be submitted. The server refuses it too; this is so
    // the answer arrives while the field is still in front of somebody.
    if (isAfterClosing(minutes, closingMinutes)) {
      return {
        blocked: true,
        text: `The office closes at ${friendlyTimeLabel(closingMinutes)} — nobody can have arrived then.`,
      };
    }

    return { blocked: false, text: describeLateness(minutesLate(minutes, cutoffMinutes)) ?? "On time" };
  }, [arrivalTime, cutoffMinutes, closingMinutes]);

  function openMarkDialog(employee: { id: string; name: string }) {
    setPending(employee);
    // Prefilled with the office's current time rather than left empty: the
    // common case is somebody who has just walked in. It is a starting value a
    // person can see and correct, which is a different thing from a default
    // applied silently — that default was the bug this field exists to fix.
    setArrivalTime(currentAppZoneTimeInput());
    setReason("");
  }

  async function markPresent() {
    if (!pending) return;
    setWorking(true);

    try {
      // `date` is the day on screen, not today — correcting a day that has
      // already gone wrong is the entire purpose, so the selected date travels
      // with the request and the server judges that day rather than this one.
      const result = await apiClient.post<{ alreadyMarked: boolean; attendance: { lateMinutes: number } }>(
        "/api/admin/attendance/mark",
        { employeeId: pending.id, date, arrivalTime, reason: reason.trim() || undefined },
      );

      // A row that was already there is not a correction anybody just made.
      // Saying so is the difference between "done" and "somebody beat you to it".
      // The lateness comes back from the server rather than being re-derived
      // here, so the sentence somebody reads is the figure that was actually
      // stored — not the preview, which may have been computed against a cutoff
      // that changed while the dialog was open.
      const late = describeLateness(result.attendance.lateMinutes);

      toast.success(
        result.alreadyMarked
          ? `${pending.name} was already marked present for ${formatDate(date)}.`
          : late
            ? `Employee marked as Present successfully — ${late}.`
            : "Employee marked as Present successfully.",
      );

      setPending(null);
      setReason("");
      // The roster is re-fetched rather than patched in place, so the status,
      // the tiles above it and the totals all come from the server that just
      // decided them — and a refresh of the page shows exactly the same thing.
      await refresh();
    } catch (submitError) {
      // The original status is untouched: nothing was written, and the row on
      // screen is still whatever the last fetch said. The dialog stays open so
      // the reason typed into it is not thrown away with the error.
      toast.error(
        submitError instanceof ApiClientError
          ? submitError.message
          : "Couldn't record that attendance. The status is unchanged.",
      );
    } finally {
      setWorking(false);
    }
  }

  // Borrowed purely for its department list, the way the leave screen does.
  const { data: employeeData } = useApiResource<PaginatedEmployees>("/api/admin/employees?pageSize=1");
  const departments = employeeData?.departments ?? [];

  const exportUrl = `/api/admin/attendance/export${toQueryString({ ...query, page: undefined, pageSize: undefined })}`;

  const hasActiveFilters =
    search !== "" || department !== "ALL" || status !== "ALL" || population !== "ALL";

  /** Any filter change resets to page 1 so results aren't hidden on a stale page. */
  function change(apply: () => void) {
    apply();
    setPage(1);
  }

  const entries = data?.items ?? [];
  const summary = data?.summary;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {loading || !summary ? (
          Array.from({ length: 6 }, (_, index) => <StatCardSkeleton key={index} />)
        ) : (
          <>
            <StatCard label="Expected in" value={summary.expected} icon={Users} tone="neutral" />
            <StatCard label="Present" value={summary.present} icon={CheckCircle2} tone="success" />
            {/*
              Labelled as a share of Present rather than as a total of its own,
              because it is one: somebody late is counted in both, and four
              tiles that summed past the headcount would read as a bug.
            */}
            <StatCard
              label={`Late (of ${summary.present} present)`}
              value={summary.late}
              icon={Clock}
              tone="warning"
            />
            <StatCard label="Absent" value={summary.absent} icon={XCircle} tone="destructive" />
            <StatCard label="On leave" value={summary.onLeave} icon={CalendarOff} tone="warning" />
            {/*
              A tile beside Present and Absent rather than folded into either,
              because a remote day is neither — and, unlike Late, it *is* a
              column of its own: these people are counted once, in Expected and
              here, so the four outcome tiles still sum to the headcount.
            */}
            <StatCard label="Remote" value={summary.remote} icon={House} tone="warning" />
          </>
        )}
      </div>

      <Card className="py-0">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="attendance-date">Date</Label>
              <Input
                id="attendance-date"
                type="date"
                value={date}
                max={toIsoDate(todayUtc())}
                onChange={(event) => change(() => setDate(event.target.value))}
                className="w-44"
              />
            </div>

            <div className="relative flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(event) => change(() => setSearch(event.target.value))}
                placeholder="Search name, email, department…"
                className="pl-9"
                aria-label="Search people"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canFilterByPopulation && (
                <Select
                  value={population}
                  onValueChange={(value) => change(() => setPopulation(value as typeof population))}
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

              <Select
                value={status}
                onValueChange={(value) => change(() => setStatus(value as typeof status))}
              >
                <SelectTrigger className="w-36" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {departments.length > 0 && (
                <Select
                  value={department}
                  onValueChange={(value) => change(() => setDepartment(value))}
                >
                  <SelectTrigger className="w-44" aria-label="Filter by department">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All departments</SelectItem>
                    {departments.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    change(() => {
                      setSearch("");
                      setDepartment("ALL");
                      setStatus("ALL");
                      setPopulation("ALL");
                    })
                  }
                >
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

          {/*
            Both reasons a day expects nobody are announced, and the declared
            closure wins when they coincide: "closed for Independence Day" says
            more than "it was a Saturday". Without the second line a weekend
            roster would read as a day the whole company failed to turn up.
          */}
          {data && (data.officeClosed || !data.isWorkingDay) && (
            <div className="glass-inset text-muted-foreground flex items-center gap-2 rounded-xl p-3 text-sm">
              <CalendarOff className="size-4 shrink-0" aria-hidden />
              {data.officeClosed
                ? `The office was closed on ${formatDate(data.date)}. Nobody was expected in, and the day cost nobody a leave.`
                : `${formatDate(data.date)} is not a working day. Nobody was expected in, nobody is marked absent, and the day cost nobody a leave.`}
            </div>
          )}

          {/*
            The window this administrator has to record somebody present, and
            what is left of it.

            Shown only to somebody who may actually mark and is actually bound —
            the super admin is not, and a viewer without the grant has no button
            for it to be about. Everything in it is drawn from `expiresAt`, an
            instant the server computed from the day's own cutoff, so it survives
            a refresh and cannot be extended by a browser clock. It is rendering
            and never permission: the endpoint asks again on every request.
          */}
          {data?.canMarkAttendance && hrWindow?.boundByWindow && (
            <div
              className={
                windowOpen
                  ? "glass-inset flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl p-3 text-sm"
                  : "border-warning/40 bg-warning/10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border p-3 text-sm"
              }
            >
              <Clock
                className={windowOpen ? "text-primary-ink size-4 shrink-0" : "text-warning-ink size-4 shrink-0"}
                aria-hidden
              />

              {windowOpen ? (
                <>
                  <span className="font-medium">Mark-present window</span>
                  <span
                    className="text-primary-ink font-mono text-base font-semibold tabular-nums"
                    // Read out as it changes would be unbearable; the sentence
                    // beside it already says when the window closes.
                    aria-live="off"
                  >
                    {formatWindowCountdown(windowRemainingMs)}
                  </span>
                  <span className="text-muted-foreground">
                    left. Runs {describeHrMarkWindow(hrWindow.minutes)} past the{" "}
                    {cutoffMinutes !== null ? friendlyTimeLabel(cutoffMinutes) : "day's"} cutoff, so it
                    closes at {formatDateTime(hrWindow.expiresAt)}.
                  </span>
                </>
              ) : (
                <span className="text-warning-ink">
                  The mark-present window closed at {formatDateTime(hrWindow.expiresAt)}. Nobody can be
                  recorded present for {formatDate(data.date)} through this screen any more — ask the
                  super administrator, who is not bound by the window.
                </span>
              )}
            </div>
          )}

          {/*
            A day with nothing recorded against it, said out loud.

            The roster is built from the staff list, so it lists everybody
            however empty the tables are — which is exactly what a reset that
            deleted nothing would look like. The rows are deliberately not
            hidden: "who was in" is the question this screen exists to answer,
            and an empty table would answer it with silence. Only shown when no
            filter is narrowing the view, so it cannot be read as a claim about
            a subset.
          */}
          {data &&
            !loading &&
            !error &&
            !data.officeClosed &&
            data.isWorkingDay &&
            !hasActiveFilters &&
            summary !== undefined &&
            summary.present === 0 &&
            summary.onLeave === 0 &&
            // Withheld once anybody is remote, because then the claim below is
            // false: those rows read Remote rather than No record, and a note
            // saying "everyone" would be describing a table it can see is mixed.
            summary.remote === 0 &&
            entries.length > 0 && (
              <div className="glass-inset text-muted-foreground flex items-center gap-2 rounded-xl p-3 text-sm">
                <CircleDashed className="size-4 shrink-0" aria-hidden />
                Nothing is recorded for {formatDate(data.date)} — no check-ins and no leave for
                anybody. Everyone below reads <strong>No record</strong> rather than absent: with no
                evidence either way the day was never watched, so nobody is marked down for it and
                nobody is sent a warning letter about it.
              </div>
            )}

          {loading && (
            <div className="space-y-3 py-2">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="flex items-center gap-4">
                  <Skeleton className="h-9 w-48" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-5 flex-1" />
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <EmptyState icon={MapPin} title="Couldn't load attendance" description={error} />
          )}

          {!loading && !error && entries.length === 0 && (
            <EmptyState
              icon={MapPin}
              title={hasActiveFilters ? "Nobody matches those filters" : "Nobody on the roster"}
              description={
                hasActiveFilters
                  ? "Try widening the search, or clearing the status filter."
                  : "Active people appear here with their attendance for the chosen day."
              }
              inset={false}
            />
          )}

          {!loading && !error && entries.length > 0 && (
            <div className="-mx-4 overflow-x-auto sm:-mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4 sm:pl-6">Employee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>Distance</TableHead>
                    <TableHead className="pr-4 text-right sm:pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.employee.id}>
                      <TableCell className="pl-4 sm:pl-6">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="size-8">
                            {entry.employee.profilePhoto && (
                              <AvatarImage src={entry.employee.profilePhoto} alt="" />
                            )}
                            <AvatarFallback>{initialsOf(entry.employee.name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{entry.employee.name}</p>
                            <p className="text-muted-foreground truncate text-xs">
                              {entry.employee.department ?? "No department"}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      {/*
                        Present and late is still Present — the badge does not
                        change, because they were there. The lateness rides
                        beside it as a qualifier rather than replacing it, which
                        is the same relationship the tile above has to its count.
                      */}
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <AttendanceStatusBadge status={entry.status} />
                          {entry.attendance && entry.attendance.lateMinutes > 0 && (
                            <span className="text-warning-ink text-xs font-medium whitespace-nowrap">
                              {describeLateness(entry.attendance.lateMinutes)}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {entry.attendance ? formatDateTime(entry.attendance.checkInAt) : "—"}
                      </TableCell>

                      {/*
                        A distance, or who vouched for the day when there is no
                        distance to show. The two are mutually exclusive by
                        construction, so this column never has to invent a
                        number — a recorded-by-hand row would otherwise read as
                        "0 m", which is a claim that somebody stood at the door.
                      */}
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {!entry.attendance ? (
                          "—"
                        ) : entry.attendance.distanceMeters !== null ? (
                          formatDistance(entry.attendance.distanceMeters)
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5"
                            title={entry.attendance.reason ?? undefined}
                          >
                            <UserCheck className="size-3.5 shrink-0" aria-hidden />
                            Marked by {entry.attendance.markedBy?.name ?? "an administrator"}
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="pr-4 text-right sm:pr-6">
                        <div className="flex items-center justify-end gap-1">
                          {/*
                            Offered on ABSENT alone. Never on NO_RECORD: a day
                            holding nothing for anybody has no absentees on it,
                            and writing one row would flip every colleague to
                            absent at once — see the service, which refuses it.
                          */}
                          {data?.canMarkAttendance && entry.status === "ABSENT" && (
                            <Button
                              variant="outline"
                              size="sm"
                              // Rendered rather than removed once the window has
                              // gone, and labelled with the reason. A button that
                              // silently disappears reads as a permission lost or
                              // a screen gone wrong; one that says why reads as a
                              // deadline, which is what it is.
                              disabled={!windowOpen}
                              onClick={() =>
                                openMarkDialog({ id: entry.employee.id, name: entry.employee.name })
                              }
                            >
                              <UserCheck className="size-4" />
                              {windowOpen ? "Mark present" : "Mark present — window expired"}
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="icon-sm"
                            asChild
                            aria-label={`View ${entry.employee.name}'s profile`}
                          >
                            <Link href={`${ROUTES.adminStaff}/${entry.employee.id}`}>
                              <Eye className="size-4" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {data && (
                <PaginationControls pagination={data.pagination} onPageChange={setPage} label="people" />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/*
        Controlled rather than trigger-based, because the trigger lives in a row
        that re-renders on every refresh — and not `ConfirmDialog`, which takes a
        plain description and has nowhere for the reason box to go.
      */}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next && !working) {
            setPending(null);
            setReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {pending?.name} as present?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Are you sure you want to mark this employee as Present for{" "}
                  <strong>{formatDate(date)}</strong>?
                </p>
                {/*
                  Said plainly, because it is the whole difference between this
                  and a check-in. Somebody pressing it is asserting attendance on
                  their own authority, and the record will say so with their name
                  against it for as long as it exists.
                */}
                <p>
                  This records attendance <strong>without the location check</strong>. It will be
                  saved against your name, and will show as recorded by you everywhere the day
                  appears.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="mark-present-arrival">Actual arrival time</Label>
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  id="mark-present-arrival"
                  type="time"
                  value={arrivalTime}
                  onChange={(event) => setArrivalTime(event.target.value)}
                  className="w-36"
                  required
                />
                {arrivalVerdict && (
                  <span
                    className={
                      arrivalVerdict.blocked
                        ? "text-destructive-ink text-sm font-medium"
                        : arrivalVerdict.text === "On time"
                          ? "text-muted-foreground text-sm"
                          : "text-warning-ink text-sm font-medium"
                    }
                  >
                    {arrivalVerdict.text}
                  </span>
                )}
              </div>
              {/*
                Says which time is being asked for, because the obvious reading
                is "now" and the whole point of the field is that it is not —
                and names both edges, so the refusal above is never a surprise.
              */}
              <p className="text-muted-foreground text-xs">
                When they actually arrived — not when you are recording it.
                {cutoffMinutes !== null && ` Late after ${friendlyTimeLabel(cutoffMinutes)}.`}
                {closingMinutes !== null && ` Cannot be later than ${friendlyTimeLabel(closingMinutes)}, when the office closes.`}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mark-present-reason">Reason (optional)</Label>
              <Textarea
                id="mark-present-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. came in but phone battery died"
                maxLength={280}
                rows={2}
              />
            </div>
          </div>

          <AlertDialogFooter>
            {/*
              Re-checked here as well as on the row, because the window can run
              out while this dialog is open — somebody typing a reason at 5:19
              submits at 5:21. The countdown above keeps ticking underneath it,
              so this goes disabled at the moment the permission does, and the
              server refuses it either way.
            */}
            {!windowOpen && (
              <p className="text-warning-ink mr-auto text-sm">
                The window closed while this was open.
              </p>
            )}
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <Button
              onClick={markPresent}
              loading={working}
              disabled={!arrivalTime || arrivalVerdict?.blocked === true || !windowOpen}
            >
              Mark present
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
