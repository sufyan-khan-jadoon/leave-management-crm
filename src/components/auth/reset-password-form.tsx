"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { PasswordStrength } from "@/components/auth/password-strength";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { OTP_LENGTH, OTP_TTL_MINUTES, ROUTES } from "@/lib/constants";
import { resetPasswordSchema, type ResetPasswordInput } from "@/validations/auth.schema";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      email: searchParams.get("email") ?? "",
      code: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onBlur",
  });

  const password = form.watch("password");

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
          // A rejected or expired code is reported against the code field.
          form.setError("code", { message: error.message });
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
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  disabled={form.formState.isSubmitting}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reset code</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={OTP_LENGTH}
                  placeholder={"0".repeat(OTP_LENGTH)}
                  className="text-center font-mono text-lg tracking-[0.5em]"
                  disabled={form.formState.isSubmitting}
                  {...field}
                />
              </FormControl>
              <p className="text-muted-foreground text-xs">
                The {OTP_LENGTH}-digit code expires {OTP_TTL_MINUTES} minutes after it is sent.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

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
              <PasswordStrength password={password} />
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
          Didn&apos;t get a code?{" "}
          <Link href={ROUTES.forgotPassword} className="text-primary font-medium hover:underline">
            Request a new one
          </Link>
        </p>
      </form>
    </Form>
  );
}
