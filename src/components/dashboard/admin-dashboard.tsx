"use client";

import Link from "next/link";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  TrendingUp,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";

import { DepartmentChart } from "@/components/charts/department-chart";
import { LeaveTrendChart } from "@/components/charts/leave-trend-chart";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { LeaveStatusBadge } from "@/components/shared/leave-status-badge";
import { StatCard, StatCardSkeleton } from "@/components/shared/stat-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiResource } from "@/hooks/use-api-resource";
import { ROUTES } from "@/lib/constants";
import { initialsOf } from "@/lib/utils";
import { formatDate, relativeTime } from "@/lib/date";
import type { AdminDashboardView } from "@/types";

export function AdminDashboard({ firstName }: { firstName: string }) {
  const { data, loading, error } = useApiResource<AdminDashboardView>("/api/admin/stats");

  if (loading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <EmptyState
        icon={XCircle}
        title="Couldn't load the dashboard"
        description={error ?? "Please refresh the page to try again."}
      />
    );
  }

  const { overview, monthlyTrend, departmentBreakdown, recentActivity } = data;

  return (
    <>
      <PageHeader
        title={`Good to see you, ${firstName}`}
        description="Organisation-wide leave activity at a glance."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={ROUTES.adminEmployees}>
                <Users className="size-4" />
                Employees
              </Link>
            </Button>
            <Button asChild>
              <Link href={ROUTES.adminLeaves}>
                <CalendarDays className="size-4" />
                Leave requests
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Total employees"
            value={overview.totalEmployees}
            icon={Users}
            tone="primary"
            hint={`${overview.suspendedEmployees} suspended`}
          />
          <StatCard
            label="Active employees"
            value={overview.activeEmployees}
            icon={UserCheck}
            tone="success"
            hint="Able to sign in"
          />
          <StatCard
            label="Approved leaves"
            value={overview.approvedLeaves}
            icon={CheckCircle2}
            tone="success"
            hint="All time"
          />
          <StatCard
            label="Pending leaves"
            value={overview.pendingLeaves}
            icon={Clock}
            tone="warning"
            hint="Awaiting a decision"
          />
          <StatCard
            label="Rejected leaves"
            value={overview.rejectedLeaves}
            icon={XCircle}
            tone="destructive"
            hint="All time"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="text-primary size-4" aria-hidden />
                Monthly leave requests
              </CardTitle>
              <CardDescription>Volume and outcomes across the last six months.</CardDescription>
            </CardHeader>
            <CardContent>
              {monthlyTrend.some((point) => point.total > 0) ? (
                <LeaveTrendChart data={monthlyTrend} />
              ) : (
                <EmptyState
                  icon={CalendarDays}
                  title="No requests yet"
                  description="Leave activity will chart here once employees start submitting."
                  inset={false}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="text-primary size-4" aria-hidden />
                Department-wise leaves
              </CardTitle>
              <CardDescription>Where leave is concentrating across the organisation.</CardDescription>
            </CardHeader>
            <CardContent>
              {departmentBreakdown.length > 0 ? (
                <DepartmentChart data={departmentBreakdown} />
              ) : (
                <EmptyState
                  icon={Building2}
                  title="No department data"
                  description="Once employees complete their profiles, this breakdown will populate."
                  inset={false}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>The latest leave requests across every department.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="Nothing to show yet"
                description="New leave requests will appear here as they come in."
                inset={false}
              />
            ) : (
              <ul className="divide-border/60 divide-y">
                {recentActivity.map((leave) => (
                  <li
                    key={leave.id}
                    className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition-colors duration-150 ease-standard first:pt-0 last:pb-0 hover:bg-accent/40"
                  >
                    <Avatar className="size-9">
                      {leave.employee.profilePhoto && <AvatarImage src={leave.employee.profilePhoto} alt="" />}
                      <AvatarFallback>{initialsOf(leave.employee.name)}</AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span className="font-medium">{leave.employee.name}</span>{" "}
                        <span className="text-muted-foreground">requested leave for</span>{" "}
                        <span className="font-medium">{formatDate(leave.leaveDate)}</span>
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {leave.reason} · {relativeTime(leave.createdAt)}
                      </p>
                    </div>

                    <LeaveStatusBadge status={leave.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <StatCardSkeleton key={index} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </>
  );
}
