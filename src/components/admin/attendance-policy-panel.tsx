"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Loader2, MailWarning } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiClientError, apiClient } from "@/lib/api-client";
import {
  friendlyTimeLabel,
  minutesToTimeLabel,
  timeLabelToMinutes,
  WEEKDAY_NAMES,
  type IsoWeekday,
} from "@/lib/attendance-policy";
import { formatDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { AttendancePolicyView } from "@/types";

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * The one place the working day is defined.
 *
 * Everything here feeds the warning sweep and nothing else decides it: the
 * cutoff is the deadline people are warned against, and the working days are
 * what stops the whole company being written to every weekend. Read by any
 * administrator, changed by the super admin alone.
 */
export function AttendancePolicyPanel() {
  const [policy, setPolicy] = useState<AttendancePolicyView | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [cutoff, setCutoff] = useState("17:00");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [enabled, setEnabled] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await apiClient.get<{ policy: AttendancePolicyView; canManage: boolean }>(
        "/api/admin/attendance/policy",
      );

      setPolicy(result.policy);
      setCanManage(result.canManage);
      setCutoff(minutesToTimeLabel(result.policy.cutoffMinutes));
      setDays(result.policy.workingDays);
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

  function toggleDay(day: number) {
    setDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort(),
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    if (timeLabelToMinutes(cutoff) === null) {
      toast.error("Enter a cutoff time between 00:00 and 23:59.");
      return;
    }

    if (days.length === 0) {
      toast.error("Choose at least one working day.");
      return;
    }

    setSaving(true);

    try {
      const updated = await apiClient.patch<AttendancePolicyView>("/api/admin/attendance/policy", {
        cutoff,
        workingDays: days,
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
    enabled !== policy.warningsEnabled ||
    days.join(",") !== [...policy.workingDays].sort((a, b) => a - b).join(",");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MailWarning className="text-primary-ink size-4" aria-hidden />
          Attendance warnings
        </CardTitle>
        <CardDescription>
          Anyone who has not marked attendance by the cutoff on a working day is emailed a warning
          letter. Office closures and approved leave never count against anybody. The super admin is
          never written to.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={save} className="grid gap-5">
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
            <div className="flex flex-wrap gap-2">
              {ALL_DAYS.map((day) => {
                const active = days.includes(day);

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => canManage && !saving && toggleDay(day)}
                    disabled={!canManage || saving}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                      "disabled:cursor-not-allowed disabled:opacity-60",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "glass-inset text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {WEEKDAY_NAMES[day as IsoWeekday].slice(0, 3)}
                  </button>
                );
              })}
            </div>
            <p className="text-muted-foreground text-xs">
              Nobody is expected in, or warned, on a day left unselected.
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
