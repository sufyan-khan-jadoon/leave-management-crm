import type { Metadata } from "next";

import { AttendanceManager } from "@/components/admin/attendance-manager";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Attendance" };

export default function AdminAttendancePage() {
  return (
    <>
      <PageHeader
        title="Attendance"
        description="Who was in the office on a given day. Choose a date to look back; days the office was closed, and people on approved leave, are marked as such rather than counted absent."
      />
      <AttendanceManager />
    </>
  );
}
