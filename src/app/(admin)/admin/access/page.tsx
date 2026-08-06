import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AccessPanel } from "@/components/admin/access-panel";
import { PageHeader } from "@/components/layout/page-header";
import { auth } from "@/lib/auth/auth";
import { ROUTES } from "@/lib/constants";
import { isSuperAdminRole } from "@/lib/enums";

export const metadata: Metadata = { title: "Access keys" };

export default async function AdminAccessPage() {
  const session = await auth();

  // The admin layout has already let every administrator through; this narrows
  // it to the super admin, who alone issues keys and decides requests.
  if (!session?.user || !isSuperAdminRole(session.user.role)) {
    redirect(ROUTES.adminDashboard);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Access keys"
        description="Invite employees and administrators, and approve administrator requests."
      />
      <AccessPanel />
    </div>
  );
}
