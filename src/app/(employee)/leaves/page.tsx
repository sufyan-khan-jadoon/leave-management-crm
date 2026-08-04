import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmployeeLeaveHistory } from "@/components/leaves/employee-leave-history";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";

export const metadata: Metadata = { title: "Leave history" };

export default function LeaveHistoryPage() {
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
      <EmployeeLeaveHistory />
    </>
  );
}
