import type { Metadata } from "next";

import { HolidayManager } from "@/components/admin/holiday-manager";
import { WorkingWeekPanel } from "@/components/admin/working-week-panel";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Working days & days off" };

/**
 * The organisation's calendar, in one place.
 *
 * The weekly schedule and the specific closures are the same rule seen at two
 * scales — "which days do we work" and "except this one" — and both decide what
 * a leave request costs. Splitting them across two screens would make the second
 * look like an exception to something the reader had not been shown.
 */
export default function AdminWorkingDaysPage() {
  return (
    <>
      <PageHeader
        title="Working days & days off"
        description="The days the organisation works, and the specific dates it does not. A leave request is charged only for the working days inside it, and nobody is marked absent on a day off."
      />
      <div className="grid gap-4">
        <WorkingWeekPanel />
        <HolidayManager />
      </div>
    </>
  );
}
