"use client";

import Link from "next/link";
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  Sparkles,
  TrendingUp,
  XCircle,
} from "lucide-react";

import { LeaveTrendChart } from "@/components/charts/leave-trend-chart";
import { LeaveChat } from "@/components/leaves/leave-chat";
import { ProfileRequiredNotice } from "@/components/leaves/profile-required-notice";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { LeaveStatusBadge } from "@/components/shared/leave-status-badge";
import { StatCard, StatCardSkeleton } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiResource } from "@/hooks/use-api-resource";
import { ROUTES } from "@/lib/constants";
import { formatDate, relativeTime } from "@/lib/date";
import type { EmployeeDashboardData } from "@/types";

export function EmployeeDashboard({
  firstName,
  profileComplete,
}: {
  firstName: string;
  profileComplete: boolean;
}) {
  const { data, loading, error } = useApiResource<EmployeeDashboardData>("/api/dashboard");

  if (loading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <EmptyState
        icon={XCircle}
        title="Couldn't load your dashboard"
        description={error ?? "Please refresh the page to try again."}
      />
    );
  }

  const { balance, counts, trend, recentLeaves } = data;
  const usedPercent = (balance.approvedThisMonth / balance.allowance) * 100;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Here's where your leave stands this month."
        actions={
          <Button asChild>
            <Link href={ROUTES.newLeave}>
              <Sparkles className="size-4" />
              Request leave
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4">
        <Card glass className="overflow-hidden">
          <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-sm font-medium">Leaves remaining this month</p>
              <p className="text-5xl font-semibold tracking-tight tabular-nums">
                {balance.remaining}
                <span className="text-muted-foreground text-2xl font-normal"> / {balance.allowance}</span>
              </p>
              <p className="text-muted-foreground text-sm">
                {balance.remaining > 0
                  ? `${balance.approvedThisMonth} approved so far. Requests beyond your allowance are declined automatically.`
                  : "You've used your full allowance. Further requests need HR approval."}
              </p>
            </div>

            <div className="w-full max-w-xs space-y-2">
              <Progress
                value={usedPercent}
                indicatorClassName={balance.remaining === 0 ? "bg-destructive" : "bg-primary"}
              />
              <p className="text-muted-foreground text-xs">
                {balance.approvedThisMonth} of {balance.allowance} used
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Used this month"
            value={balance.approvedThisMonth}
            icon={CalendarClock}
            tone="primary"
            hint="Approved leave days"
          />
          <StatCard
            label="Approved"
            value={counts.APPROVED}
            icon={CheckCircle2}
            tone="success"
            hint="All time"
          />
          <StatCard label="Pending" value={counts.PENDING} icon={Clock} tone="warning" hint="Awaiting review" />
          <StatCard
            label="Rejected"
            value={counts.REJECTED}
            icon={XCircle}
            tone="destructive"
            hint="All time"
          />
        </div>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="text-primary-ink size-4" aria-hidden />
              Request leave
            </CardTitle>
            <CardDescription>
              Describe the time off you need — the assistant confirms the details with you before booking.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {profileComplete ? <LeaveChat bare /> : <ProfileRequiredNotice inset={false} />}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="text-primary-ink size-4" aria-hidden />
                Your leave over time
              </CardTitle>
              <CardDescription>Requests across the last six months.</CardDescription>
            </CardHeader>
            <CardContent>
              {trend.some((point) => point.total > 0) ? (
                <LeaveTrendChart data={trend} />
              ) : (
                <EmptyState
                  icon={CalendarDays}
                  title="No history yet"
                  description="Once you submit your first request it will show up here."
                  inset={false}
                />
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Recent requests</CardTitle>
              <CardDescription>Your five most recent leave dates.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {recentLeaves.length === 0 ? (
                <EmptyState
                  icon={Sparkles}
                  title="Nothing here yet"
                  description="Describe the leave you need in plain English and we'll handle the rest."
                  inset={false}
                  className="mx-6"
                  action={
                    <Button size="sm" asChild>
                      <Link href={ROUTES.newLeave}>Request leave</Link>
                    </Button>
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentLeaves.map((leave) => (
                      <TableRow key={leave.id}>
                        <TableCell className="whitespace-nowrap">
                          <span className="block font-medium">{formatDate(leave.leaveDate)}</span>
                          <span className="text-muted-foreground text-xs">
                            {relativeTime(leave.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-40 truncate">{leave.reason}</TableCell>
                        <TableCell>
                          <LeaveStatusBadge status={leave.status} />
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

function DashboardSkeleton() {
  return (
    <>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4">
        <Skeleton className="h-36 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <StatCardSkeleton key={index} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <Skeleton className="h-80 rounded-xl lg:col-span-3" />
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        </div>
      </div>
    </>
  );
}
