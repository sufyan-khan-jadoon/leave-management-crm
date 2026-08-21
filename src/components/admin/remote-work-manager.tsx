"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  History,
  House,
  Infinity as InfinityIcon,
  Pencil,
  Plus,
  Search,
  ShieldOff,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { AssignRemoteDialog } from "@/components/admin/assign-remote-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard, StatCardSkeleton } from "@/components/shared/stat-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiClient, toQueryString } from "@/lib/api-client";
import { MAX_REMOTE_WORK_REASON_LENGTH } from "@/lib/constants";
import { formatDate, formatDateTime, toIsoDate } from "@/lib/date";
import { remoteStateLabel, remoteTypeLabel } from "@/lib/remote-work";
import { initialsOf } from "@/lib/utils";
import type { RemoteWorkEventView, RemoteWorkListView, RemoteWorkStateView, RemoteWorkView } from "@/types";

/**
 * How each state reads, and how loudly.
 *
 * None of them is destructive-toned, deliberately. Every one of these is a
 * legitimate outcome — a period that ended did what it was asked to, and one
 * that was revoked was called off on purpose. Colouring either red would make
 * the table read as a list of problems.
 */
const STATE_BADGE: Record<RemoteWorkStateView, "warning" | "secondary" | "outline"> = {
  ACTIVE: "warning",
  SCHEDULED: "outline",
  EXPIRED: "secondary",
  REVOKED: "secondary",
};

const STATE_FILTERS: Array<{ value: RemoteWorkStateView | "ALL"; label: string }> = [
  // Defaults to Active, not All: the question this screen exists to answer is
  // "who is remote", and opening on a list that mixes in every period since the
  // company started would answer a different one.
  { value: "ACTIVE", label: "Currently remote" },
  { value: "SCHEDULED", label: "Starting later" },
  { value: "EXPIRED", label: "Ended" },
  { value: "REVOKED", label: "Revoked" },
  { value: "ALL", label: "All arrangements" },
];

const POPULATION_FILTERS = [
  { value: "ALL", label: "Everyone" },
  { value: "EMPLOYEE", label: "Employees" },
  { value: "ADMIN", label: "Administrators" },
] as const;

const ACTION_WORD: Record<RemoteWorkEventView["action"], string> = {
  ASSIGNED: "Assigned",
  MODIFIED: "Period changed",
  REVOKED: "Revoked",
};

/**
 * The remote-work screen.
 *
 * **Read-only without `canManageRemoteWork`.** Every administrator can see who is
 * remote — knowing whether a colleague is expected in the office is ordinary
 * people-management, and the attendance roster beside this already shows it —
 * while the assign button and the row actions need the grant. `canManage` comes
 * back with the list, which is what the API says the service will enforce; the
 * endpoints re-check on every request regardless of what was drawn here.
 *
 * The population filter is a separate question again and answers to
 * `canViewAdminRecords`, so an administrator without it gets a refusal on that
 * control alone rather than an empty screen.
 */
export function RemoteWorkManager() {
  const [data, setData] = useState<RemoteWorkListView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [state, setState] = useState<RemoteWorkStateView | "ALL">("ACTIVE");
  const [population, setPopulation] = useState<(typeof POPULATION_FILTERS)[number]["value"]>("ALL");
  const [page, setPage] = useState(1);

  const [assigning, setAssigning] = useState(false);
  const [editing, setEditing] = useState<RemoteWorkView | null>(null);
  const [revoking, setRevoking] = useState<RemoteWorkView | null>(null);
  const [history, setHistory] = useState<{ assignment: RemoteWorkView; events: RemoteWorkEventView[] } | null>(
    null,
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);

    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const result = await apiClient.get<RemoteWorkListView>(
        `/api/admin/remote-work${toQueryString({ search: debouncedSearch, state, population, page })}`,
      );

      setData(result);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Couldn't load remote work.");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, state, population, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openHistory(assignment: RemoteWorkView) {
    try {
      const result = await apiClient.get<{ items: RemoteWorkEventView[] }>(
        `/api/admin/remote-work/${assignment.id}/history`,
      );

      setHistory({ assignment, events: result.items });
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : "Couldn't load the history.");
    }
  }

  const canManage = data?.canManage ?? false;
  const items = useMemo(() => data?.items ?? [], [data]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {loading || !data ? (
          Array.from({ length: 3 }, (_, index) => <StatCardSkeleton key={index} />)
        ) : (
          <>
            {/*
              People rather than rows — one person can hold a live period and a
              revoked one at the same time, and a tile that counted both would
              overstate how many colleagues are out of the office.
            */}
            <StatCard
              label="Currently remote"
              value={data.summary.activeToday}
              icon={House}
              tone="warning"
              hint="people, right now"
            />
            <StatCard
              label="Starting later"
              value={data.summary.scheduled}
              icon={CalendarClock}
              tone="neutral"
              hint="arranged, not yet in force"
            />
            <StatCard
              label="Until revoked"
              value={data.summary.untilRevoked}
              icon={InfinityIcon}
              tone="neutral"
              hint="permanently remote"
            />
          </>
        )}
      </div>

      <Card className="py-0">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, email, department or job title"
                className="pl-9"
                aria-label="Search remote work"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Select
                value={state}
                onValueChange={(value) => {
                  setState(value as RemoteWorkStateView | "ALL");
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filter by state">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATE_FILTERS.map((filter) => (
                    <SelectItem key={filter.value} value={filter.value}>
                      {filter.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={population}
                onValueChange={(value) => {
                  setPopulation(value as (typeof POPULATION_FILTERS)[number]["value"]);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[160px]" aria-label="Filter by population">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POPULATION_FILTERS.map((filter) => (
                    <SelectItem key={filter.value} value={filter.value}>
                      {filter.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {canManage && (
                <Button onClick={() => setAssigning(true)}>
                  <Plus className="size-4" />
                  Assign remote work
                </Button>
              )}
            </div>
          </div>

          {error && (
            <div className="glass-inset text-destructive-ink rounded-xl p-3 text-sm">{error}</div>
          )}

          {!loading && !error && items.length === 0 ? (
            <EmptyState
              icon={House}
              title={state === "ACTIVE" ? "Nobody is working remotely" : "Nothing to show"}
              description={
                state === "ACTIVE"
                  ? "Everyone is on the ordinary attendance rules. Assign a remote period and those days stop counting towards attendance."
                  : "No arrangements match these filters."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Remote from</TableHead>
                    <TableHead>Remote until</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Assigned by</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="size-8">
                            {item.employee.profilePhoto && (
                              <AvatarImage src={item.employee.profilePhoto} alt="" />
                            )}
                            <AvatarFallback>{initialsOf(item.employee.name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{item.employee.name}</p>
                            <p className="text-muted-foreground truncate text-xs">
                              {item.employee.department ?? item.employee.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDate(item.startDate)}
                      </TableCell>

                      <TableCell className="text-sm whitespace-nowrap">
                        {/*
                          "Until revoked" rather than a blank cell or a fabricated
                          far-future date. The absence of an end is the whole
                          meaning of that option, and an empty cell reads as
                          missing data.
                        */}
                        {item.endDate ? (
                          formatDate(item.endDate)
                        ) : (
                          <span className="text-warning-ink font-medium">Until revoked</span>
                        )}
                        {item.dayCount !== null && (
                          <span className="text-muted-foreground ml-1.5 text-xs">
                            ({item.dayCount} {item.dayCount === 1 ? "day" : "days"})
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        <Badge variant="outline">{remoteTypeLabel(item.type)}</Badge>
                      </TableCell>

                      <TableCell className="text-muted-foreground text-sm">
                        {item.assignedBy.name}
                      </TableCell>

                      <TableCell>
                        <Badge variant={STATE_BADGE[item.state]}>{remoteStateLabel(item.state)}</Badge>
                        {item.state === "REVOKED" && item.revokedBy && (
                          <p className="text-muted-foreground mt-1 text-xs">by {item.revokedBy.name}</p>
                        )}
                      </TableCell>

                      {canManage && (
                        <TableCell className="text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`History for ${item.employee.name}`}
                            onClick={() => void openHistory(item)}
                          >
                            <History className="size-4" />
                          </Button>

                          {/*
                            A revoked period is history and is not editable — the
                            audit trail would otherwise describe an arrangement
                            that never ran. An *ended* one still is, deliberately:
                            "she was working from home last week" is a correction
                            somebody genuinely needs to make.
                          */}
                          {item.state !== "REVOKED" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Edit ${item.employee.name}'s period`}
                              onClick={() => setEditing(item)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                          )}

                          {(item.state === "ACTIVE" || item.state === "SCHEDULED") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Revoke ${item.employee.name}'s remote work`}
                              onClick={() => setRevoking(item)}
                            >
                              <Undo2 className="size-4" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {data && data.pagination.totalPages > 1 && (
            <PaginationControls pagination={data.pagination} onPageChange={setPage} />
          )}

          {!canManage && !loading && !error && (
            <div className="glass-inset text-muted-foreground flex items-start gap-2 rounded-xl p-3 text-sm">
              <ShieldOff className="mt-0.5 size-4 shrink-0" aria-hidden />
              You can see who is working remotely but cannot arrange it. Ask your super administrator
              to enable <strong>Arrange remote work</strong> on the Access screen.
            </div>
          )}
        </CardContent>
      </Card>

      <AssignRemoteDialog open={assigning} onOpenChange={setAssigning} onAssigned={load} />

      {editing && (
        <EditRemoteDialog
          assignment={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}

      {revoking && (
        <RevokeRemoteDialog
          assignment={revoking}
          onClose={() => setRevoking(null)}
          onRevoked={async () => {
            setRevoking(null);
            await load();
          }}
        />
      )}

      {history && (
        <Dialog open onOpenChange={() => setHistory(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Remote work history</DialogTitle>
              <DialogDescription>
                {history.assignment.employee.name} — every decision taken about this arrangement.
              </DialogDescription>
            </DialogHeader>

            <ol className="max-h-96 space-y-3 overflow-y-auto">
              {history.events.map((event) => (
                <li key={event.id} className="border-border/60 rounded-lg border px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{ACTION_WORD[event.action]}</Badge>
                    <span className="text-muted-foreground text-xs">
                      {formatDateTime(event.createdAt)}
                      {event.actor ? ` · ${event.actor.name}` : ""}
                    </span>
                  </div>

                  {/*
                    Both periods, because "now runs to 15 September" leaves a
                    reader unable to tell whether that is longer or shorter than
                    what it replaced — which is the one thing they came here for.
                  */}
                  {event.previousStart && (
                    <p className="text-muted-foreground mt-1.5 text-xs">
                      Was {formatDate(event.previousStart)} –{" "}
                      {event.previousEnd ? formatDate(event.previousEnd) : "until revoked"}
                    </p>
                  )}
                  {event.newStart && (
                    <p className="mt-0.5 text-xs">
                      {event.previousStart ? "Now" : "Set to"} {formatDate(event.newStart)} –{" "}
                      {event.newEnd ? formatDate(event.newEnd) : "until revoked"}
                    </p>
                  )}
                  {event.reason && <p className="mt-1 text-sm">{event.reason}</p>}
                </li>
              ))}

              {history.events.length === 0 && (
                <li className="text-muted-foreground py-6 text-center text-sm">
                  Nothing recorded for this arrangement.
                </li>
              )}
            </ol>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/**
 * Moving a period's dates.
 *
 * The duration picker is deliberately absent: "make it one week" means nothing
 * about a period that has already been running for three days, so an edit names
 * the two dates directly. Clearing the end date is how a bounded period becomes
 * permanent, which is why the field has its own button rather than relying on an
 * empty input — an empty date box is ambiguous between "no end" and "not filled
 * in yet", and only the server can tell them apart if the client cannot.
 */
function EditRemoteDialog({
  assignment,
  onClose,
  onSaved,
}: {
  assignment: RemoteWorkView;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [startDate, setStartDate] = useState(toIsoDate(new Date(assignment.startDate)));
  const [endDate, setEndDate] = useState(
    assignment.endDate ? toIsoDate(new Date(assignment.endDate)) : "",
  );
  const [permanent, setPermanent] = useState(assignment.endDate === null);
  const [reason, setReason] = useState(assignment.reason);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    if (!permanent && !endDate) {
      toast.error("Choose an end date, or make the arrangement permanent.");
      return;
    }

    setSaving(true);

    try {
      const result = await apiClient.patch<{ assignment: RemoteWorkView; emailSent: boolean }>(
        `/api/admin/remote-work/${assignment.id}`,
        { startDate, endDate: permanent ? null : endDate, reason: reason.trim() },
      );

      toast.success(`${assignment.employee.name} is remote ${result.assignment.periodLabel}.`);

      if (!result.emailSent && result.assignment.periodLabel !== assignment.periodLabel) {
        toast.warning(`${assignment.employee.name} could not be emailed about the change.`);
      }

      await onSaved();
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : "Couldn't update that period.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit remote period</DialogTitle>
          <DialogDescription>
            {assignment.employee.name} — currently {assignment.periodLabel.toLowerCase()}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-start">Start date</Label>
              <Input
                id="edit-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-end">End date</Label>
              <Input
                id="edit-end"
                type="date"
                value={endDate}
                min={startDate || undefined}
                disabled={permanent}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>

          <label className="border-border/60 bg-muted/30 flex items-center gap-3 rounded-lg border px-3 py-2">
            <input
              type="checkbox"
              checked={permanent}
              onChange={(event) => setPermanent(event.target.checked)}
              className="accent-primary size-4"
            />
            <span className="text-sm">No end date — remote until revoked</span>
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="edit-reason">Reason</Label>
            <Textarea
              id="edit-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={MAX_REMOTE_WORK_REASON_LENGTH}
              rows={3}
            />
          </div>

          <p className="text-muted-foreground text-xs">
            Moving the dates emails {assignment.employee.name} with both the old and the new period.
            Changing only the reason does not — a corrected typo is not news.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            Save period
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Calling a period off.
 *
 * States the day attendance resumes rather than the fact of revoking, because
 * those are what an administrator and the person affected actually need — and
 * because the days already worked remotely are *kept*, which is the part most
 * likely to be misread as a bug if it goes unsaid.
 */
function RevokeRemoteDialog({
  assignment,
  onClose,
  onRevoked,
}: {
  assignment: RemoteWorkView;
  onClose: () => void;
  onRevoked: () => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function revoke() {
    if (saving) return;
    setSaving(true);

    try {
      // No body at all when nothing was typed, rather than `{ reason: "" }` —
      // the route reads an empty body as "no reason given", and an empty string
      // would fail the schema's minimum length instead.
      const result = await apiClient.delete<{ emailSent: boolean; resumesOn: string }>(
        `/api/admin/remote-work/${assignment.id}`,
        reason.trim() ? { reason: reason.trim() } : undefined,
      );

      toast.success(
        `${assignment.employee.name} is back on normal attendance from ${formatDate(result.resumesOn)}.`,
      );

      if (!result.emailSent) {
        toast.warning(`${assignment.employee.name} could not be emailed about it.`);
      }

      await onRevoked();
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : "Couldn't revoke that period.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revoke remote work</DialogTitle>
          <DialogDescription>
            {assignment.employee.name} — {assignment.periodLabel}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="glass-inset text-muted-foreground rounded-xl p-3 text-sm">
            The days already worked remotely stay exempt from attendance — nothing is undone. What
            changes is the future: {assignment.employee.name} is expected in the office from tomorrow
            and will need to mark attendance as usual. They will be emailed about it.
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="revoke-reason">Reason (optional)</Label>
            <Textarea
              id="revoke-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={MAX_REMOTE_WORK_REASON_LENGTH}
              rows={2}
              placeholder="Office refit finished"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void revoke()} loading={saving}>
            <Undo2 className="size-4" />
            Revoke remote work
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
