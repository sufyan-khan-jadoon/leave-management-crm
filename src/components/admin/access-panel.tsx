"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, ShieldX, X } from "lucide-react";
import { toast } from "sonner";

import { InviteKeySection, type InviteKey } from "@/components/admin/invite-key-section";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/date";
import { ROLE } from "@/lib/enums";

type PendingAdmin = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

/**
 * The super admin's onboarding screen: decide pending administrator requests,
 * and issue keys for either role.
 *
 * Employee keys come first because they are the everyday task — administrator
 * onboarding is rare by comparison.
 */
export function AccessPanel() {
  const [invites, setInvites] = useState<InviteKey[]>([]);
  const [pending, setPending] = useState<PendingAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

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
            People who registered with an administrator key and verified their email. They cannot sign in
            until approved.
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

      <InviteKeySection role={ROLE.EMPLOYEE} invites={invites} onChanged={load} />
      <InviteKeySection role={ROLE.ADMIN} invites={invites} onChanged={load} />
    </div>
  );
}
