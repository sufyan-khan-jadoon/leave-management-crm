import type { Metadata } from "next";

import { EmployeeAttendance } from "@/components/attendance/employee-attendance";
import { PageHeader } from "@/components/layout/page-header";
import { ALLOWED_RADIUS_METERS } from "@/lib/constants";

export const metadata: Metadata = { title: "Attendance" };

export default function AttendancePage() {
  return (
    <>
      <PageHeader
        title="Attendance"
        description={`Mark yourself present from the office. Your device shares its location, and the server checks it is within ${ALLOWED_RADIUS_METERS} metres before recording the day.`}
      />
      <EmployeeAttendance />
    </>
  );
}
