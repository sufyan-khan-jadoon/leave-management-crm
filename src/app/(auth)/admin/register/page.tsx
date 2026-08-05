import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";

import { AdminRegisterForm } from "@/components/auth/admin-register-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";

export const metadata: Metadata = { title: "Administrator registration" };

export default function AdminRegisterPage() {
  return (
    <Card glass>
      <CardHeader className="space-y-3">
        <div className="bg-primary/12 text-primary flex size-11 items-center justify-center rounded-xl">
          <KeyRound className="size-5" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-2xl">Administrator registration</CardTitle>
          <CardDescription>
            Enter the invite key your super administrator gave you, then create your account. We&apos;ll
            email you a code — verifying it sends your request for approval automatically.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <AdminRegisterForm />

        <p className="text-muted-foreground text-center text-sm">
          Not an administrator?{" "}
          <Link href={ROUTES.register} className="text-primary font-medium hover:underline">
            Employee sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
