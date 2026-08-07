"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { signIn } from "next-auth/react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/lib/constants";
import { loginSchema, type LoginInput } from "@/validations/auth.schema";

type LoginFormProps = {
  /** Admins sign in through a separate screen with its own landing route. */
  variant?: "employee" | "admin";
};

export function LoginForm({ variant = "employee" }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    // `portal` is submitted with the credentials so the server can refuse an
    // account that belongs on the other screen. It is never rendered.
    // The address is carried over when the other screen redirected them here.
    defaultValues: { email: searchParams.get("email") ?? "", password: "", portal: variant },
  });

  const callbackUrl =
    searchParams.get("callbackUrl") ?? (variant === "admin" ? ROUTES.adminDashboard : ROUTES.dashboard);

  // Carry whatever has been typed into the reset flow so the address never has
  // to be entered twice. `watch` keeps this current as the field changes.
  const typedEmail = form.watch("email");
  const forgotHref = typedEmail.trim()
    ? `${ROUTES.forgotPassword}?email=${encodeURIComponent(typedEmail.trim())}`
    : ROUTES.forgotPassword;

  async function onSubmit(values: LoginInput) {
    const result = await signIn("credentials", { ...values, redirect: false });

    if (result?.error) {
      // NextAuth surfaces our domain message via `code`; anything else is a
      // generic credential mismatch.
      const message =
        result.code && result.code !== "credentials"
          ? result.code
          : "Incorrect email or password. Please try again.";

      if (message.toLowerCase().includes("verify your email")) {
        toast.error(message);
        router.push(`${ROUTES.verifyEmail}?email=${encodeURIComponent(values.email)}`);
        return;
      }

      // Signed in at the wrong door. They have already proven the password, so
      // carry the address across rather than making them type it again.
      if (message.includes("administrator page") || message.includes("employee page")) {
        const destination = variant === "admin" ? ROUTES.login : ROUTES.adminLogin;

        toast.error(message);
        router.push(`${destination}?email=${encodeURIComponent(values.email)}`);
        return;
      }

      form.setError("password", { message });
      toast.error(message);
      return;
    }

    toast.success("Welcome back!");
    router.push(callbackUrl);
    router.refresh();
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
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between gap-2">
                <FormLabel>Password</FormLabel>
                <Link
                  href={forgotHref}
                  className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
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
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
          {!form.formState.isSubmitting && <LogIn className="size-4" />}
          Sign in
        </Button>

        {variant === "employee" && (
          <>
            <p className="text-muted-foreground text-center text-sm">
              Don&apos;t have an account?{" "}
              <Link href={ROUTES.register} className="text-primary-ink font-medium hover:underline">
                Create one
              </Link>
            </p>

            {/* The admin screens link here, so the way back has to exist too. */}
            <p className="text-muted-foreground text-center text-sm">
              Are you an administrator?{" "}
              <Link href={ROUTES.adminLogin} className="text-primary-ink font-medium hover:underline">
                Administrator sign in
              </Link>
            </p>
          </>
        )}
      </form>
    </Form>
  );
}
