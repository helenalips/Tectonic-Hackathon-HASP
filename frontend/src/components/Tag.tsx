import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { TONE, type Tone } from "../lib/tones";

interface TagProps {
  tone: Tone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  title?: string;
}

/** Pill tag: soft fill, icon and text label. Colour is never the only signal. */
export function Tag({ tone, icon: Icon, children, className = "", title }: TagProps) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-body-xs font-semibold ${TONE[tone].pill} ${className}`}
    >
      {Icon && <Icon aria-hidden="true" className={`size-4 shrink-0 ${TONE[tone].icon}`} strokeWidth={2.25} />}
      {children}
    </span>
  );
}
