import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Avatar fallback initials, e.g. "Ayesha Khan" -> "AK".
 *
 * Lives here rather than beside the avatar components because Server
 * Components call it directly: a "use client" module may be rendered from the
 * server, but its exports cannot be invoked there.
 */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
