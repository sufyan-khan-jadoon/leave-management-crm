import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { LeaveChat } from "@/components/leaves/leave-chat";

export const metadata: Metadata = { title: "Request leave" };

export default function NewLeavePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Request leave"
        description="No forms to fill in — just tell the assistant what you need in your own words."
      />
      <LeaveChat />
    </div>
  );
}
