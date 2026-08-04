import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { AiLeaveForm } from "@/components/leaves/ai-leave-form";
import { auth } from "@/lib/auth/auth";
import { ROUTES } from "@/lib/constants";
import { appConfig } from "@/lib/env";
import { leaveService } from "@/services/leave.service";

export const metadata: Metadata = { title: "Request leave" };

export default async function NewLeavePage() {
  const session = await auth();
  if (!session?.user) redirect(ROUTES.login);

  const balance = await leaveService.balanceFor(session.user.id);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Request leave"
        description="No forms to fill in — just tell us what you need in your own words."
      />
      <AiLeaveForm remainingThisMonth={balance.remaining} hrPhone={appConfig.hrPhone} />
    </div>
  );
}
