import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { LeaveChat } from "@/components/leaves/leave-chat";
import { ProfileRequiredNotice } from "@/components/leaves/profile-required-notice";
import { auth } from "@/lib/auth/auth";

export const metadata: Metadata = { title: "Request leave" };

export default async function NewLeavePage() {
  const session = await auth();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Request leave"
        description="No forms to fill in — just tell the assistant what you need in your own words."
      />
      {session?.user?.profileComplete ? <LeaveChat /> : <ProfileRequiredNotice />}
    </div>
  );
}
