import type { Metadata } from "next";
import Link from "next/link";
import { Clock3 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";

export const metadata: Metadata = { title: "Request pending" };

/** Where a newly verified administrator lands while they wait on a decision. */
export default function AdminPendingPage() {
  return (
    <Card glass>
      <CardHeader className="space-y-3">
        <div className="bg-warning/12 text-warning-ink flex size-11 items-center justify-center rounded-xl">
          <Clock3 className="size-5" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-2xl">Request sent for approval</CardTitle>
          <CardDescription>
            Your email is verified and your request is now with the super administrator. You&apos;ll get an
            email as soon as it&apos;s reviewed — you can close this page.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-center text-sm">
          Already approved?{" "}
          <Link href={ROUTES.adminLogin} className="text-primary-ink font-medium hover:underline">
            Administrator sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
