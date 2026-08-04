import type { Metadata } from "next";

import { EmployeeManager } from "@/components/admin/employee-manager";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Employees" };

export default function AdminEmployeesPage() {
  return (
    <>
      <PageHeader
        title="Employees"
        description="Search, edit, suspend or remove people across the organisation."
      />
      <EmployeeManager />
    </>
  );
}
