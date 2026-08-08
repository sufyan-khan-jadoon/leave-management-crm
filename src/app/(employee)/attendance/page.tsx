import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";

import { EmployeeAttendance } from "@/components/attendance/employee-attendance";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";

export const metadata: Metadata = { title: "Attendance history" };

export default function AttendancePage() {
  return (
    <>
      <PageHeader
        title="Attendance history"
        description="Every day you've been checked in from the office. Marking yourself present happens on your dashboard."
        actions={
          <Button asChild>
            <Link href={ROUTES.dashboard}>
              <MapPin className="size-4" />
              Mark present
            </Link>
          </Button>
        }
      />
      <EmployeeAttendance />
    </>
  );
}
