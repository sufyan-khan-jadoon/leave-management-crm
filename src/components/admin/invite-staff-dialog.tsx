"use client";

import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";

import { InvitationSection, type Invitation } from "@/components/admin/invitation-section";
import type { JobRole } from "@/components/admin/job-role-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApiResource } from "@/hooks/use-api-resource";
import { INVITE_TTL_DAYS } from "@/lib/constants";
import { ROLE, type InviteRole } from "@/lib/enums";

type InvitationsResponse = { items: Invitation[]; canIssue: { employee: boolean; admin: boolean } };
type JobRolesResponse = { items: JobRole[] };

/**
 * The one way into onboarding: a button on Staff, and the invitation form
 * behind it.
 *
 * Inviting used to be a panel sitting open on two screens — Access for the super
 * admin, Employees for everybody else. It is one act performed occasionally, not
 * something to read, so it belongs behind a button on the screen that lists the
 * people it produces. Nothing about the invitation itself moved: the same form
 * posts to the same endpoint, the same list resends and withdraws, and the same
 * service decides all of it.
 *
 * **`canIssue` is the server's answer, and it is the only thing consulted here.**
 * The session is never asked what role the viewer holds, so the button cannot
 * appear for somebody the grant was withdrawn from — `permissionsFor` reads it
 * from the database on every request, and this reflects that read rather than
 * guessing alongside it. A viewer who may invite nobody gets no button at all.
 */
export function InviteStaffDialog() {
  const [open, setOpen] = useState(false);

  const invitations = useApiResource<InvitationsResponse>("/api/admin/invitations");
  const jobRoles = useApiResource<JobRolesResponse>("/api/admin/job-roles");

  const canIssue = invitations.data?.canIssue;

  // Built from the two flags rather than from the role, so the picker offers
  // exactly what the server would accept: both for a super admin, employees
  // alone for a granted admin, and nothing for anyone else.
  const roles: InviteRole[] = [
    ...(canIssue?.employee ? [ROLE.EMPLOYEE] : []),
    ...(canIssue?.admin ? [ROLE.ADMIN] : []),
  ];

  // Nothing at all until the answer is in: a button that appears and then
  // vanishes reads as a glitch, and one that appears for the wrong person is
  // worse than one that appears a moment late.
  if (roles.length === 0) return null;

  // Removing a job title changes what everybody else can pick, so it stays with
  // the super admin — who is exactly the viewer allowed to invite at both roles.
  const canManageJobRoles = Boolean(canIssue?.admin);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="size-4" />
        Invite staff
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {/* "Invite staff" on the button matches the screen it sits on;
                  written out here because "invite a staff" is not English. */}
              <UserPlus className="text-primary-ink size-4" aria-hidden />
              Invite a staff member
            </DialogTitle>
            <DialogDescription>
              Enter someone&apos;s email address and pick what they should become. We&apos;ll send them a
              link to register, and they join with that role automatically. Each invitation works once, for
              that address only, and expires after {INVITE_TTL_DAYS} days.
            </DialogDescription>
          </DialogHeader>

          {jobRoles.loading && !jobRoles.data ? (
            <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <InvitationSection
              roles={roles}
              invitations={invitations.data?.items ?? []}
              jobRoles={jobRoles.data?.items ?? []}
              canManageJobRoles={canManageJobRoles}
              // The dialog deliberately stays open on success. The invitation
              // appears in the list underneath a moment later, which is the only
              // confirmation that the link exists and where it can be resent
              // from — closing on send would hide the thing just created.
              onChanged={async () => {
                await Promise.all([invitations.refresh(), jobRoles.refresh()]);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
