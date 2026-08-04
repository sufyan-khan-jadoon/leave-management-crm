import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarCheck } from "lucide-react";

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
      <header className="flex items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2 font-semibold">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
            <CalendarCheck className="size-4" aria-hidden />
          </span>
          {appConfig.name}
        </span>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-8">
        <Card glass className="w-full max-w-2xl shadow-xl">
          <CardHeader className="space-y-1.5">
            <CardTitle className="text-2xl">One last step, {employee.name.split(" ")[0]}</CardTitle>
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
