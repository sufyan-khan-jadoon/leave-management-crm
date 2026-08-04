"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { OtpInput } from "@/components/auth/otp-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCountdown } from "@/hooks/use-countdown";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { OTP_LENGTH, OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_MINUTES, ROUTES } from "@/lib/constants";

export function VerifyResetCodeForm() {
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
      if (!email.trim()) {
        setError("Enter the email address you requested the code for.");
        return;
      }

      setVerifying(true);
      setError(null);

      try {
        // Sets the signed ticket cookie the password page requires.
        await apiClient.post("/api/auth/verify-reset-code", { email, code: submittedCode });

        toast.success("Code verified — choose a new password.");
        router.push(ROUTES.resetPassword);
      } catch (caught) {
        const message = caught instanceof ApiClientError ? caught.message : "That code could not be checked.";

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
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }

    setResending(true);

    try {
      await apiClient.post("/api/auth/forgot-password", { email });

      restart(OTP_RESEND_COOLDOWN_SECONDS);
      setCode("");
      toast.success("If an account exists for that address, a new code is on its way.");
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
        <Label htmlFor="reset-code-email">Email address</Label>
        <Input
          id="reset-code-email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={verifying}
        />
      </div>

      <div className="space-y-3">
        <Label className="justify-center">Reset code</Label>
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
        {!verifying && <ShieldCheck className="size-4" />}
        Verify code
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
