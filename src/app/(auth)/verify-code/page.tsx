import { Suspense } from "react";
import type { Metadata } from "next";

import { VerifyResetCodeForm } from "@/components/auth/verify-reset-code-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Enter your reset code" };

export default function VerifyResetCodePage() {
  return (
    <Card glass>
      <CardHeader className="space-y-1.5">
        <CardTitle className="text-2xl">Enter your code</CardTitle>
        <CardDescription>
          We sent a 6-digit code to your inbox. Enter it to continue to your new password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* useSearchParams carries the address forward, so this needs a boundary. */}
        <Suspense fallback={<Skeleton className="h-72 w-full" />}>
          <VerifyResetCodeForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
