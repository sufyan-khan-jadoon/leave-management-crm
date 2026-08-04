import type { Metadata } from "next";

import { RegisterForm } from "@/components/auth/register-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <Card glass className="shadow-xl">
      <CardHeader className="space-y-1.5">
        <CardTitle className="text-2xl">Create your account</CardTitle>
        <CardDescription>
          Just the essentials for now — you&apos;ll add your profile details after verifying your email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
      </CardContent>
    </Card>
  );
}
