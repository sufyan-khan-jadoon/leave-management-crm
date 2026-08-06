import type { Metadata } from "next";

import { EmployeeInviteKeys } from "@/components/admin/employee-invite-keys";
import { EmployeeManager } from "@/components/admin/employee-manager";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Employees" };

export default function AdminEmployeesPage() {
  return (
    <>
      <PageHeader
        title="Employees"
        description="Invite new people, then search, edit, suspend or remove them."
      />
      <div className="space-y-4">
        <EmployeeInviteKeys />
        <EmployeeManager />
      </div>
    </>
  );
}
