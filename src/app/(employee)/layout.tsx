import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { auth } from "@/lib/auth/auth";
import { chromeUser } from "@/lib/auth/chrome-user";
import { ROUTES } from "@/lib/constants";
import { isAdminRole, isSuperAdminRole } from "@/lib/enums";
import { appConfig } from "@/lib/env";

/**
 * Wraps the personal screens: leave balance, requesting leave, history, profile.
 *
 * Administrators are deliberately *not* turned away here. They accrue the same
 * monthly allowance as everyone else, so they need these screens for their own
 * leave. What changes is the chrome — the shell keeps their administrator
 * navigation, so moving between their own leave and the queue they manage does
 * not feel like signing into a second application.
 */
export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  // Middleware already gates these routes; this is defence in depth for the
  // case where a page is reached through a path the matcher does not cover.
  if (!session?.user) redirect(ROUTES.login);

  const isAdmin = isAdminRole(session.user.role);

  const user = await chromeUser(session.user.id, isAdmin ? "Administrator" : "Employee");
  if (!user) redirect(ROUTES.login);

  return (
    <AppShell
      isAdmin={isAdmin}
      isSuperAdmin={isSuperAdminRole(session.user.role)}
      appName={appConfig.name}
      user={user}
    >
      {children}
    </AppShell>
  );
}
