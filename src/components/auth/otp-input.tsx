"use client";

import { useEffect, useRef } from "react";

import { OTP_LENGTH } from "@/lib/constants";
import { cn } from "@/lib/utils";

type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
};

/**
 * Segmented 6-digit code entry with paste, arrow-key and backspace support.
 * State is a single string; the boxes are a presentation detail.
 */
export function OtpInput({ value, onChange, onComplete, disabled, invalid }: OtpInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const completedFor = useRef<string | null>(null);

  useEffect(() => {
    if (value.length === OTP_LENGTH && completedFor.current !== value) {
      completedFor.current = value;
      onComplete?.(value);
    }

    if (value.length < OTP_LENGTH) completedFor.current = null;
  }, [value, onComplete]);

  function setDigit(index: number, digit: string) {
    const next = value.padEnd(OTP_LENGTH, " ").split("");
    next[index] = digit || " ";
    onChange(next.join("").trimEnd().replace(/\s/g, ""));
  }

  function handleChange(index: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      setDigit(index, "");
      return;
    }

    // A multi-character value means the user pasted — spread it across boxes.
    if (digits.length > 1) {
      const merged = (value.slice(0, index) + digits).slice(0, OTP_LENGTH);
      onChange(merged);
      inputs.current[Math.min(merged.length, OTP_LENGTH - 1)]?.focus();
      return;
    }

    const next = value.slice(0, index) + digits + value.slice(index + 1);
    onChange(next.slice(0, OTP_LENGTH));
    inputs.current[Math.min(index + 1, OTP_LENGTH - 1)]?.focus();
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !value[index] && index > 0) {
      event.preventDefault();
      onChange(value.slice(0, index - 1));
      inputs.current[index - 1]?.focus();
      return;
    }

    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      inputs.current[index - 1]?.focus();
    }

    if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      event.preventDefault();
      inputs.current[index + 1]?.focus();
    }
  }

  return (
    <div className="flex justify-center gap-2" role="group" aria-label={`${OTP_LENGTH}-digit verification code`}>
      {Array.from({ length: OTP_LENGTH }, (_, index) => (
        <input
          key={index}
          ref={(element) => {
            inputs.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={OTP_LENGTH}
          value={value[index] ?? ""}
          disabled={disabled}
          aria-label={`Digit ${index + 1}`}
          aria-invalid={invalid}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onFocus={(event) => event.target.select()}
          className={cn(
            "glass-inset size-12 rounded-lg border-0 text-center text-xl font-semibold tabular-nums outline-none",
            "transition-[box-shadow,background-color,transform] duration-200 ease-standard",
            "focus-visible:bg-card/80 focus-visible:scale-105 focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklab,var(--ring)_28%,transparent)]",
            invalid &&
              "shadow-[inset_0_0_0_1px_var(--destructive),0_0_0_3px_color-mix(in_oklab,var(--destructive)_22%,transparent)]",
            disabled && "cursor-not-allowed opacity-50",
          )}
        />
      ))}
    </div>
  );
}
