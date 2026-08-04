"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { PasswordStrength } from "@/components/auth/password-strength";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import { resetPasswordSchema, type ResetPasswordInput } from "@/validations/auth.schema";

/**
 * Final step. The account is identified by the ticket cookie set when the code
 * was verified, so this form only collects the password.
 */
export function ResetPasswordForm({ email }: { email: string }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
    mode: "onBlur",
  });

  async function onSubmit(values: ResetPasswordInput) {
    try {
      await apiClient.post("/api/auth/reset-password", values);

      toast.success("Password changed — you can sign in now.");
      router.push(`${ROUTES.login}?reset=1`);
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.details) {
          for (const [field, message] of Object.entries(error.details)) {
            if (field in values) form.setError(field as keyof ResetPasswordInput, { message });
          }
        } else {
          // The ticket expired mid-flow; the code must be entered again.
          toast.error(error.message);
          router.push(`${ROUTES.verifyResetCode}?email=${encodeURIComponent(email)}`);
          return;
        }

        toast.error(error.message);
        return;
      }

      toast.error("Something went wrong. Please try again.");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="pr-10"
                    disabled={form.formState.isSubmitting}
                    {...field}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </FormControl>
              <PasswordStrength password={form.watch("password")} />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm new password</FormLabel>
              <FormControl>
                <Input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  disabled={form.formState.isSubmitting}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
          {!form.formState.isSubmitting && <KeyRound className="size-4" />}
          Change password
        </Button>

        <p className="text-muted-foreground text-center text-sm">
          <Link href={ROUTES.login} className="hover:text-foreground transition-colors">
            Back to sign in
          </Link>
        </p>
      </form>
    </Form>
  );
}
