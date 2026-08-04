import type { Metadata } from "next";

import { EmployeeDashboard } from "@/components/dashboard/employee-dashboard";
import { auth } from "@/lib/auth/auth";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0] ?? "there";

  return <EmployeeDashboard firstName={firstName} />;
}
