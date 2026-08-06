"use client";

import { Loader2 } from "lucide-react";

import { InviteKeySection, type InviteKey } from "@/components/admin/invite-key-section";
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

export function EmployeeInviteKeys() {
  const { data, loading, refresh } = useApiResource<InvitesResponse>("/api/admin/invites");

  if (loading && !data) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Loading invite keys…
      </div>
    );
  }

  return (
    <InviteKeySection
      role={ROLE.EMPLOYEE}
      invites={data?.items ?? []}
      canIssue={data?.canIssue.employee ?? false}
      onChanged={refresh}
    />
  );
}
