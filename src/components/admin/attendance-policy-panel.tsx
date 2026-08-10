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
  describeOfficeHours,
  friendlyTimeLabel,
  minutesToTimeLabel,
  timeLabelToMinutes,
} from "@/lib/attendance-policy";
import { ROUTES } from "@/lib/constants";
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

    setSaving(true);

    try {
      const updated = await apiClient.patch<AttendancePolicyView>("/api/admin/attendance/policy", {
        cutoff,
        // Always sent as a pair: the endpoint judges them together, and the
        // panel has both in hand whether or not either was touched.
        opening,
        closing,
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
    enabled !== policy.warningsEnabled;
  const daysOff = weeklyOffDays(policy.workingDays);

  // Falls back to the saved values while either box is mid-edit, so the sentence
  // never reads "Invalid Date to 5:00 PM" as somebody types.
  const openingPreview = timeLabelToMinutes(opening) ?? policy.openingMinutes;
  const closingPreview = timeLabelToMinutes(closing) ?? policy.closingMinutes;
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
