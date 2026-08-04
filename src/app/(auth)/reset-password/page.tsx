import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RESET_TICKET_COOKIE, readResetTicket } from "@/lib/auth/reset-ticket";
import { ROUTES } from "@/lib/constants";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const store = await cookies();
  const ticket = await readResetTicket(store.get(RESET_TICKET_COOKIE)?.value);

  // Reaching this page without having verified a code is a dead end, so send
  // them back rather than showing a form whose submit is certain to fail.
  if (!ticket) redirect(ROUTES.verifyResetCode);

  return (
    <Card glass className="shadow-xl">
      <CardHeader className="space-y-1.5">
        <CardTitle className="text-2xl">Choose a new password</CardTitle>
        <CardDescription>
          Setting a new password for <span className="text-foreground font-medium">{ticket.email}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm email={ticket.email} />
      </CardContent>
    </Card>
  );
}
