import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmployeeLeaveHistory } from "@/components/leaves/employee-leave-history";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth/auth";
import { ROUTES } from "@/lib/constants";

export const metadata: Metadata = { title: "Leave history" };

export default async function LeaveHistoryPage() {
  const session = await auth();

  // The table is scoped by id, and a missing one would widen an administrator's
  // history to the whole roster, so there is no sensible page to render without.
  if (!session?.user?.id) redirect(ROUTES.login);

  return (
    <>
      <PageHeader
        title="Leave history"
        description="Every request you've made, with the decision applied to it."
        actions={
          <Button asChild>
            <Link href={ROUTES.newLeave}>
              <Sparkles className="size-4" />
              Request leave
            </Link>
          </Button>
        }
      />
      <EmployeeLeaveHistory employeeId={session.user.id} />
    </>
  );
}
