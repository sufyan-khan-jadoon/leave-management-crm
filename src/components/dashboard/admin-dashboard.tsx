"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CalendarOff,
  CheckCircle2,
  House,
  MapPin,
  Shield,
  TrendingUp,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";

import { DepartmentChart } from "@/components/charts/department-chart";
import { LeaveTrendChart } from "@/components/charts/leave-trend-chart";
import { UpcomingClosures } from "@/components/dashboard/upcoming-closures";
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
import { ROLE, type InviteRole } from "@/lib/enums";
import { initialsOf } from "@/lib/utils";
import { formatDate, relativeTime } from "@/lib/date";
import type { AdminDashboardView } from "@/types";

/** Everything on the screen changes with this, so the wording follows it too. */
const POPULATION_COPY = {
  [ROLE.EMPLOYEE]: {
    total: "Total employees",
    active: "Active employees",
    description: "Leave activity across your employees.",
    emptyTrend: "Leave activity will chart here once employees start submitting.",
  },
  [ROLE.ADMIN]: {
    total: "Total administrators",
    active: "Active administrators",
    description: "Leave activity across your administrators.",
    emptyTrend: "Leave activity will chart here once administrators start submitting.",
  },
} as const;

export function AdminDashboard({
  firstName,
  canViewAdmins,
}: {
  firstName: string;
  /** Super admin only. The API enforces this too — see the stats route. */
  canViewAdmins: boolean;
}) {
  const [population, setPopulation] = useState<InviteRole>(ROLE.EMPLOYEE);

  // Refetches on switch, because the path changes. Every figure below is
  // measured over this population, not merely relabelled for it.
  const { data, loading, error } = useApiResource<AdminDashboardView>(
    `/api/admin/stats?population=${population}`,
  );

  const copy = POPULATION_COPY[population];

  const populationToggle = canViewAdmins ? (
    <div className="bg-muted/60 inline-flex items-center rounded-lg p-1" role="group" aria-label="Population">
      {[ROLE.EMPLOYEE, ROLE.ADMIN].map((option) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant={population === option ? "default" : "ghost"}
          onClick={() => setPopulation(option)}
          aria-pressed={population === option}
        >
          {option === ROLE.EMPLOYEE ? <Users className="size-4" /> : <Shield className="size-4" />}
          {option === ROLE.EMPLOYEE ? "Employees" : "Admins"}
        </Button>
      ))}
    </div>
  ) : (
    <Button variant="outline" asChild>
      <Link href={ROUTES.adminStaff}>
        <Users className="size-4" />
        Employees
      </Link>
    </Button>
  );

  const header = (
    <PageHeader
      title={`Good to see you, ${firstName}`}
      description={copy.description}
      actions={
        <>
          {populationToggle}
          <Button asChild>
            <Link href={ROUTES.adminLeaves}>
              <CalendarDays className="size-4" />
              Leave requests
            </Link>
          </Button>
        </>
      }
    />
  );

  // The header stays put while the panels reload, so switching population does
  // not tear the toggle off the screen the moment it is clicked.
  if (loading) {
    return (
      <>
        {header}
        <DashboardSkeleton />
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        {header}
        <EmptyState
          icon={XCircle}
          title="Couldn't load the dashboard"
          description={error ?? "Please refresh the page to try again."}
        />
      </>
    );
  }

  const { overview, monthlyTrend, departmentBreakdown, recentActivity, attendanceToday } = data;

  const headcountHint =
    overview.awaitingApproval > 0
      ? `${overview.suspendedStaff} suspended · ${overview.awaitingApproval} awaiting approval`
      : `${overview.suspendedStaff} suspended`;

  return (
    <>
      {header}

      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={copy.total}
            value={overview.totalStaff}
            icon={Users}
            tone="primary"
            hint={headcountHint}
          />
          <StatCard
            label={copy.active}
            value={overview.activeStaff}
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
            label="Rejected leaves"
            value={overview.rejectedLeaves}
            icon={XCircle}
            tone="destructive"
            hint="All time"
          />
        </div>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="text-primary-ink size-4" aria-hidden />
                In the office today
              </CardTitle>
              <CardDescription>
                {attendanceToday.officeClosed
                  ? "The office is closed today, so nobody is expected in."
                  : `${attendanceToday.present} of ${attendanceToday.expected} checked in from the office.`}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={ROUTES.adminAttendance}>
                View roster
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {/*
              Four tiles rather than three once anybody is remote, and three
              again when nobody is. A permanent "Remote: 0" on a dashboard for a
              company that has never used the feature is clutter, which §15 asks
              this screen not to add; a company that has people working from home
              today needs to see it beside the absences or the two do not add up.
            */}
            <div
              className={
                attendanceToday.remote > 0 ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-4" : "grid gap-3 sm:grid-cols-3"
              }
            >
              <StatCard
                label="Present"
                value={attendanceToday.present}
                icon={CheckCircle2}
                tone="success"
                hint="Checked in today"
              />
              <StatCard
                label={attendanceToday.officeClosed ? "Office closed" : "Absent"}
                value={attendanceToday.officeClosed ? "—" : attendanceToday.absent}
                icon={attendanceToday.officeClosed ? CalendarOff : XCircle}
                tone={attendanceToday.officeClosed ? "neutral" : "destructive"}
                hint={attendanceToday.officeClosed ? "Not a working day" : "No check-in yet"}
              />
              <StatCard
                label="On leave"
                value={attendanceToday.onLeave}
                icon={CalendarDays}
                tone="warning"
                hint="Approved leave today"
              />
              {attendanceToday.remote > 0 && (
                <StatCard
                  label="Remote"
                  value={attendanceToday.remote}
                  icon={House}
                  tone="warning"
                  hint="Attendance not required"
                />
              )}
            </div>
          </CardContent>
        </Card>

        <UpcomingClosures closures={data.upcomingClosures} />

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="text-primary-ink size-4" aria-hidden />
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
                  description={copy.emptyTrend}
                  inset={false}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="text-primary-ink size-4" aria-hidden />
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
                  description="Once profiles carry a department, this breakdown will populate."
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
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
