"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { AttendanceStatusBadge, DAY_STATUS_BADGE } from "@/components/shared/attendance-status-badge";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { EDITABLE_DAY_STATUSES, type EditableDayStatus } from "@/lib/attendance-edit";
import { formatDate } from "@/lib/date";
import { dayStatusLabel } from "@/lib/report-labels";
import type { AttendanceDayStatus } from "@/types";

/** How long a note may be. Mirrors `attendanceEditSchema`, which is the rule. */
const MAX_NOTE = 500;

type Step = "form" | "confirm";

/**
 * Changing what a finished day amounted to, from the record it appears in.
 *
 * The counterpart of `AttendanceStatusEditor` rather than a replacement for it,
 * and the two are deliberately shaped differently because they are pressed in
 * different circumstances. That one is a dropdown *on the badge itself*, on a
 * roster showing one date: the day is in the page header, the person is in the
 * row, and a correction made while looking at this afternoon needs no ceremony.
 * This one opens from a table of thirty-one dates where the row is the only
 * thing naming the day — so it restates who and when before it changes anything,
 * and it has somewhere to put a sentence about a register being put right three
 * weeks late.
 *
 * **Both post the same body to `/api/admin/attendance/edit`.** Neither decides
 * anything: `editHistoricalDay` re-derives what the day currently reads as, asks
 * the grant against the row, applies `assertMayCorrect` and refuses today's
 * date, whatever either of these drew.
 */
export function AttendanceEditDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  date,
  currentStatus,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  /** The day being corrected, ISO, at UTC midnight like every date here. */
  date: string;
  /** What the roster says it is now — the server's word, never inferred here. */
  currentStatus: EditableDayStatus;
  onSaved: () => void | Promise<void>;
}) {
  const [step, setStep] = useState<Step>("form");
  const [status, setStatus] = useState<EditableDayStatus>(currentStatus);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reopened on a different row is a different question, so nothing carries
  // across — a note typed about the 17th must not arrive attached to the 18th.
  useEffect(() => {
    if (!open) return;

    setStep("form");
    setStatus(currentStatus);
    setNote("");
    setError(null);
  }, [open, date, currentStatus]);

  const changed = status !== currentStatus;

  async function save() {
    // Guarded rather than merely disabled, so a second Enter landing between the
    // click and the re-render cannot post twice. The service would refuse the
    // duplicate anyway — it re-reads the day, finds it already moved and gets
    // `isNoOp`'s refusal — but a visible error for something somebody did not do
    // wrong is a worse answer than not sending it.
    if (saving || !changed) return;

    setSaving(true);
    setError(null);

    try {
      const result = await apiClient.post<{ status: AttendanceDayStatus }>(
        "/api/admin/attendance/edit",
        {
          employeeId,
          date,
          status,
          // Left off entirely when empty rather than sent as "". The schema folds
          // it to undefined too; doing it here as well keeps the wire honest
          // about whether anything was actually said.
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      );

      // The server's verdict, not the option that was chosen. They agree in every
      // ordinary case and diverge exactly when some other fact moved underneath
      // the request — a closure declared while the dialog was open — where the
      // truth is the more useful of the two.
      toast.success(
        `Attendance record updated — ${employeeName} now reads as ${dayStatusLabel(result.status).toLowerCase()} on ${formatDate(date)}.`,
      );

      onOpenChange(false);

      // Re-fetched rather than patched in place. The tiles, the rate, the
      // calendar, both charts and the row itself are all readings of one day walk
      // on the server, so the only way they cannot disagree with each other is to
      // come back from the walk that has just been re-run.
      await onSaved();
    } catch (caught) {
      // Nothing was written and the record still reads as it did. The message is
      // the service's own, which is the only way somebody learns *why* — a
      // withdrawn grant, a day that turned out to be a closure, an allowance that
      // will not stretch to the leave being recorded.
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Unable to update attendance record. Please try again.",
      );
      setStep("form");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      // Refuses to close mid-write, so a dismissed dialog can never leave a
      // request in flight with nothing left on screen to report its answer.
      onOpenChange={(next) => {
        if (!next && saving) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {step === "form" ? "Edit attendance" : "Change attendance status?"}
          </AlertDialogTitle>

          <AlertDialogDescription asChild>
            <div className="space-y-1">
              <p>
                <span className="text-foreground font-medium">{employeeName}</span> ·{" "}
                {formatDate(date)}
              </p>
              {step === "confirm" && (
                <p>
                  This updates their historical attendance record and every report and analytic
                  drawn from it. It is written to the attendance change log against your name.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {step === "form" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Current status</Label>
              <div>
                <AttendanceStatusBadge status={currentStatus} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="attendance-edit-status">New status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as EditableDayStatus)}>
                <SelectTrigger id="attendance-edit-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/*
                    The three a person can hold, from the one list that says so.
                    Office closures, weekly days off, remote days, days still to
                    come and days the system holds nothing about are absent here
                    for the reasons `EDITABLE_DAY_STATUSES` gives — they belong to
                    the calendar rather than to anybody — and the schema will not
                    accept one either.
                  */}
                  {EDITABLE_DAY_STATUSES.map((option) => {
                    const { Icon } = DAY_STATUS_BADGE[option];

                    return (
                      <SelectItem key={option} value={option}>
                        <Icon className="size-4" aria-hidden />
                        {dayStatusLabel(option)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="attendance-edit-note">
                Notes <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="attendance-edit-note"
                value={note}
                onChange={(event) => setNote(event.target.value.slice(0, MAX_NOTE))}
                rows={3}
                placeholder="Why the record is being corrected — for the change log."
              />
              <p className="text-muted-foreground text-xs">
                Kept on the attendance change log beside the change itself. Leave it blank if there
                is nothing to add.
              </p>
            </div>

            {/*
              Moving to ON_LEAVE books real leave and spends a day of the monthly
              allowance, which is the one transition here that costs the employee
              something. Said before it is confirmed rather than discovered
              afterwards — and the allowance is still the rule: the service
              refuses the change outright when the month will not stretch to it.
            */}
            {status === "ON_LEAVE" && currentStatus !== "ON_LEAVE" && (
              <p className="text-muted-foreground glass-inset rounded-xl p-3 text-xs">
                This books an approved leave day for {formatDate(date)}, drawn from their monthly
                allowance. If the allowance will not cover it the change is refused and the record
                is left exactly as it is.
              </p>
            )}

            {currentStatus === "ON_LEAVE" && status !== "ON_LEAVE" && (
              <p className="text-muted-foreground glass-inset rounded-xl p-3 text-xs">
                This cancels the approved leave standing on {formatDate(date)} and hands that day
                back to their allowance.
              </p>
            )}

            {error && (
              <p className="text-destructive-ink flex items-start gap-2 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={!changed} onClick={() => setStep("confirm")}>
                Save changes
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="glass-inset flex flex-wrap items-center gap-2 rounded-xl p-3">
              <AttendanceStatusBadge status={currentStatus} />
              <ArrowRight className="text-muted-foreground size-4" aria-hidden />
              <AttendanceStatusBadge status={status} />
            </div>

            {note.trim() && (
              <p className="text-muted-foreground text-sm">
                <span className="text-foreground font-medium">Note:</span> {note.trim()}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={saving} onClick={() => setStep("form")}>
                Cancel
              </Button>
              <Button disabled={saving} onClick={save}>
                {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {saving ? "Saving…" : "Confirm change"}
              </Button>
            </div>
          </div>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
