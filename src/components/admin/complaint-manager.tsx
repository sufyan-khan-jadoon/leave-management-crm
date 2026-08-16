"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Eye,
  MailWarning,
  MessageSquareWarning,
  Paperclip,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { ComplaintStatusBadge } from "@/components/complaints/complaint-status-badge";
import { EmptyState } from "@/components/shared/empty-state";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiClientError, apiClient, toQueryString } from "@/lib/api-client";
import { complaintReference } from "@/lib/complaint-reference";
import { COMPLAINT_STATUSES, complaintStatusLabel, requiresResolution } from "@/lib/complaint-status";
import { formatDate, formatDateTime } from "@/lib/date";
import type {
  ComplaintCountsView,
  ComplaintStatusView,
  ComplaintView,
  Pagination,
} from "@/types";

const ANY = "ALL";

type Payload = {
  items: ComplaintView[];
  counts: ComplaintCountsView;
  pagination: Pagination;
};

/**
 * Every complaint, for whoever may read them.
 *
 * The screen is only ever rendered for an account that passed
 * `canManageComplaints` on the server — the page checks before it renders and
 * the endpoint checks again on every request — so there is no "you may not do
 * this" state here. That is the opposite of `CustomEmailComposer`, which has
 * one, and the difference is that email has a useful ungranted screen to show
 * while this would only be a page explaining it is empty.
 *
 * The tiles are **whole-board figures and do not move with the filters**. A
 * "Pending: 3" that changed every time somebody typed in the search box would be
 * reporting the search rather than the workload, which is the opposite of what a
 * queue counter is for.
 */
export function ComplaintManager() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(ANY);
  const [employeeId, setEmployeeId] = useState<string>(ANY);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const [open, setOpen] = useState<ComplaintView | null>(null);

  const query = useMemo(
    () =>
      toQueryString({
        search: debouncedSearch || undefined,
        status: status === ANY ? undefined : status,
        employeeId: employeeId === ANY ? undefined : employeeId,
        from: from || undefined,
        to: to || undefined,
        sort,
        page,
        pageSize: 10,
      }),
    [debouncedSearch, status, employeeId, from, to, sort, page],
  );

  const load = useCallback(async () => {
    try {
      setData(await apiClient.get<Payload>(`/api/admin/complaints${query}`));
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't load complaints.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  // Back to the first page whenever the filters change, since the page being
  // viewed may no longer exist under the narrower set.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, employeeId, from, to, sort]);

  /**
   * Who to offer in the employee filter.
   *
   * Built from the complaints themselves rather than fetched from the staff
   * roster, and that is deliberate: filtering by somebody who has never
   * complained returns an empty table and reads as a broken filter, and the
   * roster endpoint is behind a different grant this screen has no reason to
   * need. The trade is that the list only covers the current page's authors,
   * which is why the search box — which does span everybody — is the wider tool.
   */
  const authors = useMemo(() => {
    const seen = new Map<string, string>();
    for (const complaint of data?.items ?? []) seen.set(complaint.employee.id, complaint.employee.name);

    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data?.items]);

  const counts = data?.counts;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Total" value={counts?.total} />
        <StatTile label="Pending" value={counts?.pending} />
        <StatTile label="Under review" value={counts?.underReview} />
        <StatTile label="Resolved" value={counts?.resolved} />
        <StatTile label="Rejected" value={counts?.rejected} />
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-3 lg:grid-cols-12">
            <div className="relative lg:col-span-4">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search subject, description or person"
                className="pl-9"
                aria-label="Search complaints"
              />
            </div>

            <div className="lg:col-span-2">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All statuses</SelectItem>
                  {COMPLAINT_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {complaintStatusLabel(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-2">
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger aria-label="Filter by employee">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Everyone</SelectItem>
                  {authors.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-2">
              <Select value={sort} onValueChange={(value) => setSort(value as "newest" | "oldest")}>
                <SelectTrigger aria-label="Sort order">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 lg:col-span-2">
              <Input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                aria-label="From date"
              />
              <Input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                aria-label="To date"
              />
            </div>
          </div>

          {loading ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Loading…</p>
          ) : (data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={MessageSquareWarning}
              title="No complaints match"
              description="Try a different search, or clear the filters to see everything."
              inset={false}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Complaint</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>Raised</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.items.map((complaint) => (
                      <TableRow key={complaint.id}>
                        <TableCell className="max-w-72">
                          <span className="block truncate font-medium">{complaint.subject}</span>
                          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                            {complaintReference(complaint.id)}
                            {complaint.attachments.length > 0 && (
                              <>
                                <Paperclip className="size-3" aria-hidden />
                                {complaint.attachments.length}
                              </>
                            )}
                            {/*
                              Claimed but never sent means the resolution letter
                              was attempted and failed. Surfaced in the row
                              rather than buried in the dialog: it is the one
                              thing on this screen somebody has to act on, and
                              nobody opens a resolved complaint to check.
                            */}
                            {complaint.resolutionNoticeClaimedAt && !complaint.resolutionNoticeSentAt && (
                              <span className="text-destructive-ink flex items-center gap-1">
                                <MailWarning className="size-3" aria-hidden />
                                email failed
                              </span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-48">
                          <span className="block truncate text-sm">{complaint.employee.name}</span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {complaint.employee.email}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap text-sm">
                          {formatDate(complaint.createdAt)}
                        </TableCell>
                        <TableCell>
                          <ComplaintStatusBadge status={complaint.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setOpen(complaint)}
                            aria-label={`Open ${complaint.subject}`}
                          >
                            <Eye className="size-4" />
                          </Button>
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
                  label="complaints"
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ComplaintDetailDialog
        complaint={open}
        onClose={() => setOpen(null)}
        onSaved={async () => {
          setOpen(null);
          await load();
        }}
      />
    </div>
  );
}

function StatTile({ label, value }: { label: string; value?: number }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value ?? "—"}</p>
      </CardContent>
    </Card>
  );
}

/**
 * One complaint, in full, with the controls that change it.
 *
 * The form opens on whatever the complaint currently holds, so saving without
 * touching anything is a no-op the server refuses rather than a silent rewrite
 * of the audit fields.
 */
function ComplaintDetailDialog({
  complaint,
  onClose,
  onSaved,
}: {
  complaint: ComplaintView | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [status, setStatus] = useState<ComplaintStatusView>("PENDING");
  const [resolution, setResolution] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!complaint) return;

    setStatus(complaint.status);
    setResolution(complaint.resolution ?? "");
    setNotes(complaint.internalNotes ?? "");
  }, [complaint]);

  if (!complaint) return null;

  const changed =
    status !== complaint.status ||
    resolution !== (complaint.resolution ?? "") ||
    notes !== (complaint.internalNotes ?? "");

  // Mirrors the server's rule so somebody is told before they press the button
  // rather than after. The service checks it again against what is stored.
  const needsWords = requiresResolution(status) && resolution.trim().length === 0;

  // Said out loud, because it is the one consequence of this dialog that
  // reaches outside the system and cannot be taken back.
  const willEmail =
    status === "RESOLVED" && complaint.status !== "RESOLVED" && !complaint.resolutionNoticeClaimedAt;

  async function save() {
    if (!complaint || !changed || needsWords || saving) return;

    setSaving(true);

    try {
      const { notification } = await apiClient.patch<{ notification: string | null }>(
        `/api/admin/complaints/${complaint.id}`,
        {
          ...(status !== complaint.status ? { status } : {}),
          ...(resolution !== (complaint.resolution ?? "") ? { resolution } : {}),
          ...(notes !== (complaint.internalNotes ?? "") ? { internalNotes: notes } : {}),
        },
      );

      // Reported rather than glossed. The complaint *is* saved in every one of
      // these cases — the difference is only what happened to the letter, and
      // an administrator who believes it went out will not chase it.
      if (notification === "sent") toast.success("Complaint updated. The employee has been emailed.");
      else if (notification === "failed") {
        toast.warning("Complaint updated, but the email could not be delivered. Tell them another way.");
      } else if (notification === "already-sent") {
        toast.success("Complaint updated. They were already emailed about this resolution.");
      } else toast.success("Complaint updated.");

      await onSaved();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't update that complaint.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6">{complaint.subject}</DialogTitle>
          <DialogDescription>
            {complaintReference(complaint.id)} · {complaint.employee.name} ({complaint.employee.email})
            · raised {formatDateTime(complaint.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 text-sm">
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium">What was reported</p>
            <p className="border-border/60 bg-muted/30 whitespace-pre-wrap rounded-lg border p-3">
              {complaint.description}
            </p>
          </div>

          {complaint.attachments.length > 0 && (
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-medium">Attached</p>
              <ul className="space-y-1">
                {complaint.attachments.map((file) => (
                  <li key={file.id}>
                    <AttachmentLink id={file.id} filename={file.filename} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {complaint.resolvedAt && (
            <p className="text-muted-foreground text-xs">
              Closed {formatDateTime(complaint.resolvedAt)}
              {complaint.resolvedBy ? ` by ${complaint.resolvedBy.name}` : ""}
              {complaint.resolutionNoticeSentAt
                ? " · employee emailed"
                : complaint.resolutionNoticeClaimedAt
                  ? " · email failed to send"
                  : ""}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="complaint-status">Status</Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as ComplaintStatusView)}
                disabled={saving}
              >
                <SelectTrigger id="complaint-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPLAINT_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {complaintStatusLabel(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              {willEmail && (
                <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Saving will email {complaint.employee.name} the resolution below.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="complaint-resolution">
              Resolution {requiresResolution(status) && <span aria-hidden>*</span>}
            </Label>
            <Textarea
              id="complaint-resolution"
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              rows={4}
              placeholder="What was decided, and what happens next. The employee sees this."
              disabled={saving}
            />
            <p className="text-muted-foreground text-xs">
              Shown to the employee and quoted in the resolution email.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="complaint-notes">Internal notes</Label>
            <Textarea
              id="complaint-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Working notes for other administrators."
              disabled={saving}
            />
            <p className="text-muted-foreground text-xs">
              <Badge variant="secondary" className="mr-1.5">
                Admin only
              </Badge>
              Never shown to the employee and never included in any email.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={save} loading={saving} disabled={!changed || needsWords}>
            {needsWords ? "Add a resolution first" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Fetches an attachment's bytes only when somebody actually asks for it.
 *
 * The list carries filenames and sizes and nothing else, so opening a complaint
 * with three photos on it costs nothing until one is clicked. The endpoint
 * re-derives the permission from the complaint, so this is a convenience rather
 * than the control.
 */
function AttachmentLink({ id, filename }: { id: string; filename: string }) {
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);

    try {
      const file = await apiClient.get<{ data: string; filename: string }>(
        `/api/complaints/attachments/${id}`,
      );

      const tab = window.open();
      if (tab) tab.location.href = file.data;
      else toast.error("Allow pop-ups to view attachments.");
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't open that file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className="hover:text-primary-ink flex items-center gap-2 text-sm transition-colors"
    >
      <Paperclip className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
      <span className="truncate underline-offset-2 hover:underline">{filename}</span>
    </button>
  );
}
