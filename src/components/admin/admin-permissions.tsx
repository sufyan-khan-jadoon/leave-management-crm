"use client";

import { useState } from "react";
import { CalendarOff, Mail, ShieldCheck, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
  canManageHolidays: boolean;
  canSendEmails: boolean;
};

/** One delegable right, described once and rendered for every administrator. */
type Grant = {
  key: "canInviteEmployees" | "canManageHolidays" | "canSendEmails";
  icon: LucideIcon;
  label: string;
  on: string;
  off: string;
  granted: string;
  revoked: string;
};

const GRANTS: Grant[] = [
  {
    key: "canInviteEmployees",
    icon: UserPlus,
    label: "Invite employees",
    on: "Can invite",
    off: "Cannot invite",
    granted: "can now invite employees",
    revoked: "can no longer invite employees",
  },
  {
    key: "canManageHolidays",
    icon: CalendarOff,
    label: "Manage office days off",
    on: "Can close the office",
    off: "Cannot close the office",
    granted: "can now schedule office days off",
    revoked: "can no longer schedule office days off",
  },
  {
    key: "canSendEmails",
    icon: Mail,
    label: "Send emails",
    // Says what it does *not* grant, because that is the part somebody
    // delegating it would otherwise have to guess at.
    on: "Can write to one person or all employees",
    off: "Cannot send email",
    granted: "can now email individuals and employees",
    revoked: "can no longer send email",
  },
];

/**
 * Grants administrators the rights the super admin chooses to delegate.
 *
 * Everything here is off by default — being made an administrator does not by
 * itself confer the right to onboard people or to shut the office. Toggling is
 * the whole grant: each permission is read from the database on every request
 * that depends on it, so withdrawing one stops the next attempt rather than
 * waiting for a session to expire.
 */
export function AdminPermissions({
  admins,
  onChanged,
}: {
  admins: Administrator[];
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(admin: Administrator, grant: Grant, allowed: boolean) {
    setBusy(`${admin.id}:${grant.key}`);

    try {
      // Only the switch that moved is sent, so the request cannot carry a stale
      // value for the other one back to the server.
      await apiClient.patch(`/api/admin/administrators/${admin.id}`, { [grant.key]: allowed });
      toast.success(`${admin.name} ${allowed ? grant.granted : grant.revoked}.`);
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
          What administrators may do
        </CardTitle>
        <CardDescription>
          Administrators cannot onboard anyone, close the office or send email until you allow it.
          Inviting other administrators stays with you either way, as does emailing every
          administrator or the whole organisation at once.
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
              <li key={admin.id} className="space-y-3 py-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{admin.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{admin.email}</p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {GRANTS.map((grant) => (
                    <label
                      key={grant.key}
                      className="border-border/60 bg-muted/30 flex items-center gap-3 rounded-lg border px-3 py-2"
                    >
                      <grant.icon className="text-muted-foreground size-4 shrink-0" aria-hidden />

                      <div className="mr-auto min-w-0">
                        <p className="truncate text-sm font-medium">{grant.label}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          {admin[grant.key] ? grant.on : grant.off}
                        </p>
                      </div>

                      <Switch
                        checked={admin[grant.key]}
                        onCheckedChange={(checked) => toggle(admin, grant, checked)}
                        disabled={busy === `${admin.id}:${grant.key}`}
                        aria-label={`Allow ${admin.name} to ${grant.label.toLowerCase()}`}
                      />
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
