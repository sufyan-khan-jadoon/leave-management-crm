"use client";

import { Loader2 } from "lucide-react";

import { InviteKeySection, type InviteKey } from "@/components/admin/invite-key-section";
import type { JobRole } from "@/components/admin/job-role-dialog";
import { useApiResource } from "@/hooks/use-api-resource";
import { ROLE } from "@/lib/enums";

/**
 * Employee onboarding for the Employees screen.
 *
 * An administrator sees only the employee keys they issued themselves — the API
 * scopes the list, so this renders whatever the viewer is entitled to without
 * needing to know the rule. A super admin opening this screen sees every key,
 * the same set the access panel shows.
 */
type InvitesResponse = { items: InviteKey[]; canIssue: { employee: boolean; admin: boolean } };
type JobRolesResponse = { items: JobRole[] };

export function EmployeeInviteKeys() {
  const invites = useApiResource<InvitesResponse>("/api/admin/invites");
  const jobRoles = useApiResource<JobRolesResponse>("/api/admin/job-roles");

  if (invites.loading && !invites.data) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Loading invite keys…
      </div>
    );
  }

  // An admin may only ever hand out employee keys, so the picker collapses to
  // nothing and the panel issues that role directly.
  const roles = invites.data?.canIssue.employee ? [ROLE.EMPLOYEE] : [];

  return (
    <InviteKeySection
      roles={roles}
      invites={invites.data?.items ?? []}
      jobRoles={jobRoles.data?.items ?? []}
      // Admins may add titles but not remove them — see the DELETE handler.
      canManageJobRoles={false}
      onChanged={async () => {
        await Promise.all([invites.refresh(), jobRoles.refresh()]);
      }}
    />
  );
}
