import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/lib/constants";

export const metadata: Metadata = { title: "Administrator sign in" };

export default function AdminLoginPage() {
  return (
    <Card glass>
      <CardHeader className="space-y-3">
        <div className="bg-primary/12 text-primary-ink flex size-11 items-center justify-center rounded-xl">
          <ShieldCheck className="size-5" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-2xl">Administrator sign in</CardTitle>
          <CardDescription>Restricted access. Administrator credentials required.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Suspense fallback={<Skeleton className="h-56 w-full" />}>
          <LoginForm variant="admin" />
        </Suspense>

        <p className="text-muted-foreground text-center text-sm">
          Have an invite key?{" "}
          <Link href={ROUTES.adminRegister} className="text-primary-ink font-medium hover:underline">
            Register as an administrator
          </Link>
        </p>

        <p className="text-muted-foreground text-center text-sm">
          Not an administrator?{" "}
          <Link href={ROUTES.login} className="text-primary-ink font-medium hover:underline">
            Employee sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
