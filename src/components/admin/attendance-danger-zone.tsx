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

type Scope = "DATE" | "ALL_TIME";

type ResetPreview = {
  count: number;
  leaveCount: number | null;
  mayTriggerWarnings: boolean;
  cutoffMinutes: number;
};

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/**
 * Erasing check-ins, kept away from everything that merely reads them.
 *
 * Two acts behind one heading, and they are not equally dangerous. Clearing a
 * day is recoverable in practice — people can mark present again, and only that
 * date moves — so it asks once and says how many rows will go. Clearing every
 * check-in ever cannot be undone by anything in this application, so it asks for
 * the word to be typed out, and the server demands the same word rather than
 * trusting that this box exists.
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
        next === "ALL_TIME" ? { scope: next } : { scope: next, date },
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
        { scope, ...(scope === "ALL_TIME" ? { confirm: typed } : { date }) },
      );

      const parts = [plural(result.removed, "check-in")];
      if (scope === "ALL_TIME") parts.push(plural(result.removedLeaves, "leave"));

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

  const isAllTime = scope === "ALL_TIME";
  const blocked = isAllTime && typed !== RESET_CONFIRMATION;
  // Both tables together, because either one alone is something to remove.
  const total = preview ? preview.count + (preview.leaveCount ?? 0) : 0;

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

          <div className="border-destructive/30 space-y-3 border-t pt-5">
            <div>
              <p className="text-sm font-medium">Reset everything</p>
              <p className="text-muted-foreground text-sm">
                Every check-in <em>and</em> every booked leave, for every person, all the way back.
                Clearing leave returns everyone&apos;s monthly allowance in full. Nothing in this
                application can undo it.
              </p>
            </div>

            <Button variant="destructive" onClick={() => ask("ALL_TIME")} disabled={working}>
              <Trash2 className="size-4" />
              Reset everything
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={open} onOpenChange={(next) => !next && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isAllTime
                ? "Delete every check-in and leave ever recorded?"
                : `Clear check-ins for ${formatDate(date)}?`}
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
                        isAllTime ? (
                          "There are no check-ins or leaves to remove."
                        ) : (
                          "There are no check-ins to remove on that day."
                        )
                      ) : (
                        <>
                          This permanently deletes{" "}
                          <strong>{plural(preview.count, "check-in")}</strong>
                          {preview.leaveCount !== null && (
                            <>
                              {" and "}
                              <strong>{plural(preview.leaveCount, "booked leave")}</strong>
                            </>
                          )}
                          . It cannot be undone.
                        </>
                      )}
                    </span>

                    {isAllTime && total > 0 && (
                      <span className="text-muted-foreground block">
                        Everyone keeps their account. Clearing leave returns each person&apos;s
                        monthly allowance in full, and every employee will read as absent
                        afterwards — that is the roster with nothing recorded against it, not a
                        failed reset.
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

          {isAllTime && !loading && preview && total > 0 && (
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
              />
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
              {isAllTime ? "Delete everything" : "Clear the day"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
