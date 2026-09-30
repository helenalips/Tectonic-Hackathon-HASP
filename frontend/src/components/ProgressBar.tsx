interface ProgressBarProps {
  /** 0-1 */
  value: number;
  label: string;
  tone?: "good" | "brand" | "ink";
  compact?: boolean;
  /** Visible caption, e.g. "78% facts confirmed". Rendered in body text colour, never in bar colour. */
  caption?: string;
}

const FILL = { good: "bg-progress-good", brand: "bg-progress-brand", ink: "bg-progress-ink" } as const;

/** Horizontal progress bar (mysdworx style). Progress colours are for the bar only, never text. */
export function ProgressBar({ value, label, tone = "brand", compact = false, caption }: ProgressBarProps) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const percent = Math.round(v * 100);
  return (
    <div className="w-full">
      {caption && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-body-xs">
          <span className="text-text">{caption}</span>
          <span className="font-semibold tabular-nums text-heading">{percent}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className={`w-full overflow-hidden rounded-full bg-progress-track ${compact ? "h-1.5" : "h-2"}`}
      >
        <div className={`h-full rounded-full ${FILL[tone]}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
