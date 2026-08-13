import type { Metadata } from "next";

import { EmployeeManager } from "@/components/admin/employee-manager";
import { InviteStaffDialog } from "@/components/admin/invite-staff-dialog";
import { StaffManager } from "@/components/admin/staff-manager";
import { PageHeader } from "@/components/layout/page-header";
import { auth } from "@/lib/auth/auth";
import { ROLE, isSuperAdminRole } from "@/lib/enums";
import { populationService } from "@/services/population.service";

export const metadata: Metadata = { title: "Staff" };

export default async function AdminStaffPage() {
  const session = await auth();
  const user = session?.user;

  // Two questions with two answers, and holding them apart is the whole of how
  // this screen behaves for an ordinary administrator. `canViewAdminRecords`
  // decides whether the Administrators tab exists; being the super admin decides
  // whether its rows can be acted on. The grant is read from the row rather than
  // the session, so withdrawing it takes the tab away on the next load — and
  // both endpoints refuse regardless of what is rendered here.
  const isSuperAdmin = isSuperAdminRole(user?.role ?? "");
  const canSeeAdmins =
    isSuperAdmin ||
    (user ? await populationService.mayViewAdminRecords({ id: user.id, role: user.role }) : false);

  return (
    <>
      <PageHeader
        title="Staff"
        description={
          isSuperAdmin
            ? "Invite new people, then search, edit, suspend or remove employees and administrators."
            : canSeeAdmins
              ? "Invite new people, then search, edit, suspend or remove employees. Administrators are listed for reference — only the super administrator can change those accounts."
              : "Invite new people, then search, edit, suspend or remove them."
        }
        // The only route into onboarding, for every administrator who has one.
        // It shows itself or not according to what the server says the viewer may
        // grant, so this page never has to work out who is allowed to invite.
        actions={<InviteStaffDialog />}
      />
      <div className="space-y-4">
        {canSeeAdmins ? (
          <StaffManager canManageAdmins={isSuperAdmin} />
        ) : (
          <EmployeeManager role={ROLE.EMPLOYEE} />
        )}
      </div>
    </>
  );
}
