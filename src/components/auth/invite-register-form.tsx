"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { RegisterForm } from "@/components/auth/register-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import { ROLE } from "@/lib/enums";

type Accepted = { key: string; role: string };

/**
 * Two steps: prove the key, then sign up.
 *
 * Checking first means an invalid key is caught before anyone fills in a whole
 * form. It is a convenience only — registration re-checks and redeems the key
 * server-side, so nothing here is trusted, including the role it reports.
 *
 * Both sign-up screens share this: registration is invite-only for everyone now,
 * and the key alone decides which role it grants. `variant` therefore changes
 * only the wording and the sign-in link, never what the holder becomes.
 */
export function InviteRegisterForm({ variant = "employee" }: { variant?: "employee" | "admin" }) {
  const [inviteKey, setInviteKey] = useState("");
  const [accepted, setAccepted] = useState<Accepted | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdminScreen = variant === "admin";

  async function proceed(event: React.FormEvent) {
    event.preventDefault();

    const key = inviteKey.trim().toUpperCase();
    if (!key || checking) return;

    setChecking(true);
    setError(null);

    try {
      const result = await apiClient.post<{ role: string }>("/api/auth/verify-invite", { inviteKey: key });

      setAccepted({ key, role: result.role });
      toast.success("Key accepted — now create your account.");
    } catch (caught) {
      const message =
        caught instanceof ApiClientError ? caught.message : "That key could not be checked right now.";

      setError(message);
      toast.error(message);
    } finally {
      setChecking(false);
    }
  }

  if (!accepted) {
    return (
      <form onSubmit={proceed} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="invite-key">Invite key</Label>
          <Input
            id="invite-key"
            value={inviteKey}
            onChange={(event) => {
              setInviteKey(event.target.value);
              setError(null);
            }}
            placeholder="ABCD-EFGH-JKLM-NPQR"
            className="text-center font-mono tracking-widest uppercase"
            autoComplete="off"
            maxLength={40}
            disabled={checking}
            aria-invalid={Boolean(error)}
          />
          {error ? (
            <p className="text-destructive-ink text-xs font-medium">{error}</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              {isAdminScreen
                ? "Ask your super administrator for a key. Each one works once."
                : "Ask your administrator for a key. Each one works once."}
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" size="lg" loading={checking} disabled={!inviteKey.trim()}>
          {!checking && <KeyRound className="size-4" />}
          Proceed
          {!checking && <ArrowRight className="size-4" />}
        </Button>

        <p className="text-muted-foreground text-center text-sm">
          Already registered?{" "}
          <Link
            href={isAdminScreen ? ROUTES.adminLogin : ROUTES.login}
            className="text-primary-ink font-medium hover:underline"
          >
            {isAdminScreen ? "Administrator sign in" : "Sign in"}
          </Link>
        </p>
      </form>
    );
  }

  const grantsAdmin = accepted.role === ROLE.ADMIN;

  return (
    <div className="space-y-4">
      <div className="bg-brand/8 text-muted-foreground flex items-center gap-2 rounded-lg p-3 text-sm shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_28%,transparent)]">
        <CheckCircle2 className="text-success-ink size-4 shrink-0" aria-hidden />
        <span className="min-w-0">
          Key verified — <span className="text-foreground font-mono">{accepted.key}</span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => {
            setAccepted(null);
            setInviteKey("");
          }}
        >
          Change
        </Button>
      </div>

      {/* Said plainly because the key, not the page, decides the role — someone
          who opened the employee screen with an admin key should not be surprised
          by an approval step, and vice versa. */}
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <ShieldCheck className="text-primary-ink size-3.5 shrink-0" aria-hidden />
        {grantsAdmin
          ? "This key creates an administrator account, which a super administrator must approve."
          : "This key creates an employee account. You can sign in as soon as your email is verified."}
      </p>

      <RegisterForm variant={grantsAdmin ? "admin" : "employee"} inviteKey={accepted.key} />
    </div>
  );
}
