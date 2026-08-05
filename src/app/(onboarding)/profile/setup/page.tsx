import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/layout/brand-mark";
import { ProfileForm } from "@/components/profile/profile-form";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth/auth";
import { ROUTES } from "@/lib/constants";
import { isAdminRole } from "@/lib/enums";
import { appConfig } from "@/lib/env";
import { employeeService } from "@/services/employee.service";
import { serializeEmployee } from "@/lib/serialize";

export const metadata: Metadata = { title: "Complete your profile" };

export default async function ProfileSetupPage() {
  const session = await auth();

  if (!session?.user) redirect(ROUTES.login);
  if (isAdminRole(session.user.role)) redirect(ROUTES.adminDashboard);

  const employee = await employeeService.byId(session.user.id);

  return (
    <div className="app-aurora flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-4 sm:px-7 sm:py-5">
        <span className="flex items-center gap-2.5 font-semibold tracking-[-0.015em]">
          <BrandMark />
          {appConfig.name}
        </span>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-8">
        <Card glass className="animate-in fade-in-0 slide-in-from-bottom-2 w-full max-w-2xl duration-500 ease-standard">
          <CardHeader className="space-y-1.5">
            <CardTitle className="text-2xl tracking-[-0.024em]">
              One last step, {employee.name.split(" ")[0]}
            </CardTitle>
            <CardDescription>
              Tell us where you work so your leave requests reach the right people. Your administrator can
              update these later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm employee={serializeEmployee(employee)} mode="setup" />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
