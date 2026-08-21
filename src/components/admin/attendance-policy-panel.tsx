"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Loader2, MailWarning } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiClientError, apiClient } from "@/lib/api-client";
import {
  cutoffOutrunsSweep,
  describeHrMarkWindow,
  describeOfficeHours,
  friendlyTimeLabel,
  isHrMarkWindow,
  MINUTES_IN_DAY,
  minutesToTimeLabel,
  timeLabelToMinutes,
  WARNING_SWEEP_MINUTES,
} from "@/lib/attendance-policy";
import {
  MAX_HR_MARK_WINDOW_MINUTES,
  MIN_HR_MARK_WINDOW_MINUTES,
  ROUTES,
} from "@/lib/constants";
import { formatDateTime } from "@/lib/date";
import { describeWeekdays, weeklyOffDays } from "@/lib/working-days";
import type { AttendancePolicyView } from "@/types";

/**
 * When the working day ends, and whether anybody is written to about missing it.
 *
 * The working *week* is deliberately not editable here any more. It decides what
 * a leave request costs as much as it decides who is chased, so it outgrew a
 * panel about warning letters and lives on the Working days screen — two
 * editors for one value is how the two come to disagree. It is still shown,
 * because the cutoff means nothing without knowing which days it applies to.
 *
 * Read by any administrator, changed by the super admin alone.
 */
export function AttendancePolicyPanel() {
  const [policy, setPolicy] = useState<AttendancePolicyView | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [cutoff, setCutoff] = useState("17:00");
  const [opening, setOpening] = useState("09:00");
  const [closing, setClosing] = useState("17:00");
  // Held as a string so the box can be empty mid-edit rather than snapping to 0,
  // which would read as "no window" every time somebody cleared it to retype.
  const [hrWindow, setHrWindow] = useState("20");
  const [enabled, setEnabled] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await apiClient.get<{ policy: AttendancePolicyView; canManage: boolean }>(
        "/api/admin/attendance/policy",
      );

      setPolicy(result.policy);
      setCanManage(result.canManage);
      setCutoff(minutesToTimeLabel(result.policy.cutoffMinutes));
      setOpening(minutesToTimeLabel(result.policy.openingMinutes));
      setClosing(minutesToTimeLabel(result.policy.closingMinutes));
      setHrWindow(String(result.policy.hrMarkWindowMinutes));
      setEnabled(result.policy.warningsEnabled);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't load the attendance policy.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    if (timeLabelToMinutes(cutoff) === null) {
      toast.error("Enter a cutoff time between 00:00 and 23:59.");
      return;
    }

    const openingMinutes = timeLabelToMinutes(opening);
    const closingMinutes = timeLabelToMinutes(closing);

    if (openingMinutes === null || closingMinutes === null) {
      toast.error("Enter office hours between 00:00 and 23:59.");
      return;
    }

    // Caught here so the sentence the panel is about to show never reads
    // backwards. The server checks it again on the bytes that arrive.
    if (openingMinutes >= closingMinutes) {
      toast.error("The office must close after it opens.");
      return;
    }

    const windowMinutes = Number(hrWindow);

    if (!isHrMarkWindow(windowMinutes)) {
      toast.error(
        `Enter a mark-present window between ${MIN_HR_MARK_WINDOW_MINUTES} and ${MAX_HR_MARK_WINDOW_MINUTES} minutes.`,
      );
      return;
    }

    setSaving(true);

    try {
      const updated = await apiClient.patch<AttendancePolicyView>("/api/admin/attendance/policy", {
        cutoff,
        // Always sent as a pair: the endpoint judges them together, and the
        // panel has both in hand whether or not either was touched.
        opening,
        closing,
        hrMarkWindowMinutes: windowMinutes,
        warningsEnabled: enabled,
      });

      setPolicy(updated);
      toast.success(
        updated.warningsEnabled
          ? `Saved. Anyone without attendance by ${friendlyTimeLabel(updated.cutoffMinutes)} is emailed a warning after the daily sweep.`
          : "Saved. Warning letters are switched off.",
      );
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't save the attendance policy.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading attendance policy…
        </CardContent>
      </Card>
    );
  }

  if (!policy) return null;

  const dirty =
    cutoff !== minutesToTimeLabel(policy.cutoffMinutes) ||
    opening !== minutesToTimeLabel(policy.openingMinutes) ||
    closing !== minutesToTimeLabel(policy.closingMinutes) ||
    hrWindow !== String(policy.hrMarkWindowMinutes) ||
    enabled !== policy.warningsEnabled;
  const daysOff = weeklyOffDays(policy.workingDays);

  // Falls back to the saved values while either box is mid-edit, so the sentence
  // never reads "Invalid Date to 5:00 PM" as somebody types.
  const openingPreview = timeLabelToMinutes(opening) ?? policy.openingMinutes;
  const closingPreview = timeLabelToMinutes(closing) ?? policy.closingMinutes;
  const cutoffPreview = timeLabelToMinutes(cutoff) ?? policy.cutoffMinutes;
  // Null while the box holds something that is not a usable window — an empty
  // field mid-retype, or a value out of range — so the sentence below asks for a
  // number instead of describing a policy nobody could save.
  const windowPreview = isHrMarkWindow(Number(hrWindow)) ? Number(hrWindow) : null;
  const hoursLabel =
    openingPreview < closingPreview
      ? describeOfficeHours(openingPreview, closingPreview)
      : "The office must close after it opens.";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MailWarning className="text-primary-ink size-4" aria-hidden />
          Office hours and attendance
        </CardTitle>
        <CardDescription>
          The hours the office keeps, and the deadline after which anyone who has not marked
          attendance on a working day is emailed a warning letter. Office closures and approved
          leave never count against anybody. The super admin is never written to.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={save} className="grid gap-5">
          <div className="space-y-2">
            <Label>Office hours</Label>
            <div className="flex flex-wrap items-end gap-5">
              <div className="space-y-1.5">
                <Label htmlFor="office-opening" className="text-muted-foreground text-xs font-normal">
                  Opens
                </Label>
                <Input
                  id="office-opening"
                  type="time"
                  value={opening}
                  onChange={(event) => setOpening(event.target.value)}
                  disabled={!canManage || saving}
                  className="w-36"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="office-closing" className="text-muted-foreground text-xs font-normal">
                  Closes
                </Label>
                <Input
                  id="office-closing"
                  type="time"
                  value={closing}
                  onChange={(event) => setClosing(event.target.value)}
                  disabled={!canManage || saving}
                  className="w-36"
                />
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              {hoursLabel} Pakistan time. Published so people — and the leave assistant — can be told
              the hours. Marking attendance is never judged by the clock: only where somebody is
              standing, and whether the office is open that day.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="attendance-cutoff">Cutoff time</Label>
              <Input
                id="attendance-cutoff"
                type="time"
                value={cutoff}
                onChange={(event) => setCutoff(event.target.value)}
                disabled={!canManage || saving}
                className="w-36"
              />
              <p className="text-muted-foreground text-xs">
                {friendlyTimeLabel(timeLabelToMinutes(cutoff) ?? policy.cutoffMinutes)} Pakistan time
              </p>
            </div>

            <div className="flex items-center gap-3 pb-6">
              <Switch
                id="warnings-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={!canManage || saving}
              />
              <Label htmlFor="warnings-enabled" className="cursor-pointer">
                Send warning letters
              </Label>
            </div>
          </div>

          {/*
            The other configuration that switches a feature off without saying
            so, surfaced where it is set for the same reason the closing-time
            notice below is.

            The sweep runs once a day and refuses to warn anybody before the
            deadline has passed, so a cutoff later than that single firing is
            never reached: every run returns `before-cutoff` and the letters
            simply stop. Nothing else reports it — an empty warnings table looks
            identical to a day nobody missed.
          */}
          {enabled && cutoffOutrunsSweep(cutoffPreview) && (
            <div className="border-warning/40 bg-warning/10 flex items-start gap-2 rounded-xl border p-3 text-sm">
              <MailWarning className="text-warning-ink mt-0.5 size-4 shrink-0" aria-hidden />
              <p className="text-warning-ink">
                The daily sweep runs at {friendlyTimeLabel(WARNING_SWEEP_MINUTES)}, before this{" "}
                {friendlyTimeLabel(cutoffPreview)} cutoff — and it never warns anybody whose deadline
                has not yet passed. With one run a day there is no later firing to catch them, so{" "}
                <strong>no warning letters would be sent at all</strong>. Set the cutoff to{" "}
                {friendlyTimeLabel(WARNING_SWEEP_MINUTES)} or earlier, or move the schedule in{" "}
                <code className="text-xs">vercel.json</code> to run after it.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="hr-mark-window">Mark-present window</Label>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                id="hr-mark-window"
                type="number"
                inputMode="numeric"
                min={MIN_HR_MARK_WINDOW_MINUTES}
                max={MAX_HR_MARK_WINDOW_MINUTES}
                step={5}
                value={hrWindow}
                onChange={(event) => setHrWindow(event.target.value)}
                disabled={!canManage || saving}
                className="w-28"
              />
              <span className="text-muted-foreground text-sm">minutes past the cutoff</span>
            </div>
            <p className="text-muted-foreground text-xs">
              {windowPreview === null ? (
                `Enter a whole number between ${MIN_HR_MARK_WINDOW_MINUTES} and ${MAX_HR_MARK_WINDOW_MINUTES}.`
              ) : windowPreview === 0 ? (
                <>
                  Administrators you have granted <strong>Record attendance by hand</strong> can mark
                  somebody present up to the {friendlyTimeLabel(cutoffPreview)} cutoff, and not a
                  minute past it.
                </>
              ) : (
                <>
                  Administrators you have granted <strong>Record attendance by hand</strong> can mark
                  somebody present until{" "}
                  <strong>{friendlyTimeLabel((cutoffPreview + windowPreview) % MINUTES_IN_DAY)}</strong> —{" "}
                  {describeHrMarkWindow(windowPreview)} past the {friendlyTimeLabel(cutoffPreview)}{" "}
                  cutoff. After that the day is beyond their reach, including on any earlier date, and
                  only you can record it.
                </>
              )}
            </p>
          </div>

          {/*
            The one configuration that makes the window unusable without saying
            so, surfaced where it is set rather than discovered by an
            administrator whose every correction is refused.

            `isAfterClosing` refuses a *typed* arrival later than the closing
            time. So when the office closes at or before the cutoff, every late
            arrival is also after closing and none can be recorded by hand at all
            — the window is open and everything inside it is refused for a
            different reason. That interaction is deliberate and documented; what
            was missing was anybody being told.
          */}
          {windowPreview !== null && windowPreview > 0 && closingPreview <= cutoffPreview && (
            <div className="border-warning/40 bg-warning/10 flex items-start gap-2 rounded-xl border p-3 text-sm">
              <MailWarning className="text-warning-ink mt-0.5 size-4 shrink-0" aria-hidden />
              <p className="text-warning-ink">
                The office closes at {friendlyTimeLabel(closingPreview)}, at or before the{" "}
                {friendlyTimeLabel(cutoffPreview)} cutoff — so a late arrival is also an arrival after
                closing, and <strong>nothing can be recorded inside this window</strong>. Nobody can
                have arrived at a shut office, so every attempt is refused. Move the closing time
                later than the cutoff for the window to be usable.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Working days</Label>
            <p className="text-muted-foreground text-sm">
              {daysOff.length === 0
                ? "Every day of the week is a working day."
                : `${describeWeekdays(daysOff)} are days off, so nobody is expected in or warned on them.`}{" "}
              <Link href={ROUTES.adminWorkingDays} className="text-primary-ink font-medium underline-offset-4 hover:underline">
                Change the working week
              </Link>
              , where it also decides what a leave request costs.
            </p>
          </div>

          {canManage ? (
            <div className="flex items-center gap-3">
              <Button type="submit" loading={saving} disabled={!dirty}>
                <Clock className="size-4" />
                Save policy
              </Button>
              {policy.updatedBy && (
                <span className="text-muted-foreground text-xs">
                  Last changed by {policy.updatedBy.name} on {formatDateTime(policy.updatedAt)}
                </span>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Only the super administrator can change these.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
