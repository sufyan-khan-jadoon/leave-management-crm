"use client";

import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";

const RULES = [
  { label: "At least 8 characters", test: (value: string) => value.length >= 8 },
  { label: "One lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { label: "One uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { label: "One number", test: (value: string) => /[0-9]/.test(value) },
  { label: "One special character", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const;

const STRENGTH_STYLES = ["bg-destructive", "bg-destructive", "bg-warning", "bg-warning", "bg-success"] as const;

/** Live checklist mirroring the server-side password policy. */
export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;

  const passed = RULES.filter((rule) => rule.test(password)).length;

  return (
    <div className="space-y-2 pt-1">
      <div className="flex gap-1" role="presentation">
        {RULES.map((rule, index) => (
          <span
            key={rule.label}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300 ease-standard",
              index < passed ? STRENGTH_STYLES[passed - 1] : "bg-muted",
            )}
          />
        ))}
      </div>
      <ul className="grid gap-1 sm:grid-cols-2">
        {RULES.map((rule) => {
          const ok = rule.test(password);

          return (
            <li
              key={rule.label}
              className={cn(
                "flex items-center gap-1.5 text-xs transition-colors duration-200 ease-standard",
                ok ? "text-success-ink" : "text-muted-foreground",
              )}
            >
              {ok ? <Check className="size-3 shrink-0" /> : <X className="size-3 shrink-0" />}
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
