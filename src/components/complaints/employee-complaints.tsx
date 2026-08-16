"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquareWarning, Paperclip, Plus, Send } from "lucide-react";
import { toast } from "sonner";

import { ComplaintAttachmentsField, type PickedAttachment } from "@/components/complaints/complaint-attachments-field";
import { ComplaintStatusBadge } from "@/components/complaints/complaint-status-badge";
import { EmptyState } from "@/components/shared/empty-state";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { complaintReference } from "@/lib/complaint-reference";
import { MAX_COMPLAINT_SUBJECT_LENGTH } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/date";
import type { MyComplaintView, Pagination } from "@/types";

/**
 * The employee's own complaints: raise one, and see what came of it.
 *
 * Everything here is scoped by the server to the session — `/api/complaints`
 * has no parameter that could widen it — so this component never sends an
 * employee id and there is nothing for it to get wrong.
 *
 * What it deliberately cannot show is the administrator's internal notes: they
 * are not in `MyComplaintView` because they are not in
 * `employeeComplaintSelect`, so the field does not exist to render rather than
 * being hidden by a condition somebody could later remove.
 */
export function EmployeeComplaints() {
  const [items, setItems] = useState<MyComplaintView[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<PickedAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [open, setOpen] = useState<MyComplaintView | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await apiClient.get<{ items: MyComplaintView[]; pagination: Pagination }>(
        `/api/complaints?page=${page}&pageSize=10`,
      );

      setItems(result.items);
      setPagination(result.pagination);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't load your complaints.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  const ready = subject.trim().length >= 5 && description.trim().length >= 20;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || submitting) return;

    setSubmitting(true);

    try {
      await apiClient.post("/api/complaints", {
        subject: subject.trim(),
        description: description.trim(),
        attachments,
      });

      toast.success("Your complaint has been submitted.");
      setComposing(false);
      setSubject("");
      setDescription("");
      setAttachments([]);

      if (page === 1) await load();
      else setPage(1);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't submit that complaint.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setComposing(true)}>
          <Plus className="size-4" />
          New complaint
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Loading…</p>
          ) : items.length === 0 ? (
            <EmptyState
              icon={MessageSquareWarning}
              title="No complaints yet"
              description="If something at work needs attention, raise it here and an administrator will look into it."
              inset={false}
              action={
                <Button type="button" onClick={() => setComposing(true)}>
                  <Plus className="size-4" />
                  New complaint
                </Button>
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Complaint</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Resolution</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((complaint) => (
                      <TableRow key={complaint.id}>
                        <TableCell className="max-w-72">
                          <button
                            type="button"
                            onClick={() => setOpen(complaint)}
                            className="hover:text-primary-ink text-left font-medium transition-colors"
                          >
                            <span className="block truncate">{complaint.subject}</span>
                            <span className="text-muted-foreground block text-xs font-normal">
                              {complaintReference(complaint.id)}
                              {complaint.attachments.length > 0 &&
                                ` · ${complaint.attachments.length} attached`}
                            </span>
                          </button>
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap text-sm">
                          {formatDate(complaint.createdAt)}
                        </TableCell>
                        <TableCell>
                          <ComplaintStatusBadge status={complaint.status} />
                        </TableCell>
                        <TableCell>
                          {/*
                            An em dash rather than an empty cell while nothing
                            has been decided — a blank reads as a rendering
                            fault, and "nothing yet" is the actual answer.
                          */}
                          {complaint.resolution ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setOpen(complaint)}
                            >
                              View resolution
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <PaginationControls pagination={pagination} onPageChange={setPage} label="complaints" />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={composing} onOpenChange={(next) => !submitting && setComposing(next)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Raise a complaint</DialogTitle>
            <DialogDescription>
              This goes to the administrators who handle complaints. You will be emailed when it is
              resolved.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="complaint-subject">Subject</Label>
              <Input
                id="complaint-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                maxLength={MAX_COMPLAINT_SUBJECT_LENGTH}
                placeholder="e.g. Air conditioning in the west wing"
                disabled={submitting}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="complaint-description">What happened?</Label>
              <Textarea
                id="complaint-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={6}
                placeholder="Describe the problem, when it happened, and anyone involved."
                disabled={submitting}
                required
              />
              <p className="text-muted-foreground text-xs">
                {description.trim().length < 20
                  ? `At least 20 characters — ${Math.max(0, 20 - description.trim().length)} to go.`
                  : "Include anything that would help somebody look into this."}
              </p>
            </div>

            <ComplaintAttachmentsField
              files={attachments}
              onChange={setAttachments}
              disabled={submitting}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setComposing(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" loading={submitting} disabled={!ready}>
                {!submitting && <Send className="size-4" />}
                Submit complaint
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(open)} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="sm:max-w-lg">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6">{open.subject}</DialogTitle>
                <DialogDescription>
                  {complaintReference(open.id)} · raised {formatDateTime(open.createdAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <ComplaintStatusBadge status={open.status} />
                  {open.status === "PENDING" && (
                    <span className="text-muted-foreground text-xs">Waiting to be picked up.</span>
                  )}
                  {open.status === "UNDER_REVIEW" && (
                    <span className="text-muted-foreground text-xs">Somebody is looking into this.</span>
                  )}
                </div>

                <div>
                  <p className="text-muted-foreground mb-1 text-xs font-medium">What you reported</p>
                  <p className="whitespace-pre-wrap">{open.description}</p>
                </div>

                {open.attachments.length > 0 && (
                  <div>
                    <p className="text-muted-foreground mb-1 text-xs font-medium">Attached</p>
                    <ul className="space-y-1">
                      {open.attachments.map((file) => (
                        <li key={file.id} className="flex items-center gap-2">
                          <Paperclip className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{file.filename}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {open.resolution && (
                  <div className="border-border/60 bg-muted/30 rounded-lg border p-3">
                    <p className="text-muted-foreground mb-1 text-xs font-medium">
                      {open.status === "REJECTED" ? "Why this was closed" : "How this was resolved"}
                    </p>
                    <p className="whitespace-pre-wrap">{open.resolution}</p>
                    {open.resolvedAt && (
                      <p className="text-muted-foreground mt-2 text-xs">
                        {formatDateTime(open.resolvedAt)}
                        {open.resolvedBy ? ` · ${open.resolvedBy.name}` : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
