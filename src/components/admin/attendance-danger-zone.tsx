"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { friendlyTimeLabel } from "@/lib/attendance-policy";
import { formatDate, toIsoDate, todayUtc } from "@/lib/date";
import { RESET_CONFIRMATION } from "@/validations/attendance.schema";

type Scope = "DATE" | "ATTENDANCE" | "LEAVES" | "ALL_TIME";

type ResetPreview = {
  count: number | null;
  leaveCount: number | null;
  mayTriggerWarnings: boolean;
  cutoffMinutes: number;
};

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/**
 * What each scope is called, and what it warns about.
 *
 * Kept as one table rather than as conditionals spread through the markup: the
 * four differ only in wording and in which counts they show, and a reader
 * deciding whether the right thing is about to be deleted should be able to see
 * all four sentences at once.
 */
const SCOPES: Record<Scope, { title: (date: string) => string; action: string }> = {
  DATE: { title: (date) => `Clear check-ins for ${date}?`, action: "Clear the day" },
  ATTENDANCE: {
    title: () => "Delete every check-in ever recorded?",
    action: "Delete all check-ins",
  },
  LEAVES: { title: () => "Delete every leave ever booked?", action: "Delete all leaves" },
  ALL_TIME: {
    title: () => "Delete every check-in and leave ever recorded?",
    action: "Delete everything",
  },
};

/**
 * Erasing the record, kept away from everything that merely reads it.
 *
 * Four acts behind one heading, and they are not equally dangerous. Clearing a
 * single day of check-ins is recoverable in practice — people can mark present
 * again, and only that date moves — so it asks once and says how many rows will
 * go. The three all-time scopes cannot be undone by anything in this
 * application, so each asks for the word to be typed out, and the server demands
 * the same word rather than trusting that this box exists.
 *
 * Check-ins and leaves are separable because the two tables answer different
 * questions: clearing a month of trial check-ins should not have to cost
 * everybody the leave they booked. `ALL_TIME` stays a scope of its own rather
 * than two requests fired in sequence, so a half-finished reset is not something
 * this component can produce.
 *
 * The panel also says, beside the buttons, that none of this empties the
 * attendance screen. Absence is the lack of a check-in rather than a row, so no
 * button here can remove it — and an empty roster is what people expect a reset
 * to produce, which turns a working one into a bug report.
 *
 * The super admin's alone. The Access screen has already turned everybody else
 * away, and the endpoint checks again.
 */
export function AttendanceDangerZone() {
  const [date, setDate] = useState(() => toIsoDate(todayUtc()));
  const [scope, setScope] = useState<Scope | null>(null);
  const [preview, setPreview] = useState<ResetPreview | null>(null);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);

  const open = scope !== null;

  const close = useCallback(() => {
    setScope(null);
    setPreview(null);
    setTyped("");
  }, []);

  // Counted when the dialog opens rather than kept on screen, so the number
  // being confirmed is the number in the table a moment ago — not one left over
  // from whenever the panel last rendered.
  async function ask(next: Scope) {
    setScope(next);
    setPreview(null);
    setTyped("");
    setLoading(true);

    try {
      const params = new URLSearchParams(
        next === "DATE" ? { scope: next, date } : { scope: next },
      );

      setPreview(await apiClient.get<ResetPreview>(`/api/admin/attendance/reset?${params}`));
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't check what that would remove.");
      close();
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!scope || working) return;
    setWorking(true);

    try {
      const result = await apiClient.post<{ removed: number; removedLeaves: number }>(
        "/api/admin/attendance/reset",
        { scope, ...(scope === "DATE" ? { date } : { confirm: typed }) },
      );

      // Names only the tables this scope touched. Reporting "and 0 leaves" on a
      // check-ins-only reset would read as a failure to delete them.
      const parts: string[] = [];
      if (scope !== "LEAVES") parts.push(plural(result.removed, "check-in"));
      if (scope === "LEAVES" || scope === "ALL_TIME") {
        parts.push(plural(result.removedLeaves, "leave"));
      }

      toast.success(
        result.removed + result.removedLeaves === 0
          ? "There was nothing to remove."
          : `Removed ${parts.join(" and ")}.`,
      );
      close();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't reset attendance.");
    } finally {
      setWorking(false);
    }
  }

  // Every scope but the single day is irreversible, so every one of them asks
  // for the word. Case-insensitive, matching the server: somebody who typed it
  // meant it whichever way the shift key fell.
  const needsWord = scope !== null && scope !== "DATE";
  const blocked = needsWord && typed.trim().toUpperCase() !== RESET_CONFIRMATION;
  // Across whichever tables this scope touches — either one alone is something
  // to remove, and a scope that touches neither cannot arise.
  const total = preview ? (preview.count ?? 0) + (preview.leaveCount ?? 0) : 0;

  return (
    <>
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive-ink flex items-center gap-2 text-base">
            <AlertTriangle className="size-4" aria-hidden />
            Danger zone
          </CardTitle>
          <CardDescription>
            Permanently deletes recorded activity. Absence is the lack of a check-in rather than a
            row of its own, so anyone cleared reads as absent — this does not blank the record, it
            rewrites what the day says, and no reset empties the roster. Warning letters already
            sent, and declared office closures, are kept.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="reset-date">Clear check-ins for one day</Label>
              <Input
                id="reset-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                disabled={working}
                className="w-44"
              />
            </div>

            <Button variant="outline" onClick={() => ask("DATE")} disabled={!date || working}>
              <Trash2 className="size-4" />
              Reset this day
            </Button>
          </div>

          <div className="border-destructive/30 space-y-4 border-t pt-5">
            <div>
              <p className="text-sm font-medium">Clear the whole history</p>
              <p className="text-muted-foreground text-sm">
                Every person, every day, all the way back — past days and today alike. Nothing in
                this application can undo any of these. Each asks for {RESET_CONFIRMATION} to be
                typed, and says how many rows it is about to take.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => ask("ATTENDANCE")} disabled={working}>
                <Trash2 className="size-4" />
                Reset all check-ins
              </Button>

              <Button variant="outline" onClick={() => ask("LEAVES")} disabled={working}>
                <Trash2 className="size-4" />
                Reset all leaves
              </Button>

              <Button variant="destructive" onClick={() => ask("ALL_TIME")} disabled={working}>
                <Trash2 className="size-4" />
                Reset everything
              </Button>
            </div>

            {/* The question this panel kept being asked. Absence is the lack of a
                check-in rather than a row, so no button here can remove it, and
                somebody expecting an empty roster reads a working reset as a
                broken one. Said next to the buttons, where the expectation forms. */}
            <p className="text-muted-foreground border-muted border-l-2 pl-3 text-sm">
              None of these empties the attendance screen. Absence is not stored — it is what the
              screen shows for a person with no check-in — so once everything is cleared, every
              employee reads as <strong>Absent</strong>. That is the roster with nothing recorded
              against it, and it is what a successful reset looks like.
            </p>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={open} onOpenChange={(next) => !next && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {scope ? SCOPES[scope].title(formatDate(date)) : ""}
            </AlertDialogTitle>

            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {loading || !preview ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Counting what this would remove…
                  </span>
                ) : (
                  <>
                    <span className="block">
                      {total === 0 ? (
                        scope === "DATE" ? (
                          "There are no check-ins to remove on that day."
                        ) : (
                          `There is nothing to remove — ${
                            scope === "LEAVES"
                              ? "no leave has been booked"
                              : scope === "ATTENDANCE"
                                ? "no check-in has been recorded"
                                : "no check-in or leave has been recorded"
                          }.`
                        )
                      ) : (
                        <>
                          This permanently deletes{" "}
                          {preview.count !== null && (
                            <strong>{plural(preview.count, "check-in")}</strong>
                          )}
                          {preview.count !== null && preview.leaveCount !== null && " and "}
                          {preview.leaveCount !== null && (
                            <strong>{plural(preview.leaveCount, "booked leave")}</strong>
                          )}
                          . It cannot be undone.
                        </>
                      )}
                    </span>

                    {needsWord && total > 0 && (
                      <span className="text-muted-foreground block">
                        Everyone keeps their account.{" "}
                        {preview.leaveCount !== null &&
                          "Clearing leave returns each person's monthly allowance in full. "}
                        Every employee will read as absent afterwards — that is the roster with
                        nothing recorded against it, not a failed reset.
                      </span>
                    )}

                    {preview.mayTriggerWarnings && total > 0 && (
                      <span className="text-destructive-ink block">
                        Today&apos;s {friendlyTimeLabel(preview.cutoffMinutes)} cutoff has passed, so
                        the next sweep will read everyone cleared as absent and email them a warning
                        letter. Switch off warning letters above first if that is not what you want.
                      </span>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {needsWord && !loading && preview && total > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="reset-confirm">
                Type {RESET_CONFIRMATION} to confirm
              </Label>
              <Input
                id="reset-confirm"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                disabled={working}
                aria-describedby="reset-confirm-hint"
              />
              {/* Says why the button is refusing. Without it, a word that does
                  not match leaves a disabled button and no explanation, which
                  reads as a reset that ran and did nothing. */}
              <p id="reset-confirm-hint" className="text-muted-foreground text-sm">
                {blocked
                  ? `Enter ${RESET_CONFIRMATION} to enable the button. Capitals do not matter.`
                  : `Confirmed — the button will now remove ${[
                      preview.count !== null && plural(preview.count, "check-in"),
                      preview.leaveCount !== null && plural(preview.leaveCount, "booked leave"),
                    ]
                      .filter(Boolean)
                      .join(" and ")}.`}
              </p>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={confirm}
              loading={working}
              disabled={loading || !preview || total === 0 || blocked}
            >
              {scope ? SCOPES[scope].action : ""}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
