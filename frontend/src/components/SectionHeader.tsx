import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface IconBadgeProps {
  icon: LucideIcon;
  /** "record" = brand blue (this client record), "across" = magenta (across clients). */
  dimension?: "record" | "across";
  size?: "sm" | "md";
}

/** Round section icon: white glyph on blue (or magenta for the across-clients dimension). */
export function IconBadge({ icon: Icon, dimension = "record", size = "md" }: IconBadgeProps) {
  const bg = dimension === "across" ? "bg-secondary" : "bg-iconBadge-bg";
  const dims = size === "sm" ? "size-8" : "size-10";
  return (
    <span aria-hidden="true" className={`inline-flex ${dims} shrink-0 items-center justify-center rounded-full ${bg} text-iconBadge-fg`}>
      <Icon className={size === "sm" ? "size-4" : "size-5"} strokeWidth={2} />
    </span>
  );
}

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  id?: string;
  dimension?: "record" | "across";
  subtitle?: ReactNode;
  actions?: ReactNode;
  level?: 2 | 3;
}

/** Card section header: round icon badge, short navy title, optional pill chips on the right. */
export function SectionHeader({ icon, title, id, dimension, subtitle, actions, level = 2 }: SectionHeaderProps) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <IconBadge icon={icon} dimension={dimension} />
        <div className="min-w-0">
          <H id={id} className={level === 2 ? "text-heading-xs font-bold" : "text-heading-xxs font-semibold"}>
            {title}
          </H>
          {subtitle && <div className="mt-0.5 text-body-xs text-textMuted">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Small dimension marker: "This client record" (blue) or "Across clients" (magenta). */
export function DimensionLabel({ dimension }: { dimension: "record" | "across" }) {
  const across = dimension === "across";
  return (
    <span className={`inline-flex items-center gap-1.5 text-body-xs font-semibold ${across ? "text-secondary" : "text-primaryPressed"}`}>
      <span aria-hidden="true" className={`inline-block h-3 w-1 rounded-full ${across ? "bg-secondary" : "bg-primary"}`} />
      {across ? "Across clients" : "This client record"}
    </span>
  );
}
