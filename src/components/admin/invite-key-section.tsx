"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { INVITE_TTL_DAYS } from "@/lib/constants";
import { formatDateTime } from "@/lib/date";
import { ROLE, type InviteRole } from "@/lib/enums";

export type InviteKey = {
  id: string;
  key: string;
  role: InviteRole;
  label: string | null;
  expiresAt: string;
  revokedAt: string | null;
  redeemedAt: string | null;
  createdAt: string;
  redeemedBy: { id: string; name: string; email: string; status: string } | null;
};

/** Wording differs per role; the mechanism behind them is identical. */
const COPY: Record<InviteRole, { title: string; description: string; empty: string; placeholder: string }> = {
  [ROLE.EMPLOYEE]: {
    title: "Employee keys",
    description: `Each key lets one person join as an employee and expires after ${INVITE_TTL_DAYS} days. They can sign in as soon as they verify their email — no approval needed.`,
    empty: "Create one to invite your first employee.",
    placeholder: "Who is this for? (optional)",
  },
  [ROLE.ADMIN]: {
    title: "Administrator keys",
    description: `Each key admits one administrator and expires after ${INVITE_TTL_DAYS} days. Whoever uses it still needs your approval before they can sign in.`,
    empty: "Create one to invite your first administrator.",
    placeholder: "Who is this for? (optional)",
  },
};

function keyState(invite: InviteKey): { label: string; tone: string } {
  if (invite.revokedAt) return { label: "Revoked", tone: "text-muted-foreground" };
  if (invite.redeemedAt) return { label: "Used", tone: "text-success-ink" };
  if (new Date(invite.expiresAt) <= new Date()) return { label: "Expired", tone: "text-destructive-ink" };
  return { label: "Unused", tone: "text-primary-ink" };
}

type InviteKeySectionProps = {
  role: InviteRole;
  /** The full list; this component picks out the keys for its own role. */
  invites: InviteKey[];
  /** False hides the form. The server enforces this regardless of what's shown. */
  canIssue: boolean;
  onChanged: () => void | Promise<void>;
};

/**
 * Issue-and-manage panel for invite keys of one role.
 *
 * Shared by the super admin's access panel — which renders one of these per
 * role — and the employees screen, where an admin gets the employee one alone.
 * Which roles a viewer may actually issue is settled server-side; rendering this
 * only ever reflects that decision.
 */
export function InviteKeySection({ role, invites, canIssue, onChanged }: InviteKeySectionProps) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = COPY[role];
  const rows = invites.filter((invite) => invite.role === role);

  async function issue() {
    setBusy("issue");

    try {
      await apiClient.post("/api/admin/invites", { role, label: label.trim() || undefined });
      setLabel("");
      toast.success(role === ROLE.ADMIN ? "Administrator key created." : "Employee key created.");
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
          {copy.title}
        </CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canIssue ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={copy.placeholder}
              maxLength={80}
              className="max-w-xs"
              aria-label={`Note for this ${role === ROLE.ADMIN ? "administrator" : "employee"} key`}
            />
            <Button onClick={issue} disabled={busy === "issue"} loading={busy === "issue"}>
              {busy !== "issue" && <Plus className="size-4" />}
              Create key
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground glass-inset rounded-lg p-3 text-sm">
            <Lock className="mr-1.5 inline size-3.5 -translate-y-px" aria-hidden />
            Your super administrator has not given you permission to invite employees yet.
          </p>
        )}

        {rows.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No keys yet"
            description={canIssue ? copy.empty : "Keys you issue will appear here."}
            inset={false}
          />
        ) : (
          <ul className="divide-border/60 divide-y">
            {rows.map((invite) => {
              const state = keyState(invite);
              const usable = !invite.revokedAt && !invite.redeemedAt;

              return (
                <li key={invite.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="mr-auto min-w-0">
                    <p className="font-mono text-sm font-medium break-all">{invite.key}</p>
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
    </Card>
  );
}
