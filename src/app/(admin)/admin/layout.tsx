import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { auth } from "@/lib/auth/auth";
import { ROUTES } from "@/lib/constants";
import { ROLE } from "@/lib/enums";
import { appConfig } from "@/lib/env";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) redirect(ROUTES.adminLogin);
  if (session.user.role !== ROLE.ADMIN) redirect(ROUTES.dashboard);

  return (
    <AppShell
      isAdmin
      appName={appConfig.name}
      user={{
        name: session.user.name ?? "Administrator",
        email: session.user.email ?? "",
        image: session.user.image,
      }}
    >
      {children}
    </AppShell>
  );
}
