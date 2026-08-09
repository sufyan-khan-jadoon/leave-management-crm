"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarRange, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/date";
import { describeWeekdays, ISO_WEEKDAYS, WEEKDAY_NAMES, type IsoWeekday } from "@/lib/working-days";
import type { WorkingWeekView } from "@/types";

function sortedKey(days: number[]): string {
  return [...days].sort((a, b) => a - b).join(",");
}

/**
 * The organisation's working week.
 *
 * Every day of the week is listed and switched individually — there is
 * deliberately no "weekend" concept to tick, because Saturday and Sunday being
 * the days off is one company's arrangement rather than a fact about weeks. A
 * company that works Saturday and rests Friday configures exactly that here.
 *
 * What is saved decides two separate things: how many days a leave request
 * costs, and who is expected in and chased for missing a day. The description
 * says so, because a screen that changed leave balances without mentioning it
 * would be a trap.
 *
 * Read by any administrator, changed by the super admin alone — `canManage`
 * comes from the API, which mirrors the check the route actually enforces.
 */
export function WorkingWeekPanel() {
  const [week, setWeek] = useState<WorkingWeekView | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [days, setDays] = useState<number[]>([]);

  const load = useCallback(async () => {
    try {
      const result = await apiClient.get<{ week: WorkingWeekView; canManage: boolean }>(
        "/api/admin/working-days",
      );

      setWeek(result.week);
      setCanManage(result.canManage);
      setDays(result.week.workingDays);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't load the working week.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(day: number, working: boolean) {
    setDays((current) =>
      working
        ? [...current, day].sort((a, b) => a - b)
        : current.filter((value) => value !== day),
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    // Mirrors the server, which refuses the same thing: a week with no working
    // days would leave every leave request holding zero of them.
    if (days.length === 0) {
      toast.error("Choose at least one working day.");
      return;
    }

    setSaving(true);

    try {
      const updated = await apiClient.patch<WorkingWeekView>("/api/admin/working-days", {
        workingDays: days,
      });

      setWeek(updated);
      setDays(updated.workingDays);
      toast.success(
        updated.daysOff.length === 0
          ? "Saved. Every day of the week is a working day."
          : `Saved. ${describeWeekdays(updated.daysOff)} no longer count towards leave.`,
      );
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't save the working week.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading the working week…
        </CardContent>
      </Card>
    );
  }

  if (!week) return null;

  const dirty = sortedKey(days) !== sortedKey(week.workingDays);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="text-primary-ink size-4" aria-hidden />
          Weekly schedule
        </CardTitle>
        <CardDescription>
          Which days the organisation works. A day switched off costs nobody a leave — a request
          spanning it books only the working days inside — and nobody is expected in or warned for
          missing it.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={save} className="grid gap-5">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Working</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ISO_WEEKDAYS.map((day) => {
                  const working = days.includes(day);
                  const name = WEEKDAY_NAMES[day as IsoWeekday];

                  return (
                    <TableRow key={day}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell>
                        <Badge variant={working ? "default" : "secondary"}>
                          {working ? "Working" : "Day off"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={working}
                          onCheckedChange={(next) => toggle(day, next)}
                          disabled={!canManage || saving}
                          aria-label={`${name} is a working day`}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <p className="text-muted-foreground text-sm">
            {days.length === 0
              ? "Every day is switched off. Choose at least one working day."
              : `Days off: ${describeWeekdays(ISO_WEEKDAYS.filter((day) => !days.includes(day)))}.`}
          </p>

          {canManage ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={saving} disabled={!dirty || days.length === 0}>
                {!saving && <Save className="size-4" />}
                Save working week
              </Button>
              {week.updatedBy && (
                <span className="text-muted-foreground text-xs">
                  Last changed by {week.updatedBy.name} on {formatDateTime(week.updatedAt)}
                </span>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Only the super administrator can change the working week.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
