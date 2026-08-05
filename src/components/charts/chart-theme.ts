import type { CSSProperties } from "react";

/** Shared Recharts styling so both charts read as one system. */

export const CHART_PALETTE = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

export const axisTick = { fill: "var(--color-muted-foreground)", fontSize: 12 } as const;

export const gridStroke = "color-mix(in oklab, var(--color-border) 70%, transparent)";

/** Matches the `glass-strong` utility — Recharts only takes inline styles here. */
export const tooltipContentStyle: CSSProperties = {
  background: "var(--glass-bg-strong)",
  backdropFilter: "blur(28px) saturate(180%)",
  WebkitBackdropFilter: "blur(28px) saturate(180%)",
  border: "none",
  borderRadius: "14px",
  boxShadow:
    "inset 0 1px 0 0 var(--glass-highlight), inset 0 0 0 1px var(--glass-hairline), 0 12px 32px -12px var(--glass-shadow-strong)",
  color: "var(--color-popover-foreground)",
  fontSize: "0.8125rem",
  padding: "0.5rem 0.75rem",
};

export const tooltipItemStyle: CSSProperties = { padding: "0.0625rem 0" };

export const tooltipLabelStyle: CSSProperties = {
  color: "var(--color-foreground)",
  fontWeight: 600,
  marginBottom: "0.125rem",
};
