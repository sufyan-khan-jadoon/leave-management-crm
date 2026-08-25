"use client";

import { useMemo, useState } from "react";
import { ArrowRight, History, Search, SlidersHorizontal } from "lucide-react";

import { AttendanceStatusBadge } from "@/components/shared/attendance-status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiResource } from "@/hooks/use-api-resource";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { toQueryString } from "@/lib/api-client";
import { EDITABLE_DAY_STATUSES } from "@/lib/attendance-edit";
import { formatDate, formatDateTime } from "@/lib/date";
import { dayStatusLabel, roleLabel } from "@/lib/report-labels";
import type { AttendanceChangeLogView, AttendanceDayStatus } from "@/types";

/**
 * Both status filters are built from the same list the editor offers, so a
 * status that stops being editable disappears from here without anybody
 * remembering to remove it.
 */
const STATUS_FILTERS = [
  { value: "ALL", label: "Any status" },
  ...EDITABLE_DAY_STATUSES.map((status) => ({ value: status, label: dayStatusLabel(status) })),
] as const;

/**
 * Who changed what, for whom, and when.
 *
 * Read-only by construction: there is no endpoint to amend or delete one of
 * these rows, and the absence of the verb is the enforcement — the same way
 * `/api/complaints/[id]` has no `PATCH`. An audit somebody can edit is not one.
 *
 * Deliberately plain. It is a table, a search box and four narrowings, because
 * the questions it answers are narrow: what happened to this person, what did
 * this administrator do, and what was changed about this date. Everything on
 * screen is a column the database actually holds, so unlike the attendance
 * roster it is paged and filtered in SQL rather than assembled and sliced in
 * memory.
 */
export function AttendanceChangeLog() {
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [previousStatus, setPreviousStatus] = useState<string>("ALL");
  const [newStatus, setNewStatus] = useState<string>("ALL");
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search.trim(), 350);

  const query = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      date: date || undefined,
      previousStatus: previousStatus === "ALL" ? undefined : previousStatus,
      newStatus: newStatus === "ALL" ? undefined : newStatus,
      page,
      pageSize: 20,
    }),
    [debouncedSearch, date, previousStatus, newStatus, page],
  );

  const { data, loading, error } = useApiResource<AttendanceChangeLogView>(
    `/api/admin/attendance/edits${toQueryString(query)}`,
  );

  const items = data?.items ?? [];
  const hasActiveFilters =
    search !== "" || date !== "" || previousStatus !== "ALL" || newStatus !== "ALL";

  /** Any filter change resets to page 1 so results aren't hidden on a stale page. */
  function change(apply: () => void) {
    apply();
    setPage(1);
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="change-search">Search</Label>
            <div className="relative">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              {/*
                One box over both names, because the log is read from either
                end — what was done *to* somebody, and what somebody *did* — and
                a searcher typing a name rarely knows which of the two they want.
              */}
              <Input
                id="change-search"
                value={search}
                onChange={(event) => change(() => setSearch(event.target.value))}
                placeholder="Employee or administrator"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="change-date">Attendance date</Label>
            {/*
              The day that was corrected, not the day somebody corrected it.
              Labelled in as many words, because the table carries both and they
              are the two questions this log answers separately.
            */}
            <Input
              id="change-date"
              type="date"
              value={date}
              onChange={(event) => change(() => setDate(event.target.value))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="change-from">Changed from</Label>
            <Select
              value={previousStatus}
              onValueChange={(value) => change(() => setPreviousStatus(value))}
            >
              <SelectTrigger id="change-from" className="w-full">
                <SlidersHorizontal className="size-4" aria-hidden />
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="change-to">Changed to</Label>
            <Select value={newStatus} onValueChange={(value) => change(() => setNewStatus(value))}>
              <SelectTrigger id="change-to" className="w-full">
                <SlidersHorizontal className="size-4" aria-hidden />
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-0">
          {loading ? (
            <div className="space-y-3 px-4 sm:px-6">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <EmptyState
              icon={History}
              title="Couldn't load the change log"
              description={error}
              inset={false}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={History}
              title={hasActiveFilters ? "Nothing matches those filters" : "No changes yet"}
              description={
                hasActiveFilters
                  ? "Try a different name, date or status."
                  : "When an administrator corrects a past day, it is recorded here automatically."
              }
              inset={false}
              action={
                hasActiveFilters ? (
                  <Button
                    variant="outline"
                    onClick={() =>
                      change(() => {
                        setSearch("");
                        setDate("");
                        setPreviousStatus("ALL");
                        setNewStatus("ALL");
                      })
                    }
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4 sm:pl-6">Employee</TableHead>
                      <TableHead>Attendance date</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>Changed by</TableHead>
                      <TableHead className="pr-4 text-right sm:pr-6">Changed at</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((edit) => (
                      <TableRow key={edit.id}>
                        <TableCell className="pl-4 sm:pl-6">
                          <p className="font-medium">{edit.employee.name}</p>
                          {edit.employee.department && (
                            <p className="text-muted-foreground text-xs">
                              {edit.employee.department}
                            </p>
                          )}
                        </TableCell>

                        <TableCell className="whitespace-nowrap">{formatDate(edit.date)}</TableCell>

                        {/*
                          Both statuses as the badges they are on the roster, so
                          the log reads in the same vocabulary as the screen the
                          change was made on. `AttendanceStatusBadge` takes its
                          wording from `dayStatusLabel`, which the exports read
                          too — one word per status everywhere.
                        */}
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <AttendanceStatusBadge
                              status={edit.previousStatus as AttendanceDayStatus}
                            />
                            <ArrowRight className="text-muted-foreground size-3.5" aria-hidden />
                            <AttendanceStatusBadge status={edit.newStatus as AttendanceDayStatus} />
                          </div>

                          {/*
                            Beneath the change rather than in a column of its
                            own, because it is null on most rows — the roster
                            corrects a day in one click and says nothing — and a
                            column that is empty four times in five is width
                            spent on whitespace. Where somebody did explain
                            themselves it belongs against the change it explains.
                          */}
                          {edit.note && (
                            <p className="text-muted-foreground mt-1 max-w-72 text-xs">
                              {edit.note}
                            </p>
                          )}
                        </TableCell>

                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/*
                              Null once the account has been deleted — the row
                              outlives the administrator, which is the whole
                              reason the relation is SetNull. Saying so beats a
                              blank cell, which reads as a bug.
                            */}
                            <span className="font-medium">
                              {edit.editedBy?.name ?? "Deleted administrator"}
                            </span>
                            <Badge variant="outline">{roleLabel(edit.editorRole)}</Badge>
                          </div>
                        </TableCell>

                        <TableCell className="text-muted-foreground pr-4 text-right whitespace-nowrap sm:pr-6">
                          {formatDateTime(edit.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {data && (
                <PaginationControls
                  pagination={data.pagination}
                  onPageChange={setPage}
                  label="changes"
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
