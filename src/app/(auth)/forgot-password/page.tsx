import { Suspense } from "react";
import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Forgot your password" };

export default function ForgotPasswordPage() {
  return (
    <Card glass>
      <CardHeader className="space-y-1.5">
        <CardTitle className="text-2xl">Forgot your password?</CardTitle>
        <CardDescription>
          Enter your email address and we&apos;ll send you a 6-digit code to choose a new one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* useSearchParams prefills the email, so this subtree needs a boundary. */}
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <ForgotPasswordForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
