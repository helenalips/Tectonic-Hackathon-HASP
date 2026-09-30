interface ReliabilityRingProps {
  /** 0-100 */
  score: number;
  size?: number;
  /** Show "/100" under the number (large variant). */
  caption?: boolean;
  className?: string;
}

function band(score: number): { stroke: string; label: string } {
  if (score >= 75) return { stroke: "stroke-success-bold", label: "Reliable" };
  if (score >= 50) return { stroke: "stroke-warning-bold", label: "Verify" };
  return { stroke: "stroke-danger-bold", label: "Uncertain" };
}

/** Circular score ring. Band colour is backed by the number and an accessible label. */
export function ReliabilityRing({ score, size = 40, caption = false, className = "" }: ReliabilityRingProps) {
  const v = Math.max(0, Math.min(100, Math.round(Number.isFinite(score) ? score : 0)));
  const stroke = size >= 64 ? 8 : 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const b = band(v);
  return (
    <span
      role="img"
      aria-label={`Reliability ${v} of 100 (${b.label})`}
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`} fill="none" strokeWidth={stroke}>
          <circle cx={size / 2} cy={size / 2} r={r} className="stroke-progress-track" />
          {v > 0 && (
            <circle cx={size / 2} cy={size / 2} r={r} className={b.stroke} strokeDasharray={`${(c * v) / 100} ${c}`} strokeLinecap="round" />
          )}
        </g>
      </svg>
      <span aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={`font-display font-bold tabular-nums text-heading ${size >= 64 ? "text-heading-xs" : "text-caption"}`}>{v}</span>
        {caption && <span className="mt-0.5 text-caption text-textMuted">/100</span>}
      </span>
    </span>
  );
}
