"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarOff, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { MAX_HOLIDAY_REASON_LENGTH } from "@/lib/constants";
import { formatDate, formatDateTime, toIsoDate, todayUtc, utcWeekday } from "@/lib/date";
import type { HolidayView } from "@/types";

/**
 * How each announcement state reads, and how loudly.
 *
 * Worded for the column they sit under — "Announcement" — rather than for the
 * mechanism: what an administrator wants to know is whether the office has been
 * told, not that an SMTP call returned. A closure declared for today reaches
 * `SENT` in the same request, so it reads "Announced" the moment it appears.
 */
const NOTICE: Record<HolidayView["notice"], { label: string; tone: "brand" | "muted" | "warning" }> = {
  SCHEDULED: { label: "Scheduled", tone: "muted" },
  SENT: { label: "Announced", tone: "brand" },
  SKIPPED: { label: "Not announced", tone: "muted" },
  FAILED: { label: "Delivery failed", tone: "warning" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};

type FormState = { date: string; reason: string };

const EMPTY_FORM: FormState = { date: "", reason: "" };

/**
 * The office days-off screen.
 *
 * Read-only for an administrator who has not been granted the right — they can
 * still see what is coming, since knowing the office is shut is everybody's
 * business, but the form and the row actions are not offered. `canManage`
 * comes from the API, which mirrors the check the service actually enforces.
 */
export function HolidayManager() {
  const [holidays, setHolidays] = useState<HolidayView[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<HolidayView | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<HolidayView | null>(null);

  // The date input refuses anything earlier, matching the rule the server
  // enforces. The server is what actually decides — this only saves a round trip.
  const earliest = toIsoDate(todayUtc());

  const load = useCallback(async () => {
    try {
      const result = await apiClient.get<{ holidays: HolidayView[]; canManage: boolean }>(
        "/api/admin/holidays",
      );

      setHolidays(result.holidays);
      setCanManage(result.canManage);
      setFailed(false);
    } catch (error) {
      setFailed(true);
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't load the office days off.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!form.date || !form.reason.trim() || creating) return;

    setCreating(true);

    try {
      const holiday = await apiClient.post<HolidayView>("/api/admin/holidays", {
        date: form.date,
        reason: form.reason.trim(),
      });

      // Says which way it went, because "scheduled for Thursday" and "everyone
      // has just been emailed" are very different things to have done. A closure
      // declared for today comes back already announced.
      if (holiday.notice === "FAILED") {
        // Reported rather than thrown, matching the service: the office is
        // closed on that date either way, and the announcement is the part that
        // needs a person to notice.
        toast.warning("Office day off added, but the announcement could not be emailed.");
      } else {
        toast.success(
          holiday.notice === "SENT"
            ? "Office day off added — everyone has been emailed."
            : holiday.notice === "SCHEDULED"
              ? `Office day off added — everyone is emailed on ${formatDate(holiday.noticeDueAt ?? holiday.date)}.`
              : "Office day off added.",
        );
      }

      setForm(EMPTY_FORM);
      await load();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't add that day off.");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(holiday: HolidayView) {
    setEditing(holiday);
    setEditForm({ date: holiday.date.slice(0, 10), reason: holiday.reason });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || saving) return;

    setSaving(true);

    try {
      await apiClient.patch(`/api/admin/holidays/${editing.id}`, {
        date: editForm.date,
        reason: editForm.reason.trim(),
      });

      toast.success("Office day off updated.");
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't update that day off.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(holiday: HolidayView) {
    try {
      await apiClient.delete(`/api/admin/holidays/${holiday.id}`);
      toast.success("Office day off removed. That date is a working day again.");
      await load();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't remove that day off.");
    }
  }

  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-12 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Loading office days off…
      </div>
    );
  }

  if (failed) {
    return (
      <EmptyState
        icon={CalendarOff}
        title="Couldn't load office days off"
        description="Something went wrong reaching the server."
        action={<Button onClick={() => void load()}>Try again</Button>}
      />
    );
  }

  const today = todayUtc().getTime();

  return (
    <div className="grid gap-4">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarOff className="text-primary-ink size-4" aria-hidden />
              Close the office
            </CardTitle>
            <CardDescription>
              Everyone active is emailed at noon the day before. Add one after that point — or for today —
              and the email goes out straight away.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={create} className="grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="holiday-date">Date</Label>
                <Input
                  id="holiday-date"
                  type="date"
                  min={earliest}
                  value={form.date}
                  onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                  disabled={creating}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="holiday-reason">Reason</Label>
                <Input
                  id="holiday-reason"
                  value={form.reason}
                  onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                  placeholder="e.g. Independence Day"
                  maxLength={MAX_HOLIDAY_REASON_LENGTH}
                  disabled={creating}
                  required
                />
              </div>

              <Button type="submit" disabled={!form.date || !form.reason.trim()} loading={creating}>
                {!creating && <Plus className="size-4" />}
                Create day off
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduled closures</CardTitle>
          <CardDescription>
            {canManage
              ? "Past closures stay on the record and can no longer be changed."
              : "Only a super administrator, or an administrator they have allowed, can change these."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {holidays.length === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title="The office has no days off scheduled"
              description={
                canManage
                  ? "Add one above and everybody is told the day before."
                  : "Days the office is closed will appear here."
              }
              inset={false}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Day</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Announcement</TableHead>
                    <TableHead>Created by</TableHead>
                    {canManage && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holidays.map((holiday) => {
                    const date = new Date(holiday.date);
                    const past = date.getTime() <= today;
                    const notice = NOTICE[holiday.notice];

                    return (
                      <TableRow key={holiday.id} className={past ? "opacity-60" : undefined}>
                        <TableCell className="font-medium">{formatDate(date)}</TableCell>
                        <TableCell className="text-muted-foreground">{utcWeekday(date)}</TableCell>
                        <TableCell>{holiday.reason}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <Badge
                              variant={
                                notice.tone === "brand"
                                  ? "default"
                                  : notice.tone === "warning"
                                    ? "destructive"
                                    : "secondary"
                              }
                            >
                              {notice.label}
                            </Badge>
                            <span className="text-muted-foreground text-xs">
                              {holiday.noticeSentAt
                                ? formatDateTime(holiday.noticeSentAt)
                                : holiday.noticeDueAt
                                  ? `due ${formatDateTime(holiday.noticeDueAt)}`
                                  : "—"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <div className="flex flex-col gap-0.5">
                            <span>{holiday.declaredBy.name}</span>
                            <span className="text-xs">{formatDateTime(holiday.createdAt)}</span>
                          </div>
                        </TableCell>

                        {canManage && (
                          <TableCell className="text-right">
                            {past ? (
                              <span className="text-muted-foreground text-xs">On the record</span>
                            ) : (
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => openEdit(holiday)}
                                  aria-label={`Edit ${holiday.reason}`}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => setRemoving(holiday)}
                                  aria-label={`Delete ${holiday.reason}`}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit office day off</DialogTitle>
            <DialogDescription>
              Moving the date moves the announcement with it. One that has already gone out is not sent
              again.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={save} className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-holiday-date">Date</Label>
              <Input
                id="edit-holiday-date"
                type="date"
                min={earliest}
                value={editForm.date}
                onChange={(event) => setEditForm((current) => ({ ...current, date: event.target.value }))}
                disabled={saving}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-holiday-reason">Reason</Label>
              <Input
                id="edit-holiday-reason"
                value={editForm.reason}
                onChange={(event) => setEditForm((current) => ({ ...current, reason: event.target.value }))}
                maxLength={MAX_HOLIDAY_REASON_LENGTH}
                disabled={saving}
                required
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" loading={saving} disabled={!editForm.date || !editForm.reason.trim()}>
                Save changes
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this office day off?"
        description={
          removing
            ? `${formatDate(removing.date)} becomes an ordinary working day again, and anyone with leave booked across it will have that day counted as leave once more.${removing.notice === "SENT" ? " Everyone has already been emailed about this closure." : " The announcement will not be sent."}`
            : ""
        }
        confirmLabel="Remove day off"
        destructive
        onConfirm={async () => {
          if (removing) await remove(removing);
          setRemoving(null);
        }}
      />
    </div>
  );
}
