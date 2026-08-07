"use client";

import { useState } from "react";
import { Briefcase, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiClientError, apiClient } from "@/lib/api-client";

export type JobRole = { id: string; name: string; invitationCount: number };

/**
 * Curates the shared list of job titles.
 *
 * Reachable from the invitation form, because that is where you discover the
 * title you need is missing — sending someone off to a settings screen mid-task
 * is how a list like this ends up unused.
 */
export function JobRoleDialog({
  open,
  onOpenChange,
  roles,
  canDelete,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: JobRole[];
  /** Removing changes what everyone can pick, so it stays with the super admin. */
  canDelete: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;

    setBusy("add");

    try {
      await apiClient.post("/api/admin/job-roles", { name: name.trim() });
      setName("");
      toast.success("Job role added.");
      await onChanged();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't add that role.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(role: JobRole) {
    setBusy(role.id);

    try {
      await apiClient.delete(`/api/admin/job-roles/${role.id}`);
      toast.success(`"${role.name}" removed from the list.`);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't remove that role.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="text-primary-ink size-4" aria-hidden />
            Job roles
          </DialogTitle>
          <DialogDescription>
            Titles you can assign when inviting someone. Removing one leaves everyone who already holds it
            unchanged.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={add} className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Software Engineer"
            maxLength={60}
            aria-label="New job role"
          />
          <Button type="submit" disabled={!name.trim() || busy === "add"} loading={busy === "add"}>
            {busy !== "add" && <Plus className="size-4" />}
            Add
          </Button>
        </form>

        {roles.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">
            No roles yet. Add one above and it becomes selectable on every invitation.
          </p>
        ) : (
          <ul className="scrollbar-thin divide-border/60 max-h-64 divide-y overflow-y-auto">
            {roles.map((role) => (
              <li key={role.id} className="flex items-center gap-3 py-2">
                <div className="mr-auto min-w-0">
                  <p className="truncate text-sm font-medium">{role.name}</p>
                  {role.invitationCount > 0 && (
                    <p className="text-muted-foreground text-xs">
                      on {role.invitationCount} invitation{role.invitationCount === 1 ? "" : "s"}
                    </p>
                  )}
                </div>

                {canDelete && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(role)}
                    disabled={busy === role.id}
                    aria-label={`Remove ${role.name}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
