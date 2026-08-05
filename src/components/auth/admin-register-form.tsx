"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { RegisterForm } from "@/components/auth/register-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";

/**
 * Two steps: prove the key, then sign up.
 *
 * Checking first means an invalid key is caught before anyone fills in a whole
 * form. It is a convenience only — registration re-checks and redeems the key
 * server-side, so nothing here is trusted.
 */
export function AdminRegisterForm() {
  const [inviteKey, setInviteKey] = useState("");
  const [accepted, setAccepted] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function proceed(event: React.FormEvent) {
    event.preventDefault();

    const key = inviteKey.trim().toUpperCase();
    if (!key || checking) return;

    setChecking(true);
    setError(null);

    try {
      await apiClient.post("/api/auth/verify-invite", { inviteKey: key });

      setAccepted(key);
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
            <p className="text-destructive text-xs font-medium">{error}</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Ask your super administrator for a key. Each one works once.
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
          <Link href={ROUTES.adminLogin} className="text-primary font-medium hover:underline">
            Administrator sign in
          </Link>
        </p>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-success/30 bg-success/5 text-muted-foreground flex items-center gap-2 rounded-lg border p-3 text-sm">
        <CheckCircle2 className="text-success size-4 shrink-0" aria-hidden />
        <span className="min-w-0">
          Key verified — <span className="text-foreground font-mono">{accepted}</span>
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

      <RegisterForm variant="admin" inviteKey={accepted} />
    </div>
  );
}
