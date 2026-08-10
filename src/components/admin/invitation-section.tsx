"use client";

import { useState } from "react";
import { Briefcase, Mail, RotateCw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { JobRoleDialog, type JobRole } from "@/components/admin/job-role-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/date";
import { INVITATION_STATUS, ROLE, type InvitationState, type InviteRole } from "@/lib/enums";

export type Invitation = {
  id: string;
  email: string;
  role: InviteRole;
  jobRole: { id: string; name: string } | null;
  status: InvitationState;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  invitedBy: { id: string; name: string };
  acceptedBy: { id: string; name: string; email: string; status: string } | null;
};

const ROLE_LABEL: Record<InviteRole, string> = {
  [ROLE.EMPLOYEE]: "Employee",
  [ROLE.ADMIN]: "Administrator",
};

/** What the recipient gets, spelled out so the choice is not guesswork. */
const ROLE_EFFECT: Record<InviteRole, string> = {
  [ROLE.EMPLOYEE]: "Joins as an employee and can sign in as soon as their email is verified.",
  [ROLE.ADMIN]: "Joins as an administrator, then waits for your approval before signing in.",
};

function invitationState(invitation: Invitation): { label: string; tone: string } {
  if (invitation.status === INVITATION_STATUS.ACCEPTED) return { label: "Accepted", tone: "text-success-ink" };
  if (new Date(invitation.expiresAt) <= new Date()) return { label: "Expired", tone: "text-destructive-ink" };
  return { label: "Pending", tone: "text-primary-ink" };
}

type InvitationSectionProps = {
  /**
   * Roles this viewer may hand out. Two shows a picker; one invites at that role
   * directly. The server enforces this either way — what is rendered only ever
   * reflects the decision, never makes it.
   *
   * Never empty: `InviteMemberDialog` is the only host, and it shows no button
   * at all to somebody who may invite nobody, so there is no "you may not do
   * this" state left for this component to render.
   */
  roles: InviteRole[];
  invitations: Invitation[];
  /** Shared list of job titles the invitation may carry. */
  jobRoles: JobRole[];
  /** Removing a title changes everyone's options, so it is super admin only. */
  canManageJobRoles: boolean;
  onChanged: () => void | Promise<void>;
};

/** Sentinel for "leave the title to profile setup" — Radix forbids empty values. */
const NO_JOB_ROLE = "none";

/**
 * Invite-and-manage panel — the body of `InviteMemberDialog`, and nothing else.
 *
 * The address and the role are chosen together and travel on the invitation, so
 * whoever opens the emailed link becomes exactly what was picked here —
 * registration reads both off the invitation rather than off the sign-up form.
 *
 * It carries no card, heading or description of its own: it used to sit on two
 * screens as a panel and now sits inside a dialog, which supplies that chrome.
 * Sending and the list beneath it are unchanged, because the invitation is the
 * same act wherever the button that starts it happens to live.
 */
export function InvitationSection({
  roles,
  invitations,
  jobRoles,
  canManageJobRoles,
  onChanged,
}: InvitationSectionProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>(roles[0] ?? ROLE.EMPLOYEE);
  const [jobRoleId, setJobRoleId] = useState<string>(NO_JOB_ROLE);
  const [managingRoles, setManagingRoles] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  /** Both sending and resending end the same way, so they report it the same way. */
  function reportDelivery(sent: boolean, address: string, resent: boolean) {
    if (sent) {
      toast.success(resent ? `Invitation resent to ${address}.` : `Invitation sent to ${address}.`);
      return;
    }

    // The invitation exists and the link is live; only the delivery failed. Said
    // plainly, because the administrator is the only person who can notice.
    toast.warning(`Invitation saved, but the email to ${address} couldn't be delivered. Try resending it.`);
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault();

    const address = email.trim();
    if (!address || busy) return;

    setBusy("invite");

    try {
      const result = await apiClient.post<{ emailSent: boolean }>("/api/admin/invitations", {
        email: address,
        role,
        jobRoleId: jobRoleId === NO_JOB_ROLE ? undefined : jobRoleId,
      });

      setEmail("");
      reportDelivery(result.emailSent, address, false);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't send that invitation.");
    } finally {
      setBusy(null);
    }
  }

  async function resend(invitation: Invitation) {
    setBusy(invitation.id);

    try {
      const result = await apiClient.post<{ emailSent: boolean }>(
        `/api/admin/invitations/${invitation.id}/resend`,
      );

      reportDelivery(result.emailSent, invitation.email, true);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't resend that invitation.");
    } finally {
      setBusy(null);
    }
  }

  async function withdraw(invitation: Invitation) {
    setBusy(invitation.id);

    try {
      await apiClient.delete(`/api/admin/invitations/${invitation.id}`);
      toast.success(`Invitation to ${invitation.email} withdrawn.`);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't withdraw that invitation.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Stacked rather than the single wide row this was on a full-width card:
          the same four controls, laid out for the width a dialog actually has. */}
      <form onSubmit={invite} className="space-y-2" noValidate>
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@company.com"
          autoComplete="off"
          maxLength={254}
          aria-label="Email address to invite"
        />

        <div className="flex items-center gap-2">
          {roles.length > 1 && (
            <Select value={role} onValueChange={(value) => setRole(value as InviteRole)}>
              <SelectTrigger className="flex-1" aria-label="Role this invitation grants">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((option) => (
                  <SelectItem key={option} value={option}>
                    {ROLE_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={jobRoleId} onValueChange={setJobRoleId}>
            <SelectTrigger className="flex-1" aria-label="Job title this invitation assigns">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_JOB_ROLE}>No job title</SelectItem>
              {jobRoles.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setManagingRoles(true)}
            aria-label="Manage job roles"
          >
            <Briefcase className="size-4" />
          </Button>
        </div>

        <p className="text-muted-foreground text-xs">
          {ROLE_EFFECT[role]}
          {jobRoleId !== NO_JOB_ROLE &&
            ` Their job title is set to "${jobRoles.find((r) => r.id === jobRoleId)?.name ?? ""}".`}
        </p>

        <Button
          type="submit"
          className="w-full"
          disabled={!email.trim() || busy === "invite"}
          loading={busy === "invite"}
        >
          {busy !== "invite" && <Send className="size-4" />}
          Send invitation
        </Button>
      </form>

      <div className="border-border/60 border-t pt-1">
        {invitations.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="No invitations yet"
            description="Invite your first person above."
            inset={false}
          />
        ) : (
          <ul className="scrollbar-thin divide-border/60 max-h-64 divide-y overflow-y-auto">
            {invitations.map((invitation) => {
              const state = invitationState(invitation);
              const pending = invitation.status === INVITATION_STATUS.PENDING;

              return (
                <li key={invitation.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="mr-auto min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium break-all">{invitation.email}</p>
                      {/* The role is the whole point of the invitation, so it is
                          stated on the row rather than implied by the list. */}
                      <Badge variant={invitation.role === ROLE.ADMIN ? "warning" : "success"}>
                        {ROLE_LABEL[invitation.role]}
                      </Badge>
                      {invitation.jobRole && <Badge variant="secondary">{invitation.jobRole.name}</Badge>}
                    </div>
                    <p className="text-muted-foreground truncate text-xs">
                      <span className={state.tone}>{state.label}</span>
                      {` · invited by ${invitation.invitedBy.name}`}
                      {pending ? ` · expires ${formatDateTime(invitation.expiresAt)}` : ""}
                      {invitation.acceptedAt ? ` · accepted ${formatDateTime(invitation.acceptedAt)}` : ""}
                    </p>
                  </div>

                  {/* Resending covers both halves of "it never arrived": a mail
                      that went astray, and one that sat unopened until it
                      lapsed. Either way the fix is a fresh link. */}
                  {pending && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resend(invitation)}
                        disabled={busy === invitation.id}
                      >
                        <RotateCw className="size-4" />
                        Resend
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => withdraw(invitation)}
                        disabled={busy === invitation.id}
                      >
                        <Trash2 className="size-4" />
                        Withdraw
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <JobRoleDialog
        open={managingRoles}
        onOpenChange={setManagingRoles}
        roles={jobRoles}
        canDelete={canManageJobRoles}
        onChanged={onChanged}
      />
    </div>
  );
}
