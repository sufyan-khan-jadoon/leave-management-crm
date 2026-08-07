"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ApiClientError, apiClient } from "@/lib/api-client";

export type Administrator = {
  id: string;
  name: string;
  email: string;
  canInviteEmployees: boolean;
};

/**
 * Grants administrators the right to invite employees.
 *
 * Off by default — being made an administrator does not by itself confer the
 * right to onboard people. Toggling here is the whole grant: the permission is
 * read from the database on every invitation, so withdrawing it stops the next
 * attempt rather than waiting for a session to expire.
 */
export function AdminPermissions({
  admins,
  onChanged,
}: {
  admins: Administrator[];
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(admin: Administrator, allowed: boolean) {
    setBusy(admin.id);

    try {
      await apiClient.patch(`/api/admin/administrators/${admin.id}`, { canInviteEmployees: allowed });
      toast.success(
        allowed ? `${admin.name} can now invite employees.` : `${admin.name} can no longer invite employees.`,
      );
      await onChanged();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't update that permission.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="text-primary-ink size-4" aria-hidden />
          Who can invite employees
        </CardTitle>
        <CardDescription>
          Administrators cannot onboard anyone until you allow it. Inviting other administrators stays with
          you either way.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {admins.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No administrators yet"
            description="Approved administrators will appear here."
            inset={false}
          />
        ) : (
          <ul className="divide-border/60 divide-y">
            {admins.map((admin) => (
              <li key={admin.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="mr-auto min-w-0">
                  <p className="truncate font-medium">{admin.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{admin.email}</p>
                </div>

                <span className="text-muted-foreground text-xs">
                  {admin.canInviteEmployees ? "Can invite" : "Cannot invite"}
                </span>
                <Switch
                  checked={admin.canInviteEmployees}
                  onCheckedChange={(checked) => toggle(admin, checked)}
                  disabled={busy === admin.id}
                  aria-label={`Allow ${admin.name} to invite employees`}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
