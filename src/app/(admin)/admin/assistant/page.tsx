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
        description="Ask about attendance and leave in plain English, or add and remove staff. Anything that changes an account is described in full and carried out only once you approve it."
      />
      {/* Bounded to the viewport so the composer is always on screen. The chat is
          the one screen here whose input sits at the *foot* of a tall element, so
          letting the page grow to the transcript's height meant scrolling down to
          type every time. `dvh` rather than `vh` because mobile browser chrome
          shrinks the visible area, and 16rem is the shell above it: the sticky
          topbar, the main padding and this header. */}
      <AdminChat className="h-[calc(100dvh-16rem)] min-h-[22rem]" />
    </>
  );
}
