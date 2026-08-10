import type { Metadata } from "next";

import { EmployeeManager } from "@/components/admin/employee-manager";
import { InviteMemberDialog } from "@/components/admin/invite-member-dialog";
import { MembersManager } from "@/components/admin/members-manager";
import { PageHeader } from "@/components/layout/page-header";
import { auth } from "@/lib/auth/auth";
import { ROLE, isSuperAdminRole } from "@/lib/enums";

export const metadata: Metadata = { title: "Members" };

export default async function AdminEmployeesPage() {
  const session = await auth();

  // The layout has already established that this is an administrator. Only the
  // super admin additionally gets the administrator roster — the API refuses
  // that population to anyone else regardless of what is rendered here.
  const isSuperAdmin = isSuperAdminRole(session?.user?.role ?? "");

  return (
    <>
      <PageHeader
        title={isSuperAdmin ? "Members" : "Employees"}
        description={
          isSuperAdmin
            ? "Invite new people, then search, edit, suspend or remove employees and administrators."
            : "Invite new people, then search, edit, suspend or remove them."
        }
        // The only route into onboarding, for every administrator who has one.
        // It shows itself or not according to what the server says the viewer may
        // grant, so this page never has to work out who is allowed to invite.
        actions={<InviteMemberDialog />}
      />
      <div className="space-y-4">
        {isSuperAdmin ? <MembersManager /> : <EmployeeManager role={ROLE.EMPLOYEE} />}
      </div>
    </>
  );
}
