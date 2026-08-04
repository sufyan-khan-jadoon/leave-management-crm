"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MailCheck, RotateCw } from "lucide-react";
import { toast } from "sonner";

import { OtpInput } from "@/components/auth/otp-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCountdown } from "@/hooks/use-countdown";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { OTP_LENGTH, OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_MINUTES, ROUTES } from "@/lib/constants";

export function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const { seconds, active, restart } = useCountdown(email ? OTP_RESEND_COOLDOWN_SECONDS : 0);

  // Clear the error as soon as the user starts correcting the code.
  useEffect(() => {
    if (code.length < OTP_LENGTH) setError(null);
  }, [code]);

  const verify = useCallback(
    async (submittedCode: string) => {
      if (!email) {
        setError("Enter the email address you registered with.");
        return;
      }

      setVerifying(true);
      setError(null);

      try {
        await apiClient.post("/api/auth/verify-email", { email, code: submittedCode });

        toast.success("Email verified! You can sign in now.");
        router.push(`${ROUTES.login}?verified=1`);
      } catch (caught) {
        const message =
          caught instanceof ApiClientError ? caught.message : "Verification failed. Please try again.";

        setError(message);
        setCode("");
        toast.error(message);
      } finally {
        setVerifying(false);
      }
    },
    [email, router],
  );

  async function resend() {
    if (!email) {
      setError("Enter your email address first.");
      return;
    }

    setResending(true);

    try {
      const result = await apiClient.post<{ cooldownSeconds: number }>("/api/auth/resend-otp", { email });

      restart(result.cooldownSeconds);
      setCode("");
      toast.success("A new code is on its way.");
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        // A 429 carries the server's remaining cooldown — mirror it in the UI.
        if (caught.status === 429) restart(OTP_RESEND_COOLDOWN_SECONDS);
        toast.error(caught.message);
        return;
      }

      toast.error("Could not resend the code. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="verify-email">Email address</Label>
        <Input
          id="verify-email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={verifying}
        />
      </div>

      <div className="space-y-3">
        <Label className="justify-center">Verification code</Label>
        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={verify}
          disabled={verifying}
          invalid={Boolean(error)}
        />
        {error ? (
          <p className="text-destructive text-center text-xs font-medium">{error}</p>
        ) : (
          <p className="text-muted-foreground text-center text-xs">
            The {OTP_LENGTH}-digit code expires {OTP_TTL_MINUTES} minutes after it is sent.
          </p>
        )}
      </div>

      <Button
        className="w-full"
        size="lg"
        loading={verifying}
        disabled={code.length !== OTP_LENGTH}
        onClick={() => verify(code)}
      >
        {!verifying && <MailCheck className="size-4" />}
        Verify email
      </Button>

      <div className="flex flex-col items-center gap-2 text-sm">
        <Button variant="ghost" size="sm" onClick={resend} disabled={active || resending} loading={resending}>
          {!resending && <RotateCw className="size-3.5" />}
          {active ? `Resend code in ${seconds}s` : "Resend code"}
        </Button>

        <Link href={ROUTES.login} className="text-muted-foreground hover:text-foreground transition-colors">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
