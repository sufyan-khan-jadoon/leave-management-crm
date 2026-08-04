import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarDays, Mail, Phone, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ProfileForm } from "@/components/profile/profile-form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { initialsOf } from "@/components/layout/user-menu";
import { auth } from "@/lib/auth/auth";
import { ROUTES } from "@/lib/constants";
import { formatDate } from "@/lib/date";
import { serializeEmployee } from "@/lib/serialize";
import { employeeService } from "@/services/employee.service";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect(ROUTES.login);

  const employee = serializeEmployee(await employeeService.byId(session.user.id));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="My profile" description="Keep your details current so leave routes correctly." />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center gap-4 text-center">
            <Avatar className="ring-border size-24 ring-2">
              {employee.profilePhoto && <AvatarImage src={employee.profilePhoto} alt="" />}
              <AvatarFallback className="text-2xl">{initialsOf(employee.name)}</AvatarFallback>
            </Avatar>

            <div className="space-y-1">
              <p className="text-lg font-semibold">{employee.name}</p>
              <p className="text-muted-foreground text-sm">{employee.position ?? "Position not set"}</p>
              {employee.department && <Badge variant="secondary">{employee.department}</Badge>}
            </div>

            <Separator />

            <dl className="w-full space-y-3 text-left text-sm">
              <DetailRow icon={Mail} label="Email" value={employee.email} />
              <DetailRow icon={Phone} label="Phone" value={employee.phone ?? "Not set"} />
              <DetailRow
                icon={CalendarDays}
                label="Joined"
                value={employee.joiningDate ? formatDate(employee.joiningDate) : "Not set"}
              />
              <DetailRow
                icon={ShieldCheck}
                label="Email status"
                value={employee.emailVerified ? "Verified" : "Unverified"}
              />
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Edit details</CardTitle>
            <CardDescription>
              Changes take effect immediately and you&apos;ll receive a confirmation email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm employee={employee} mode="edit" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <dt className="text-muted-foreground text-xs">{label}</dt>
        <dd className="truncate font-medium">{value}</dd>
      </div>
    </div>
  );
}
