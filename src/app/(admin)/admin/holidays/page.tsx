import type { Metadata } from "next";

import { HolidayManager } from "@/components/admin/holiday-manager";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Office days off" };

export default function AdminHolidaysPage() {
  return (
    <>
      <PageHeader
        title="Office days off"
        description="Days the whole office is closed. Nobody is expected in, and the day costs nobody a leave — including anyone who had already booked one. Everybody is emailed at noon the day before."
      />
      <HolidayManager />
    </>
  );
}
