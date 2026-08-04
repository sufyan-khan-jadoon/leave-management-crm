import { Suspense } from "react";
import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <Card glass className="shadow-xl">
      <CardHeader className="space-y-1.5">
        <CardTitle className="text-2xl">Choose a new password</CardTitle>
        <CardDescription>
          Enter the code we emailed you along with the password you&apos;d like to use.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* useSearchParams prefills the email, so this subtree needs a boundary. */}
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <ResetPasswordForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
