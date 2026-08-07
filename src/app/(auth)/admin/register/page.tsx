import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { InvitationGate } from "@/components/auth/invitation-gate";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";

export const metadata: Metadata = { title: "Administrator registration" };

export default async function AdminRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <Card glass>
      <CardHeader className="space-y-3">
        <div className="bg-primary/12 text-primary-ink flex size-11 items-center justify-center rounded-xl">
          <ShieldCheck className="size-5" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-2xl">Administrator registration</CardTitle>
          <CardDescription>
            Create your account from the invitation your super administrator emailed you. We&apos;ll send a
            code — verifying it sends your request for approval automatically.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <InvitationGate token={token} variant="admin" />

        <p className="text-muted-foreground text-center text-sm">
          Not an administrator?{" "}
          <Link href={ROUTES.register} className="text-primary-ink font-medium hover:underline">
            Employee sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
