import type { Metadata } from "next";

import { CustomEmailComposer } from "@/components/admin/custom-email-composer";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Send email" };

/**
 * Reachable by every administrator, and useful only to those allowed to send.
 *
 * The screen is not hidden behind a redirect: an administrator without the grant
 * is told plainly that it is granted per account and who grants it, which is
 * more use than a nav item that silently bounces them to the overview. What they
 * may actually do is settled by the API on every request.
 */
export default function AdminEmailsPage() {
  return (
    <>
      <PageHeader
        title="Send email"
        description="Write to one person, to the employees, or to everyone. Messages are sent from the company mailbox and every send is recorded."
      />
      <CustomEmailComposer />
    </>
  );
}
