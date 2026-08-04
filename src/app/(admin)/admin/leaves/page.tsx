import type { Metadata } from "next";

import { AdminLeaveManager } from "@/components/admin/admin-leave-manager";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Leave requests" };

export default function AdminLeavesPage() {
  return (
    <>
      <PageHeader
        title="Leave requests"
        description="Search, filter and override any leave decision across the organisation."
      />
      <AdminLeaveManager />
    </>
  );
}
