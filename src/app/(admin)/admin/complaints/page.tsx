import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ComplaintManager } from "@/components/admin/complaint-manager";
import { PageHeader } from "@/components/layout/page-header";
import { auth } from "@/lib/auth/auth";
import { ROUTES } from "@/lib/constants";
import { complaintService } from "@/services/complaint.service";

export const metadata: Metadata = { title: "Complaints" };

/**
 * Complaint management, for administrators who hold the grant.
 *
 * **The page checks, not only the nav.** Hiding the sidebar item is presentation
 * and typing the URL bypasses it entirely, so the grant is resolved here from
 * the database before anything renders — the lesson `staff/[id]/page.tsx`
 * records, where a server-rendered profile had no seniority check while the
 * endpoint beside it did, and any administrator could open any account by typing
 * the address. A page is as reachable as an endpoint; gate it the same way.
 *
 * Redirected to the overview rather than shown a refusal. The other
 * permission-gated screens explain themselves instead, because they have a
 * useful ungranted state — a composer that cannot send still shows what sending
 * would involve. There is no such version of this one: everything on it is the
 * thing being withheld, so a page saying "you cannot see these" is a page whose
 * only content is its own refusal.
 */
export default async function AdminComplaintsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect(ROUTES.adminLogin);

  const mayManage = await complaintService.mayManage({
    id: session.user.id,
    role: session.user.role,
  });

  if (!mayManage) redirect(ROUTES.adminDashboard);

  return (
    <>
      <PageHeader
        title="Complaints"
        description="Everything raised by staff. Open one to read it in full, record what was decided, and close it — the employee is emailed once it is resolved."
      />
      <ComplaintManager />
    </>
  );
}
