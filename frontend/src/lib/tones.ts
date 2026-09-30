import { status } from "../theme/tokens";
import type { TrustLabel } from "../api/types";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "across";

/** Literal class strings so Tailwind can see them. Text colours are AA-safe on their fill. */
export const TONE: Record<Tone, { pill: string; icon: string; panel: string; bar: string }> = {
  success: {
    pill: "bg-success-subtle border-success-bold/40 text-success-text",
    icon: "text-success-bold",
    panel: "bg-success-subtle border-success-bold",
    bar: "bg-success-bold",
  },
  warning: {
    pill: "bg-warning-subtle border-warning-bold text-warning-text",
    icon: "text-textStrong",
    panel: "bg-warning-subtle border-warning-bold",
    bar: "bg-warning-bold",
  },
  danger: {
    pill: "bg-danger-subtle border-danger-bold/40 text-danger-text",
    icon: "text-danger-text",
    panel: "bg-danger-subtle border-danger-bold",
    bar: "bg-danger-bold",
  },
  info: {
    pill: "bg-info-subtle border-info-bold/40 text-info-text",
    icon: "text-info-bold",
    panel: "bg-info-subtle border-info-bold",
    bar: "bg-info-bold",
  },
  neutral: {
    pill: "bg-background border-border text-textMuted",
    icon: "text-iconMuted",
    panel: "bg-backgroundAlt border-border",
    bar: "bg-iconMuted",
  },
  across: {
    pill: "bg-secondarySubtle border-secondary/40 text-secondary",
    icon: "text-secondary",
    panel: "bg-secondarySubtle border-secondary",
    bar: "bg-secondary",
  },
};

/** Score band per schema.md §6: ≥ 75 Reliable, 50-74 Verify, < 50 Uncertain. */
export function trustBand(score: number): TrustLabel {
  if (score >= 75) return "Reliable";
  if (score >= 50) return "Verify";
  return "Uncertain";
}

export function trustTone(label: TrustLabel): Tone {
  return status.trust[label].tone;
}
