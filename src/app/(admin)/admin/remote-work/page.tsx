import type { Metadata } from "next";

import { RemoteWorkManager } from "@/components/admin/remote-work-manager";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Remote work" };

/**
 * Remote-work arrangements.
 *
 * **Not redirected when the grant is missing**, deliberately unlike the
 * complaints screen and like Reports, Send email and Working days. Complaints
 * are hidden because reading them *is* the privilege, so an ungranted version of
 * that page would be nothing but its own refusal. Here the reading is ordinary
 * people-management — whether a colleague is expected in the office is already
 * visible on the attendance roster beside this — and the privilege is the
 * *writing*. So the screen renders, the table fills, and the form and the row
 * actions are what disappear.
 *
 * Nothing is resolved here at all, which is the other difference: `canManage`
 * comes back with the list from `/api/admin/remote-work`, so there is one answer
 * rather than a server-rendered one and an API one that could drift. The
 * endpoints re-check on every request regardless of what was drawn.
 */
export default function AdminRemoteWorkPage() {
  return (
    <>
      <PageHeader
        title="Remote work"
        description="Who is working away from the office, and until when. Remote days are exempt from attendance — nobody is marked present or absent for them, they cost no leave, and no attendance reminders are sent."
      />
      <RemoteWorkManager />
    </>
  );
}
