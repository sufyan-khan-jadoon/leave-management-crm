import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, BriefcaseBusiness, CalendarDays, Mail } from "lucide-react";

import { EmployeeReport } from "@/components/admin/employee-report";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { auth } from "@/lib/auth/auth";
import { ROUTES } from "@/lib/constants";
import { formatDate } from "@/lib/date";
import { EMPLOYEE_STATUS } from "@/lib/enums";
import { NotFoundError } from "@/lib/errors";
import { roleLabel } from "@/lib/report-labels";
import { initialsOf } from "@/lib/utils";
import { employeeService } from "@/services/employee.service";

export const metadata: Metadata = { title: "Employee report" };

/**
 * One person's attendance, absence and leave report.
 *
 * **Gated by `byIdForActor`, exactly as the profile above it is**, and for the
 * reason that page's own comment records: a server-rendered page is as reachable
 * as an endpoint, and the id is sitting in the address bar. So
 * `/admin/staff/<an-admin-id>/report` typed by an administrator without
 * `canViewAdminRecords` is a 404 here, the profile is a 404, and
 * `/api/admin/reports/employees/<that-id>` refuses in the service. Three
 * surfaces, one rule, applied by one function.
 *
 * This resolve is **not** the permission — it renders the header, and the
 * endpoint the screen below calls asks again on every request. It is also what
 * makes the header instant: the person is already known server-side, so the
 * screen never opens on a blank name waiting for a fetch.
 *
 * Deliberately **not** behind `assertMayReport`, which the workforce reports
 * screen uses. That grant exists to withhold which of your colleagues are
 * administrators; this screen is about one person whose profile the viewer has
 * already opened, and requiring it would take a report on an ordinary employee
 * away from the ordinary administrators who manage them.
 */
export default async function AdminEmployeeReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const viewer = session?.user;

  if (!viewer) notFound();

  const employee = await employeeService.byIdForActor(id, viewer).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  const suspended = employee.status === EMPLOYEE_STATUS.SUSPENDED;

  return (
    <>
      <PageHeader
        title={`${employee.name} — report`}
        description="Attendance, absence and leave over any period. Every figure is judged by the same rules the attendance screen uses: office closures and weekly days off count as neither present nor absent, and remote days are exempt from attendance altogether."
        actions={
          <Button variant="outline" asChild>
            <Link href={`${ROUTES.adminStaff}/${employee.id}`}>
              <ArrowLeft className="size-4" />
              Back to profile
            </Link>
          </Button>
        }
      />

      {/*
        The header the report is about, rendered on the server from the account
        the gate already resolved. §3's identity block: face, name, id, address,
        department, designation and standing.
      */}
      <Card className="mb-4 py-0">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
          <Avatar className="ring-border size-14 shrink-0 ring-2">
            {employee.profilePhoto && <AvatarImage src={employee.profilePhoto} alt="" />}
            <AvatarFallback className="text-lg">{initialsOf(employee.name)}</AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold">{employee.name}</p>
              <Badge variant="outline">{roleLabel(employee.role)}</Badge>
              <Badge variant={suspended ? "destructive" : "success"}>
                {suspended ? "Suspended" : "Active"}
              </Badge>
            </div>

            <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Fact icon={Mail}>{employee.email}</Fact>
              <Fact icon={Building2}>{employee.department ?? "No department"}</Fact>
              <Fact icon={BriefcaseBusiness}>{employee.position ?? "No job title"}</Fact>
              {employee.joiningDate && (
                <Fact icon={CalendarDays}>Joined {formatDate(employee.joiningDate)}</Fact>
              )}
            </div>

            {/* The id, because §3 asks for it and it is what an export prints. */}
            <p className="text-muted-foreground font-mono text-xs break-all">{employee.id}</p>
          </div>
        </CardContent>
      </Card>

      <EmployeeReport employeeId={employee.id} />
    </>
  );
}

function Fact({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}
