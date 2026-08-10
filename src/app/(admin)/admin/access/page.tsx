import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AccessPanel } from "@/components/admin/access-panel";
import { AttendancePolicyPanel } from "@/components/admin/attendance-policy-panel";
import { PageHeader } from "@/components/layout/page-header";
import { auth } from "@/lib/auth/auth";
import { ROUTES } from "@/lib/constants";
import { isSuperAdminRole } from "@/lib/enums";

export const metadata: Metadata = { title: "Access" };

export default async function AdminAccessPage() {
  const session = await auth();

  // The admin layout has already let every administrator through; this narrows
  // it to the super admin, who alone decides administrator requests and grants.
  if (!session?.user || !isSuperAdminRole(session.user.role)) {
    redirect(ROUTES.adminDashboard);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Access"
        description="Approve administrator requests, decide what each administrator may do, and set the working day."
      />
      <div className="grid gap-4">
        <AccessPanel />
        <AttendancePolicyPanel />
      </div>
    </div>
  );
}
