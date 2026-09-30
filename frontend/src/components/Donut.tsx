interface DonutProps {
  /** 0-100 */
  value: number | null;
  /** Big number in the centre, e.g. "92". */
  centre: string;
  /** Small caption under the number, e.g. "/ 100 trust". */
  caption: string;
  label: string;
  size?: number;
}

/** Donut ring: navy + blue arc on a light track, big navy number in the centre. */
export function Donut({ value, centre, caption, label, size = 132 }: DonutProps) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  const blue = (c * v) / 100;
  const inkPart = Math.min(blue, c * 0.18); // short navy lead-in, as in the mysdworx rings
  return (
    <figure className="relative m-0 inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`} fill="none" strokeWidth={stroke}>
          <circle cx={size / 2} cy={size / 2} r={r} className="stroke-progress-track" />
          {v > 0 && (
            <circle cx={size / 2} cy={size / 2} r={r} className="stroke-progress-brand" strokeDasharray={`${blue} ${c}`} strokeLinecap="round" />
          )}
          {v > 0 && (
            <circle cx={size / 2} cy={size / 2} r={r} className="stroke-progress-ink" strokeDasharray={`${inkPart} ${c}`} strokeLinecap="round" />
          )}
        </g>
      </svg>
      <figcaption aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-heading-m font-bold text-heading tabular-nums">{centre}</span>
        <span className="text-caption text-textMuted">{caption}</span>
      </figcaption>
    </figure>
  );
}
