"use client";

import { useState } from "react";
import { Briefcase, Check, Copy, KeyRound, Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { JobRoleDialog, type JobRole } from "@/components/admin/job-role-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { INVITE_TTL_DAYS } from "@/lib/constants";
import { formatDateTime } from "@/lib/date";
import { ROLE, type InviteRole } from "@/lib/enums";

export type InviteKey = {
  id: string;
  key: string;
  role: InviteRole;
  jobRole: { id: string; name: string } | null;
  label: string | null;
  expiresAt: string;
  revokedAt: string | null;
  redeemedAt: string | null;
  createdAt: string;
  redeemedBy: { id: string; name: string; email: string; status: string } | null;
};

const ROLE_LABEL: Record<InviteRole, string> = {
  [ROLE.EMPLOYEE]: "Employee",
  [ROLE.ADMIN]: "Administrator",
};

/** What the holder gets, spelled out so the choice is not guesswork. */
const ROLE_EFFECT: Record<InviteRole, string> = {
  [ROLE.EMPLOYEE]: "Joins as an employee and can sign in as soon as their email is verified.",
  [ROLE.ADMIN]: "Joins as an administrator, then waits for your approval before signing in.",
};

function keyState(invite: InviteKey): { label: string; tone: string } {
  if (invite.revokedAt) return { label: "Revoked", tone: "text-muted-foreground" };
  if (invite.redeemedAt) return { label: "Used", tone: "text-success-ink" };
  if (new Date(invite.expiresAt) <= new Date()) return { label: "Expired", tone: "text-destructive-ink" };
  return { label: "Unused", tone: "text-primary-ink" };
}

type InviteKeySectionProps = {
  /**
   * Roles this viewer may hand out. Two shows a picker; one issues that role
   * directly; none locks the form. The server enforces this either way — what
   * is rendered only ever reflects the decision, never makes it.
   */
  roles: InviteRole[];
  invites: InviteKey[];
  /** Shared list of job titles the key may carry. */
  jobRoles: JobRole[];
  /** Removing a title changes everyone's options, so it is super admin only. */
  canManageJobRoles: boolean;
  onChanged: () => void | Promise<void>;
};

/** Sentinel for "leave the title to profile setup" — Radix forbids empty values. */
const NO_JOB_ROLE = "none";

/**
 * Issue-and-manage panel for invite keys.
 *
 * The role is chosen at the moment of creation and travels on the key, so
 * whoever redeems it becomes exactly what was picked here — registration reads
 * the role off the key rather than off the sign-up form.
 */
export function InviteKeySection({
  roles,
  invites,
  jobRoles,
  canManageJobRoles,
  onChanged,
}: InviteKeySectionProps) {
  const [role, setRole] = useState<InviteRole>(roles[0] ?? ROLE.EMPLOYEE);
  const [jobRoleId, setJobRoleId] = useState<string>(NO_JOB_ROLE);
  const [managingRoles, setManagingRoles] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const canIssue = roles.length > 0;

  async function issue() {
    setBusy("issue");

    try {
      await apiClient.post("/api/admin/invites", {
        role,
        jobRoleId: jobRoleId === NO_JOB_ROLE ? undefined : jobRoleId,
        label: label.trim() || undefined,
      });
      setLabel("");
      toast.success(`${ROLE_LABEL[role]} key created.`);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't create a key.");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(id: string) {
    setBusy(id);

    try {
      await apiClient.delete(`/api/admin/invites/${id}`);
      toast.success("Key revoked.");
      await onChanged();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't revoke that key.");
    } finally {
      setBusy(null);
    }
  }

  async function copyKey(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Couldn't copy — select the key and copy it manually.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="text-primary-ink size-4" aria-hidden />
          Invite keys
        </CardTitle>
        <CardDescription>
          Pick what the holder should become, create the key, and send it to them. Whoever signs up with it
          gets that role automatically. Each key works once and expires after {INVITE_TTL_DAYS} days.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {canIssue ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {roles.length > 1 && (
                <Select value={role} onValueChange={(value) => setRole(value as InviteRole)}>
                  <SelectTrigger className="w-44" aria-label="Role this key grants">
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
                <SelectTrigger className="w-48" aria-label="Job title this key assigns">
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

              <Input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Who is this for? (optional)"
                maxLength={80}
                className="max-w-xs"
                aria-label="Note for this key"
              />

              <Button onClick={issue} disabled={busy === "issue"} loading={busy === "issue"}>
                {busy !== "issue" && <Plus className="size-4" />}
                Create key
              </Button>
            </div>

            <p className="text-muted-foreground text-xs">
              {ROLE_EFFECT[role]}
              {jobRoleId !== NO_JOB_ROLE &&
                ` Their job title is set to "${jobRoles.find((r) => r.id === jobRoleId)?.name ?? ""}".`}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground glass-inset rounded-lg p-3 text-sm">
            <Lock className="mr-1.5 inline size-3.5 -translate-y-px" aria-hidden />
            Your super administrator has not given you permission to invite employees yet.
          </p>
        )}

        {invites.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No keys yet"
            description={canIssue ? "Create one to invite your first person." : "Keys you issue will appear here."}
            inset={false}
          />
        ) : (
          <ul className="divide-border/60 divide-y">
            {invites.map((invite) => {
              const state = keyState(invite);
              const usable = !invite.revokedAt && !invite.redeemedAt;

              return (
                <li key={invite.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="mr-auto min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-medium break-all">{invite.key}</p>
                      {/* The role is the whole point of the key, so it is stated
                          on the row rather than implied by which list it is in. */}
                      <Badge variant={invite.role === ROLE.ADMIN ? "warning" : "success"}>
                        {ROLE_LABEL[invite.role]}
                      </Badge>
                      {invite.jobRole && <Badge variant="secondary">{invite.jobRole.name}</Badge>}
                    </div>
                    <p className="text-muted-foreground truncate text-xs">
                      <span className={state.tone}>{state.label}</span>
                      {invite.label ? ` · ${invite.label}` : ""}
                      {invite.redeemedBy ? ` · used by ${invite.redeemedBy.email}` : ""}
                      {usable ? ` · expires ${formatDateTime(invite.expiresAt)}` : ""}
                    </p>
                  </div>

                  <Button variant="outline" size="sm" onClick={() => copyKey(invite.key)}>
                    {copied === invite.key ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied === invite.key ? "Copied" : "Copy"}
                  </Button>

                  {usable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revoke(invite.id)}
                      disabled={busy === invite.id}
                    >
                      <Trash2 className="size-4" />
                      Revoke
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <JobRoleDialog
        open={managingRoles}
        onOpenChange={setManagingRoles}
        roles={jobRoles}
        canDelete={canManageJobRoles}
        onChanged={onChanged}
      />
    </Card>
  );
}
