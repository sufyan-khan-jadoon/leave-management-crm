"use client";

import { useState } from "react";
import Link from "next/link";
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
import { changePasswordSchema, type ChangePasswordInput } from "@/validations/auth.schema";

const EMPTY: ChangePasswordInput = { currentPassword: "", password: "", confirmPassword: "" };

/**
 * Self-service password change, for every kind of account — the screen it sits
 * on is the same one for an employee, an admin and the super admin.
 *
 * Someone who cannot supply their current password is not stuck: the emailed
 * code flow is the way back in, so it is offered rather than left to be
 * remembered.
 */
export function ChangePasswordForm() {
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: EMPTY,
    mode: "onBlur",
  });

  async function onSubmit(values: ChangePasswordInput) {
    try {
      await apiClient.put("/api/profile/password", values);

      // Cleared rather than left filled: the old password is worth no more
      // sitting in a form field than it is anywhere else.
      form.reset(EMPTY);
      toast.success("Password changed. Use it the next time you sign in.");
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.details) {
          for (const [field, message] of Object.entries(error.details)) {
            if (field in values) form.setError(field as keyof ChangePasswordInput, { message });
          }
        }

        toast.error(error.message);
        return;
      }

      toast.error("Could not change your password. Please try again.");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
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

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="submit" loading={form.formState.isSubmitting}>
            {!form.formState.isSubmitting && <KeyRound className="size-4" />}
            Change password
          </Button>

          <Link
            href={ROUTES.forgotPassword}
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            Forgotten your current password?
          </Link>
        </div>
      </form>
    </Form>
  );
}
