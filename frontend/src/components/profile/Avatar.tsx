const PALETTE = [
  "bg-primaryTint text-primaryPressed",
  "bg-secondarySubtle text-secondary",
  "bg-navy text-surface",
  "bg-success-subtle text-success-text",
  "bg-primary text-surface",
  "bg-warning-subtle text-textStrong",
  "bg-info-soft text-navy",
  "bg-secondary text-surface",
] as const;

const SIZE = {
  xs: "size-6 text-caption",
  sm: "size-8 text-body-xs",
  md: "size-11 text-body-s",
  lg: "size-16 text-heading-xs",
} as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

function colourFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

interface AvatarProps {
  name: string;
  /** Stable seed for the colour (person id). Defaults to the name. */
  seed?: string;
  size?: keyof typeof SIZE;
  className?: string;
}

/** Coloured initials. Decorative: the name is always rendered next to it. */
export function Avatar({ name, seed, size = "md", className = "" }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-display font-bold ${SIZE[size]} ${colourFor(seed ?? name)} ${className}`}
    >
      {initials(name)}
    </span>
  );
}
