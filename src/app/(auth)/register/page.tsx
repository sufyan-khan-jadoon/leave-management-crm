import type { Metadata } from "next";

import { InviteRegisterForm } from "@/components/auth/invite-register-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <Card glass>
      <CardHeader className="space-y-1.5">
        <CardTitle className="text-2xl">Create your account</CardTitle>
        <CardDescription>
          Start with the invite key your administrator sent you — you&apos;ll add your profile details after
          verifying your email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <InviteRegisterForm />
      </CardContent>
    </Card>
  );
}
