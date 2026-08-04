import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  Mail,
  Phone,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { initialsOf } from "@/components/layout/user-menu";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { LeaveStatusBadge } from "@/components/shared/leave-status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MONTHLY_LEAVE_ALLOWANCE, ROUTES } from "@/lib/constants";
import { formatDate, relativeTime } from "@/lib/date";
import { EMPLOYEE_STATUS } from "@/lib/enums";
import { NotFoundError } from "@/lib/errors";
import { employeeService } from "@/services/employee.service";
import { leaveService } from "@/services/leave.service";

export const metadata: Metadata = { title: "Employee profile" };

export default async function AdminEmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const employee = await employeeService.byId(id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  const [balance, counts, leaves] = await Promise.all([
    leaveService.balanceFor(employee.id),
    leaveService.lifetimeCounts(employee.id),
    leaveService.list({
      employeeId: employee.id,
      page: 1,
      pageSize: 20,
      sortBy: "leaveDate",
      sortDir: "desc",
    }),
  ]);

  const suspended = employee.status === EMPLOYEE_STATUS.SUSPENDED;

  return (
    <>
      <PageHeader
        title={employee.name}
        description={`${employee.position ?? "No position"} · ${employee.department ?? "No department"}`}
        actions={
          <Button variant="outline" asChild>
            <Link href={ROUTES.adminEmployees}>
              <ArrowLeft className="size-4" />
              Back to employees
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center gap-4 text-center">
            <Avatar className="ring-border size-24 ring-2">
              {employee.profilePhoto && <AvatarImage src={employee.profilePhoto} alt="" />}
              <AvatarFallback className="text-2xl">{initialsOf(employee.name)}</AvatarFallback>
            </Avatar>

            <div className="space-y-2">
              <p className="text-lg font-semibold">{employee.name}</p>
              <Badge variant={suspended ? "destructive" : "success"}>
                {suspended ? "Suspended" : "Active"}
              </Badge>
            </div>

            <Separator />

            <dl className="w-full space-y-3 text-left text-sm">
              <DetailRow icon={Mail} label="Email" value={employee.email} />
              <DetailRow icon={Phone} label="Phone" value={employee.phone ?? "Not set"} />
              <DetailRow icon={Building2} label="Department" value={employee.department ?? "Not set"} />
              <DetailRow
                icon={CalendarDays}
                label="Joining date"
                value={employee.joiningDate ? formatDate(employee.joiningDate) : "Not set"}
              />
              <DetailRow
                icon={ShieldCheck}
                label="Email verified"
                value={employee.emailVerified ? formatDate(employee.emailVerified) : "Not verified"}
              />
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Remaining"
              value={`${balance.remaining}/${MONTHLY_LEAVE_ALLOWANCE}`}
              icon={CalendarDays}
              tone="primary"
              hint="This month"
            />
            <StatCard label="Approved" value={counts.APPROVED} icon={CheckCircle2} tone="success" hint="All time" />
            <StatCard label="Pending" value={counts.PENDING} icon={Clock} tone="warning" hint="Awaiting review" />
            <StatCard label="Rejected" value={counts.REJECTED} icon={XCircle} tone="destructive" hint="All time" />
          </div>

          <Card className="py-0">
            <CardHeader className="pt-6">
              <CardTitle className="text-base">Leave history</CardTitle>
              <CardDescription>The 20 most recent requests for this employee.</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-6">
              {leaves.items.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title="No leave requests"
                  description="This employee hasn't submitted any leave yet."
                  className="mx-6 border-0"
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Leave date</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="pr-6">Requested</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaves.items.map((leave) => (
                      <TableRow key={leave.id}>
                        <TableCell className="pl-6 font-medium whitespace-nowrap">
                          {formatDate(leave.leaveDate)}
                        </TableCell>
                        <TableCell className="max-w-64">
                          <span className="line-clamp-2">{leave.reason}</span>
                        </TableCell>
                        <TableCell>
                          <LeaveStatusBadge status={leave.status} />
                        </TableCell>
                        <TableCell className="text-muted-foreground pr-6 text-sm whitespace-nowrap">
                          {relativeTime(leave.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
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
