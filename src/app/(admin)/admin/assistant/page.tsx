import type { Metadata } from "next";

import { AdminChat } from "@/components/admin/admin-chat";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Assistant" };

/**
 * The admin workforce assistant.
 *
 * The `(admin)` layout has already turned away anybody who is not an
 * administrator, and `/api/admin/chat` checks again on every turn — this screen
 * being hidden is not what keeps an employee out of the data behind it.
 */
export default function AdminAssistantPage() {
  return (
    <>
      <PageHeader
        title="Assistant"
        description="Ask about attendance and leave in plain English, or add and remove staff. Answers are read from the same records as the Attendance screen, and anything that changes an account is described in full and carried out only once you approve it."
      />
      <AdminChat />
    </>
  );
}
