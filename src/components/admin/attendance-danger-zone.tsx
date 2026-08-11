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

type Range = "DATE" | "ALL_TIME";
type Target = "ATTENDANCE" | "LEAVES" | "ABSENCES" | "ALL";
type Ask = { range: Range; target: Target };

type ResetPreview = {
  count: number | null;
  leaveCount: number | null;
  warningCount: number | null;
  warningsForToday: number | null;
  mayTriggerWarnings: boolean;
  cutoffMinutes: number;
};

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/**
 * What each target is called, in the two ranges it can be asked for.
 *
 * One table rather than conditionals spread through the markup, and a grid
 * rather than eight entries: the same four acts are offered for one date and
 * for all time, and writing them out twice is how the pairs come to disagree
 * about what they delete. The button label is what somebody scans; `noun` is
 * what the dialog says when there was nothing there.
 */
const TARGETS: Record<Target, { label: string; action: string; subject: string; nothing: string }> = {
  ATTENDANCE: {
    label: "Check-ins",
    action: "check-ins",
    subject: "every check-in",
    nothing: "no check-in has been recorded",
  },
  LEAVES: {
    label: "Leave",
    action: "leave",
    subject: "every leave booked",
    nothing: "no leave has been booked",
  },
  ABSENCES: {
    label: "Absence records",
    action: "absence records",
    subject: "the record of every absence",
    nothing: "no absence has been recorded against anybody",
  },
  ALL: {
    label: "Everything",
    action: "everything",
    subject: "every check-in, leave and absence record",
    nothing: "nothing has been recorded",
  },
};

const ORDER: Target[] = ["ATTENDANCE", "LEAVES", "ABSENCES", "ALL"];

function titleFor(what: Ask, date: string): string {
  const { subject } = TARGETS[what.target];

  return what.range === "DATE"
    ? `Clear ${subject} for ${date}?`
    : `Delete ${subject} ever recorded?`;
}

/**
 * Erasing the record, kept away from everything that merely reads it.
 *
 * A grid of two rows: the same four targets offered for one chosen date and for
 * all time. They are not equally dangerous, and the row is what says so. A
 * single date is a correction — a test run, a device that double counted, a
 * closure declared too late — and it asks once, naming the rows. All time can be
 * undone by nothing in this application, so it asks for the word to be typed
 * out, and the server demands the same word rather than trusting that this box
 * exists.
 *
 * The targets are apart because the tables answer different questions: clearing
 * a month of trial check-ins should not have to cost everybody the leave they
 * booked. `ALL` stays a target of its own rather than three requests fired in
 * sequence, so a half-finished reset is not something this component can
 * produce.
 *
 * The panel also says, beside the buttons, which button does what people expect
 * "clear the absences" to do — the answer is a pair, and neither half of it is
 * the obvious-sounding one on its own.
 *
 * The super admin's alone. The Access screen has already turned everybody else
 * away, and the endpoint checks again.
 */
export function AttendanceDangerZone() {
  const [date, setDate] = useState(() => toIsoDate(todayUtc()));
  const [pending, setPending] = useState<Ask | null>(null);
  const [preview, setPreview] = useState<ResetPreview | null>(null);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);

  const open = pending !== null;

  const close = useCallback(() => {
    setPending(null);
    setPreview(null);
    setTyped("");
  }, []);

  // Counted when the dialog opens rather than kept on screen, so the number
  // being confirmed is the number in the table a moment ago — not one left over
  // from whenever the panel last rendered.
  async function ask(next: Ask) {
    setPending(next);
    setPreview(null);
    setTyped("");
    setLoading(true);

    try {
      const params = new URLSearchParams(
        next.range === "DATE"
          ? { range: next.range, target: next.target, date }
          : { range: next.range, target: next.target },
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
    if (!pending || working) return;
    setWorking(true);

    try {
      const result = await apiClient.post<{
        removed: number;
        removedLeaves: number;
        removedWarnings: number;
      }>("/api/admin/attendance/reset", {
        range: pending.range,
        target: pending.target,
        ...(pending.range === "DATE" ? { date } : { confirm: typed }),
      });

      // Names only the tables this target touched. Reporting "and 0 leaves" on a
      // check-ins-only reset would read as a failure to delete them.
      const parts: string[] = [];
      if (pending.target === "ATTENDANCE" || pending.target === "ALL") {
        parts.push(plural(result.removed, "check-in"));
      }
      if (pending.target === "LEAVES" || pending.target === "ALL") {
        parts.push(plural(result.removedLeaves, "leave"));
      }
      if (pending.target === "ABSENCES" || pending.target === "ALL") {
        parts.push(plural(result.removedWarnings, "absence record"));
      }

      toast.success(
        result.removed + result.removedLeaves + result.removedWarnings === 0
          ? "There was nothing to remove."
          : `Removed ${parts.join(", ")}.`,
      );
      close();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't reset attendance.");
    } finally {
      setWorking(false);
    }
  }

  // The word marks all time and nothing else. Case-insensitive, matching the
  // server: somebody who typed it meant it whichever way the shift key fell.
  const needsWord = pending?.range === "ALL_TIME";
  const blocked = needsWord && typed.trim().toUpperCase() !== RESET_CONFIRMATION;
  // Across whichever tables this target touches — any one alone is something to
  // remove, and a target that touches none cannot arise.
  const total = preview
    ? (preview.count ?? 0) + (preview.leaveCount ?? 0) + (preview.warningCount ?? 0)
    : 0;

  return (
    <>
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive-ink flex items-center gap-2 text-base">
            <AlertTriangle className="size-4" aria-hidden />
            Danger zone
          </CardTitle>
          <CardDescription>
            Permanently deletes recorded activity. A day left holding no check-in and no leave for
            anybody reads <strong>No record</strong> rather than marking the whole company absent,
            and nobody is chased for it. The roster itself is never emptied — it is built from the
            staff list, so everyone still appears. Warning letters already sent, and declared office
            closures, are kept.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-6">
          {/* The two groups offer the same four labels, so each is headed by the
              range it applies to. Without that the rows are indistinguishable
              at a glance, and the difference between them is a year of history. */}
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium">Clear one day</p>
              <p className="text-muted-foreground text-sm">
                One date, for everybody. A correction rather than a reckoning, so it asks once and
                names the rows — but a booking cleared here is gone for the person who made it, and
                only a check-in can be earned back by turning up tomorrow.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="reset-date">Date</Label>
                <Input
                  id="reset-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  disabled={working}
                  className="w-44"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                {ORDER.map((target) => (
                  <Button
                    key={target}
                    variant={target === "ALL" ? "destructive" : "outline"}
                    onClick={() => ask({ range: "DATE", target })}
                    disabled={!date || working}
                  >
                    <Trash2 className="size-4" />
                    {TARGETS[target].label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="border-destructive/30 space-y-4 border-t pt-5">
            <div>
              <p className="text-sm font-medium">Clear the whole history</p>
              <p className="text-muted-foreground text-sm">
                The same four, every person and every day all the way back — past days and today
                alike. Nothing in this application can undo any of these. Each asks for{" "}
                {RESET_CONFIRMATION} to be typed, and says how many rows it is about to take.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {ORDER.map((target) => (
                <Button
                  key={target}
                  variant={target === "ALL" ? "destructive" : "outline"}
                  onClick={() => ask({ range: "ALL_TIME", target })}
                  disabled={working}
                >
                  <Trash2 className="size-4" />
                  {TARGETS[target].label}
                </Button>
              ))}
            </div>
          </div>

          {/* The question this panel kept being asked: which button makes the
              absences go away. Answered by naming the two, because they are not
              the same thing and the obvious-sounding one is the narrower. Sits
              below both rows now, since it is true of either. */}
          <p className="text-muted-foreground border-muted border-l-2 pl-3 text-sm">
            <strong>Absence records</strong> clears the absence <em>record</em> — the warning letters
            issued and the consecutive-days streak they carry, which is the only place absence is
            ever written down. It does not clear the roster, because absence is not stored there: it
            is what the screen shows for a person with no check-in on a day something was recorded.
            To clear the days themselves use <strong>Everything</strong>, which leaves them holding
            nothing — those read <strong>No record</strong>, not Absent. The roster still lists
            everybody either way; it is built from the staff list, and no button here empties it.
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={open} onOpenChange={(next) => !next && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending ? titleFor(pending, formatDate(date)) : ""}
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
                        pending?.range === "DATE" ? (
                          `There is nothing to remove on that day — ${TARGETS[pending.target].nothing} for ${formatDate(date)}.`
                        ) : (
                          `There is nothing to remove — ${pending ? TARGETS[pending.target].nothing : "nothing has been recorded"}.`
                        )
                      ) : (
                        <>
                          This permanently deletes{" "}
                          {[
                            preview.count !== null && plural(preview.count, "check-in"),
                            preview.leaveCount !== null &&
                              plural(preview.leaveCount, "booked leave"),
                            preview.warningCount !== null &&
                              plural(preview.warningCount, "absence record"),
                          ]
                            .filter((part): part is string => typeof part === "string")
                            .map((part, index, all) => (
                              <span key={part}>
                                <strong>{part}</strong>
                                {index < all.length - 2 ? ", " : index === all.length - 2 ? " and " : ""}
                              </span>
                            ))}
                          . It cannot be undone.
                        </>
                      )}
                    </span>

                    {/* Shown for a single day as well as for all time. The
                        consequences do not scale down with the range — a cleared
                        booking is just as gone for the person who made it — and
                        this is the only screen that will ever mention them. */}
                    {total > 0 && (
                      <span className="text-muted-foreground block">
                        Everyone keeps their account.{" "}
                        {preview.leaveCount !== null &&
                          "Clearing leave hands back the allowance for those days, and takes the booking with it — nobody can restore one, and the person who made it will have to book it again. "}
                        {preview.warningCount !== null &&
                          "Letters already delivered cannot be unsent — what goes is the record of having sent them, and the consecutive-days streak future letters count from. "}
                        The roster still lists everybody afterwards. A day left holding no check-in
                        and no leave for anybody reads <strong>No record</strong>; a day where
                        something is still recorded goes on marking the rest absent.
                      </span>
                    )}

                    {/* The one real hazard in clearing absences, and it applies
                        only to today's claims: a past claim is inert, because
                        the sweep never looks back at it. */}
                    {preview.warningsForToday !== null &&
                      preview.warningsForToday > 0 &&
                      preview.mayTriggerWarnings && (
                        <span className="text-destructive-ink block">
                          {plural(preview.warningsForToday, "of these")} {" "}
                          {preview.warningsForToday === 1 ? "is" : "are"} today&apos;s. Removing a
                          claim for today lets the next sweep write to somebody it has already
                          written to, so they would receive a second letter for the same day. Past
                          days carry no such risk — the sweep never revisits them.
                        </span>
                      )}

                    {/* Only ever shown when today would still hold something
                        afterwards. A scope that empties the day leaves nobody
                        reading as absent, so there is no letter to warn about —
                        the server works that out rather than this dialog. */}
                    {preview.mayTriggerWarnings && total > 0 && (
                      <span className="text-destructive-ink block">
                        Today&apos;s {friendlyTimeLabel(preview.cutoffMinutes)} cutoff has passed and
                        today would still hold a record afterwards, so the next sweep will read
                        everyone cleared as absent and email them a warning letter. Clearing
                        everything for today instead leaves nothing to chase. Otherwise switch off
                        warning letters above first.
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
                      preview.warningCount !== null &&
                        plural(preview.warningCount, "absence record"),
                    ]
                      .filter(Boolean)
                      .join(", ")}.`}
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
              {pending
                ? `${pending.range === "DATE" ? "Clear" : "Delete all"} ${TARGETS[pending.target].action}`
                : ""}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
