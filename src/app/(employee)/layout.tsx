import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { auth } from "@/lib/auth/auth";
import { ROUTES } from "@/lib/constants";
import { isAdminRole } from "@/lib/enums";
import { appConfig } from "@/lib/env";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  // Middleware already gates these routes; this is defence in depth for the
  // case where a page is reached through a path the matcher does not cover.
  if (!session?.user) redirect(ROUTES.login);
  if (isAdminRole(session.user.role)) redirect(ROUTES.adminDashboard);

  return (
    <AppShell
      isAdmin={false}
      appName={appConfig.name}
      user={{
        name: session.user.name ?? "Employee",
        email: session.user.email ?? "",
        image: session.user.image,
      }}
    >
      {children}
    </AppShell>
  );
}
