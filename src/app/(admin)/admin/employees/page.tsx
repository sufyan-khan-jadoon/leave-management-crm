import type { Metadata } from "next";

import { EmployeeInvitations } from "@/components/admin/employee-invitations";
import { EmployeeManager } from "@/components/admin/employee-manager";
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
            ? "Search, edit, suspend or remove employees and administrators."
            : "Invite new people, then search, edit, suspend or remove them."
        }
      />
      <div className="space-y-4">
        {/* Only for administrators, whose sole route to inviting anyone this is.
            The super admin already has it on Access, alongside administrator
            invitations — repeating it here would be the same panel twice. */}
        {!isSuperAdmin && <EmployeeInvitations />}

        {isSuperAdmin ? <MembersManager /> : <EmployeeManager role={ROLE.EMPLOYEE} />}
      </div>
    </>
  );
}
