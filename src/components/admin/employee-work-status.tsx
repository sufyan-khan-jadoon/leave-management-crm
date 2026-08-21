"use client";

import { useCallback, useEffect, useState } from "react";
import { House, MapPin, Plus, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { AssignRemoteDialog } from "@/components/admin/assign-remote-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiClientError, apiClient, toQueryString } from "@/lib/api-client";
import { formatDate } from "@/lib/date";
import { remoteStateLabel, remoteTypeLabel } from "@/lib/remote-work";
import type { RemoteWorkListView, RemoteWorkView } from "@/types";

/**
 * §7's work-status section on somebody's profile.
 *
 * **It asks the same endpoint the management screen does**, narrowed to one
 * person, rather than being handed a value by the server-rendered page around
 * it. Two reasons: `canManage` arrives with the answer, so this cannot offer a
 * button the service would refuse; and revoking or assigning from here refreshes
 * in place rather than needing the whole page rebuilt.
 *
 * It shows the **live** arrangement and the history beneath it, because "is this
 * person remote right now" and "have they been before" are different questions
 * and only the first one has actions attached.
 */
export function EmployeeWorkStatus({
  employee,
}: {
  employee: { id: string; name: string; email: string };
}) {
  const [items, setItems] = useState<RemoteWorkView[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await apiClient.get<RemoteWorkListView>(
        // `state=ALL`, because this is a profile: an ended arrangement is part of
        // the record of somebody's working history even though it changes
        // nothing about today.
        `/api/admin/remote-work${toQueryString({ employeeId: employee.id, state: "ALL", pageSize: 20 })}`,
      );

      setItems(result.items);
      setCanManage(result.canManage);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't load the work status.");
    } finally {
      setLoading(false);
    }
  }, [employee.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // At most one, by construction: overlapping live periods are refused, so a
  // person cannot be covered by two at once.
  const active = items.find((item) => item.state === "ACTIVE") ?? null;
  const scheduled = items.filter((item) => item.state === "SCHEDULED");
  const past = items.filter((item) => item.state === "EXPIRED" || item.state === "REVOKED");

  async function revoke() {
    if (!active || revoking) return;
    setRevoking(true);

    try {
      const result = await apiClient.delete<{ resumesOn: string }>(`/api/admin/remote-work/${active.id}`);

      toast.success(
        `${employee.name} is back on normal attendance from ${formatDate(result.resumesOn)}.`,
      );

      await load();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't revoke that period.");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {active ? (
              <House className="text-warning-ink size-4" aria-hidden />
            ) : (
              <MapPin className="text-primary-ink size-4" aria-hidden />
            )}
            Work status
          </CardTitle>
          <CardDescription>
            {loading
              ? "Loading…"
              : active
                ? "Remote — attendance is not recorded for this period."
                : "Currently working under normal attendance rules."}
          </CardDescription>
        </div>

        {canManage && !active && (
          <Button size="sm" onClick={() => setAssigning(true)}>
            <Plus className="size-4" />
            Set remote
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {!loading && active && (
          <div className="glass-inset space-y-2 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="warning">
                {active.endDate === null ? "Remote — until revoked" : "Remote"}
              </Badge>
              <Badge variant="outline">{remoteTypeLabel(active.type)}</Badge>
            </div>

            <p className="text-sm font-medium">
              {active.endDate === null
                ? "No end date — remote until an administrator revokes it."
                : `Remote until ${formatDate(active.endDate)}`}
            </p>
            <p className="text-muted-foreground text-sm">
              {active.periodLabel} · set by {active.assignedBy.name}
            </p>
            <p className="text-muted-foreground text-sm">{active.reason}</p>

            {canManage && (
              <Button variant="outline" size="sm" onClick={() => void revoke()} loading={revoking}>
                <Undo2 className="size-4" />
                Revoke remote work
              </Button>
            )}
          </div>
        )}

        {!loading && !active && (
          <p className="text-muted-foreground text-sm">
            {employee.name} is expected in the office on working days and is marked present or absent
            like anybody else.
          </p>
        )}

        {scheduled.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Starting later</p>
            {scheduled.map((item) => (
              <p key={item.id} className="text-muted-foreground text-sm">
                {item.periodLabel} — {item.reason}
              </p>
            ))}
          </div>
        )}

        {past.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Previous arrangements</p>
            <ul className="space-y-1">
              {past.map((item) => (
                <li key={item.id} className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="secondary">{remoteStateLabel(item.state)}</Badge>
                  <span>{item.periodLabel}</span>
                  <span className="truncate">— {item.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <AssignRemoteDialog
        open={assigning}
        onOpenChange={setAssigning}
        onAssigned={load}
        presetEmployee={employee}
      />
    </Card>
  );
}
