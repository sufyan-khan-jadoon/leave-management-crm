"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarOff,
  CheckCircle2,
  CircleDashed,
  Download,
  Eye,
  MapPin,
  Search,
  SlidersHorizontal,
  Users,
  XCircle,
} from "lucide-react";

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
import { useApiResource } from "@/hooks/use-api-resource";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { toQueryString } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import { formatDate, formatDateTime, toIsoDate, todayUtc } from "@/lib/date";
import { formatDistance } from "@/lib/geo";
import { initialsOf } from "@/lib/utils";
import type { AttendanceRosterView, PaginatedEmployees } from "@/types";

const STATUS_FILTERS = [
  { value: "ALL", label: "All statuses" },
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT", label: "Absent" },
  { value: "ON_LEAVE", label: "On leave" },
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
 * Read-only, like the leave screen and for the same kind of reason: presence is
 * proved by standing in the office, so a button here that marked somebody
 * present would be a way around the geofence rather than a convenience.
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

  const { data, loading, error } = useApiResource<AttendanceRosterView>(
    `/api/admin/attendance${toQueryString(query)}`,
  );

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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {loading || !summary ? (
          Array.from({ length: 4 }, (_, index) => <StatCardSkeleton key={index} />)
        ) : (
          <>
            <StatCard label="Expected in" value={summary.expected} icon={Users} tone="neutral" />
            <StatCard label="Present" value={summary.present} icon={CheckCircle2} tone="success" />
            <StatCard label="Absent" value={summary.absent} icon={XCircle} tone="destructive" />
            <StatCard label="On leave" value={summary.onLeave} icon={CalendarOff} tone="warning" />
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

                      <TableCell>
                        <AttendanceStatusBadge status={entry.status} />
                      </TableCell>

                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {entry.attendance ? formatDateTime(entry.attendance.checkInAt) : "—"}
                      </TableCell>

                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {entry.attendance ? formatDistance(entry.attendance.distanceMeters) : "—"}
                      </TableCell>

                      <TableCell className="pr-4 text-right sm:pr-6">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          asChild
                          aria-label={`View ${entry.employee.name}'s profile`}
                        >
                          <Link href={`${ROUTES.adminEmployees}/${entry.employee.id}`}>
                            <Eye className="size-4" />
                          </Link>
                        </Button>
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
    </div>
  );
}
