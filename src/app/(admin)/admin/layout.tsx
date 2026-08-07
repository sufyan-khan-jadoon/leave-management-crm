import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { auth } from "@/lib/auth/auth";
import { chromeUser } from "@/lib/auth/chrome-user";
import { ROUTES } from "@/lib/constants";
import { isAdminRole, isSuperAdminRole } from "@/lib/enums";
import { appConfig } from "@/lib/env";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) redirect(ROUTES.adminLogin);
  if (!isAdminRole(session.user.role)) redirect(ROUTES.dashboard);

  const user = await chromeUser(session.user.id, "Administrator");
  if (!user) redirect(ROUTES.adminLogin);

  return (
    <AppShell
      isAdmin
      isSuperAdmin={isSuperAdminRole(session.user.role)}
      appName={appConfig.name}
      user={user}
    >
      {children}
    </AppShell>
  );
}
