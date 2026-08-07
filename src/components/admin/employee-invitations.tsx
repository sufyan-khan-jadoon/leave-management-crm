"use client";

import { Loader2 } from "lucide-react";

import { InvitationSection, type Invitation } from "@/components/admin/invitation-section";
import type { JobRole } from "@/components/admin/job-role-dialog";
import { useApiResource } from "@/hooks/use-api-resource";
import { ROLE } from "@/lib/enums";

/**
 * Employee onboarding for the Employees screen.
 *
 * An administrator sees only the invitations they sent themselves — the API
 * scopes the list, so this renders whatever the viewer is entitled to without
 * needing to know the rule. A super admin opening this screen sees every
 * invitation, the same set the access panel shows.
 */
type InvitationsResponse = { items: Invitation[]; canIssue: { employee: boolean; admin: boolean } };
type JobRolesResponse = { items: JobRole[] };

export function EmployeeInvitations() {
  const invitations = useApiResource<InvitationsResponse>("/api/admin/invitations");
  const jobRoles = useApiResource<JobRolesResponse>("/api/admin/job-roles");

  if (invitations.loading && !invitations.data) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Loading invitations…
      </div>
    );
  }

  // An admin may only ever invite employees, so the picker collapses to nothing
  // and the panel invites at that role directly.
  const roles = invitations.data?.canIssue.employee ? [ROLE.EMPLOYEE] : [];

  return (
    <InvitationSection
      roles={roles}
      invitations={invitations.data?.items ?? []}
      jobRoles={jobRoles.data?.items ?? []}
      // Admins may add titles but not remove them — see the DELETE handler.
      canManageJobRoles={false}
      onChanged={async () => {
        await Promise.all([invitations.refresh(), jobRoles.refresh()]);
      }}
    />
  );
}
