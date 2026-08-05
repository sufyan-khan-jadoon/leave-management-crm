"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Plus, ShieldX, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { ADMIN_INVITE_TTL_DAYS } from "@/lib/constants";
import { formatDateTime } from "@/lib/date";

type InviteKey = {
  id: string;
  key: string;
  label: string | null;
  expiresAt: string;
  revokedAt: string | null;
  redeemedAt: string | null;
  createdAt: string;
  redeemedBy: { id: string; name: string; email: string; status: string } | null;
};

type PendingAdmin = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

function keyState(invite: InviteKey): { label: string; tone: string } {
  if (invite.revokedAt) return { label: "Revoked", tone: "text-muted-foreground" };
  if (invite.redeemedAt) return { label: "Used", tone: "text-success" };
  if (new Date(invite.expiresAt) <= new Date()) return { label: "Expired", tone: "text-destructive" };
  return { label: "Unused", tone: "text-primary" };
}

export function AccessPanel() {
  const [invites, setInvites] = useState<InviteKey[]>([]);
  const [pending, setPending] = useState<PendingAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [keys, requests] = await Promise.all([
        apiClient.get<{ items: InviteKey[] }>("/api/admin/invites"),
        apiClient.get<{ items: PendingAdmin[] }>("/api/admin/requests"),
      ]);

      setInvites(keys.items);
      setPending(requests.items);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't load the access panel.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function issue() {
    setBusy("issue");

    try {
      await apiClient.post("/api/admin/invites", { label: label.trim() || undefined });
      setLabel("");
      toast.success("Invite key created.");
      await load();
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
      await load();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't revoke that key.");
    } finally {
      setBusy(null);
    }
  }

  async function decide(id: string, approve: boolean) {
    setBusy(id);

    try {
      await apiClient.patch(`/api/admin/requests/${id}`, { approve });
      toast.success(approve ? "Administrator approved." : "Request declined.");
      await load();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't record that decision.");
    } finally {
      setBusy(null);
    }
  }

  async function copy(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Couldn't copy — select the key and copy it manually.");
    }
  }

  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-12 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Loading access panel…
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending administrator requests</CardTitle>
          <CardDescription>
            People who registered with an invite key and verified their email. They cannot sign in until
            approved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <EmptyState
              icon={ShieldX}
              title="No requests waiting"
              description="Approved and declined requests disappear from here."
              inset={false}
            />
          ) : (
            <ul className="divide-border/60 divide-y">
              {pending.map((person) => (
                <li key={person.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="mr-auto min-w-0">
                    <p className="truncate font-medium">{person.name}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {person.email} · requested {formatDateTime(person.createdAt)}
                    </p>
                  </div>

                  <Button size="sm" onClick={() => decide(person.id, true)} disabled={busy === person.id}>
                    <Check className="size-4" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => decide(person.id, false)}
                    disabled={busy === person.id}
                  >
                    <X className="size-4" />
                    Decline
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite keys</CardTitle>
          <CardDescription>
            Each key admits one administrator and expires after {ADMIN_INVITE_TTL_DAYS} days. Share it with
            the person you want to invite.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Who is this for? (optional)"
              maxLength={80}
              className="max-w-xs"
              aria-label="Note for this invite key"
            />
            <Button onClick={issue} disabled={busy === "issue"} loading={busy === "issue"}>
              {busy !== "issue" && <Plus className="size-4" />}
              Create key
            </Button>
          </div>

          {invites.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="No keys yet"
              description="Create one to invite your first administrator."
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
                      <p className="font-mono text-sm font-medium break-all">{invite.key}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        <span className={state.tone}>{state.label}</span>
                        {invite.label ? ` · ${invite.label}` : ""}
                        {invite.redeemedBy ? ` · used by ${invite.redeemedBy.email}` : ""}
                        {usable ? ` · expires ${formatDateTime(invite.expiresAt)}` : ""}
                      </p>
                    </div>

                    <Button variant="outline" size="sm" onClick={() => copy(invite.key)}>
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
    </div>
  );
}
