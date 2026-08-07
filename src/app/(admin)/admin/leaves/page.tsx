import type { Metadata } from "next";

import { AdminLeaveManager } from "@/components/admin/admin-leave-manager";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Leave requests" };

export default function AdminLeavesPage() {
  return (
    <>
      <PageHeader
        title="Leave requests"
        description="Search, filter and export leave across the organisation. Requests are decided automatically against the monthly allowance."
      />
      <AdminLeaveManager />
    </>
  );
}
