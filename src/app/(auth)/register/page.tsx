import type { Metadata } from "next";

import { InvitationGate } from "@/components/auth/invitation-gate";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <Card glass>
      <CardHeader className="space-y-1.5">
        <CardTitle className="text-2xl">Create your account</CardTitle>
        <CardDescription>
          Open the invitation link your administrator emailed you — you&apos;ll add your profile details
          after verifying your email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <InvitationGate token={token} />
      </CardContent>
    </Card>
  );
}
