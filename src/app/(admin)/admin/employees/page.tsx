import type { Metadata } from "next";

import { EmployeeInviteKeys } from "@/components/admin/employee-invite-keys";
import { EmployeeManager } from "@/components/admin/employee-manager";
import { PeopleManager } from "@/components/admin/people-manager";
import { PageHeader } from "@/components/layout/page-header";
import { auth } from "@/lib/auth/auth";
import { ROLE, isSuperAdminRole } from "@/lib/enums";

export const metadata: Metadata = { title: "People" };

export default async function AdminEmployeesPage() {
  const session = await auth();

  // The layout has already established that this is an administrator. Only the
  // super admin additionally gets the administrator roster — the API refuses
  // that population to anyone else regardless of what is rendered here.
  const isSuperAdmin = isSuperAdminRole(session?.user?.role ?? "");

  return (
    <>
      <PageHeader
        title={isSuperAdmin ? "People" : "Employees"}
        description={
          isSuperAdmin
            ? "Invite new people, and manage employees and administrators."
            : "Invite new people, then search, edit, suspend or remove them."
        }
      />
      <div className="space-y-4">
        <EmployeeInviteKeys />
        {isSuperAdmin ? <PeopleManager /> : <EmployeeManager role={ROLE.EMPLOYEE} />}
      </div>
    </>
  );
}
