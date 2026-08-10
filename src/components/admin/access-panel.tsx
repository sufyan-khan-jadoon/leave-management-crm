"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, ShieldX, X } from "lucide-react";
import { toast } from "sonner";

import { AdminPermissions, type Administrator } from "@/components/admin/admin-permissions";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/date";

type PendingAdmin = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

/**
 * The super admin's access screen: decide pending administrator requests, and
 * grant or withdraw what each administrator may do.
 *
 * Inviting is deliberately **not** here. It moved to Staff, behind the
 * `Invite staff` button on the screen that lists the people it produces — see
 * `InviteStaffDialog`. This screen is about what an existing account may do;
 * that one is about bringing an account into existence.
 */
export function AccessPanel() {
  const [pending, setPending] = useState<PendingAdmin[]>([]);
  const [admins, setAdmins] = useState<Administrator[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [requests, administrators] = await Promise.all([
        apiClient.get<{ items: PendingAdmin[] }>("/api/admin/requests"),
        apiClient.get<{ items: Administrator[] }>("/api/admin/administrators"),
      ]);

      setPending(requests.items);
      setAdmins(administrators.items);
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
            People who accepted an administrator invitation and verified their email. They cannot sign in
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

      <AdminPermissions admins={admins} onChanged={load} />
    </div>
  );
}
