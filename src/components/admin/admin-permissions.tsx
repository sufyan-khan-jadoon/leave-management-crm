"use client";

import { useState } from "react";
import {
  CalendarOff,
  History,
  House,
  Mail,
  MailWarning,
  MapPinCheck,
  MessageSquareWarning,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
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
  canEmailAdmins: boolean;
  canViewAdminRecords: boolean;
  canMarkAttendance: boolean;
  canManageComplaints: boolean;
  canManageRemoteWork: boolean;
  canEditHistoricalAttendance: boolean;
};

/** One delegable right, described once and rendered for every administrator. */
type Grant = {
  key:
    | "canInviteEmployees"
    | "canManageHolidays"
    | "canSendEmails"
    | "canEmailAdmins"
    | "canViewAdminRecords"
    | "canMarkAttendance"
    | "canManageComplaints"
    | "canManageRemoteWork"
    | "canEditHistoricalAttendance";
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
    label: "Send emails to employees",
    // Says what it does *not* grant, because that is the part somebody
    // delegating it would otherwise have to guess at.
    on: "Can write to one employee or all of them",
    off: "Cannot send email",
    granted: "can now email employees",
    revoked: "can no longer email employees",
  },
  {
    key: "canEmailAdmins",
    icon: MailWarning,
    label: "Send emails to admins",
    // Names the reach rather than the screen, because the switch beside it also
    // says "send emails" and the difference between the two is exactly who is
    // written to. It is worth saying that this one also opens the one-person
    // picker up to administrators — otherwise somebody granting only the switch
    // above would reasonably expect it already had.
    on: "Can write to selected administrators, or all of them",
    off: "Cannot write to any administrator",
    granted: "can now email administrators",
    revoked: "can no longer email administrators",
  },
  {
    key: "canViewAdminRecords",
    icon: Users,
    // Named for what it hands over rather than for the control it enables. The
    // switch is a filter; what somebody gains by it is being told which of their
    // colleagues is an administrator.
    label: "Report on administrators",
    on: "Can separate administrators from employees",
    off: "Sees everyone together, unlabelled",
    granted: "can now report on administrators separately",
    revoked: "can no longer report on administrators separately",
  },
  {
    key: "canMarkAttendance",
    icon: MapPinCheck,
    label: "Record attendance by hand",
    // Says out loud that this one overrides the geofence. It is the only grant
    // here that lets somebody write a fact the building did not prove, and an
    // administrator deciding whether to hand it over should not have to infer
    // that from the word "attendance".
    on: "Can mark an absent person present, overriding the location check",
    off: "Cannot change attendance",
    granted: "can now record attendance by hand",
    revoked: "can no longer record attendance by hand",
  },
  {
    key: "canManageComplaints",
    icon: MessageSquareWarning,
    label: "Manage employee complaints",
    // The only grant here whose screen disappears entirely without it, and the
    // wording says so — an administrator wondering where the Complaints item
    // went should be able to find the answer on this panel.
    on: "Can read every complaint and resolve them",
    off: "Cannot see complaints at all",
    granted: "can now read and resolve employee complaints",
    revoked: "can no longer see employee complaints",
  },
  {
    key: "canManageRemoteWork",
    icon: House,
    label: "Arrange remote work",
    // Says out loud what a remote period actually does, because "remote work"
    // on its own reads as a scheduling convenience. It is the one grant here
    // that takes somebody off the attendance register entirely — no present, no
    // absent, no warning letters — which is a stronger thing than recording a
    // single day by hand, and an administrator deciding whether to hand it over
    // should not have to infer that.
    on: "Can exempt people from attendance for a period, or indefinitely",
    off: "Cannot arrange remote work",
    granted: "can now arrange remote work",
    revoked: "can no longer arrange remote work",
  },
  {
    key: "canEditHistoricalAttendance",
    icon: History,
    label: "Edit past attendance",
    // Names the two things that make this stronger than "Record attendance by
    // hand" above it: it runs in both directions, and it has no deadline. An
    // administrator deciding whether to delegate it should not have to work out
    // from the word "edit" that it can erase a check-in the office proved.
    on: "Can change a finished day to Present, Absent or On leave",
    off: "Cannot change past attendance",
    granted: "can now edit past attendance",
    revoked: "can no longer edit past attendance",
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
          Administrators cannot onboard anyone, close the office, send email or report on
          administrators as a group until you allow it. Writing to the employees and writing to the
          other administrators are separate switches, so neither arrives with the other, and
          complaints are hidden from an administrator&apos;s sidebar entirely until you grant them.
          Inviting other administrators stays with you either way, as does emailing the whole
          organisation at once, and managing administrator accounts on Staff.
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
