import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { auth } from "@/lib/auth/auth";
import { chromeUser } from "@/lib/auth/chrome-user";
import { ROUTES } from "@/lib/constants";
import { isAdminRole, isSuperAdminRole } from "@/lib/enums";
import { appConfig } from "@/lib/env";
import { complaintService } from "@/services/complaint.service";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) redirect(ROUTES.adminLogin);
  if (!isAdminRole(session.user.role)) redirect(ROUTES.dashboard);

  const user = await chromeUser(session.user.id, "Administrator");
  if (!user) redirect(ROUTES.adminLogin);

  // Read from the database on every render, exactly as `chromeUser` is and for
  // the same reason: the session is a snapshot, and a grant withdrawn an hour
  // ago must not leave the item in the sidebar until the token expires.
  const canManageComplaints = await complaintService.mayManage({
    id: session.user.id,
    role: session.user.role,
  });

  return (
    <AppShell
      isAdmin
      isSuperAdmin={isSuperAdminRole(session.user.role)}
      canManageComplaints={canManageComplaints}
      appName={appConfig.name}
      user={user}
    >
      {children}
    </AppShell>
  );
}
