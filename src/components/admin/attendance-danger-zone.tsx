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
  mayTriggerWarnings: boolean;
  cutoffMinutes: number;
};

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
      const result = await apiClient.post<{ removed: number }>("/api/admin/attendance/reset", {
        scope,
        ...(scope === "ALL_TIME" ? { confirm: typed } : { date }),
      });

      toast.success(
        result.removed === 0
          ? "There was nothing to remove."
          : `Removed ${result.removed} check-in${result.removed === 1 ? "" : "s"}.`,
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

  return (
    <>
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive-ink flex items-center gap-2 text-base">
            <AlertTriangle className="size-4" aria-hidden />
            Danger zone
          </CardTitle>
          <CardDescription>
            Permanently deletes recorded check-ins. Absence is the lack of a check-in, so anyone
            cleared reads as absent for that day — this does not blank the record, it rewrites what
            the day says. Warning letters already sent are kept.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="reset-date">Clear one day</Label>
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
              <p className="text-sm font-medium">Clear every check-in ever recorded</p>
              <p className="text-muted-foreground text-sm">
                Every person, every day, all the way back. Nothing in this application can undo it.
              </p>
            </div>

            <Button variant="destructive" onClick={() => ask("ALL_TIME")} disabled={working}>
              <Trash2 className="size-4" />
              Reset all attendance
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={open} onOpenChange={(next) => !next && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isAllTime ? "Delete every check-in ever recorded?" : `Clear ${formatDate(date)}?`}
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
                      {preview.count === 0
                        ? "There are no check-ins to remove."
                        : `This permanently deletes ${preview.count} check-in${preview.count === 1 ? "" : "s"}. It cannot be undone.`}
                    </span>

                    {preview.mayTriggerWarnings && preview.count > 0 && (
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

          {isAllTime && !loading && preview && preview.count > 0 && (
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
              disabled={loading || !preview || preview.count === 0 || blocked}
            >
              {isAllTime ? "Delete everything" : "Clear the day"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
