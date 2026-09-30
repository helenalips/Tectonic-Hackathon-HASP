import { forwardRef, useImperativeHandle, useMemo, useRef, type ReactNode, type TextareaHTMLAttributes } from "react";

export interface Highlight {
  quote: string;
  tone: "conflict" | "approach" | "confirmed" | "applied";
}

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (v: string) => void;
  highlights: Highlight[];
  className?: string;
};

const TONE: Record<Highlight["tone"], string> = {
  conflict: "bg-danger-subtle underline decoration-danger-bold decoration-wavy decoration-2 underline-offset-4",
  approach: "bg-vt-subtle underline decoration-vt decoration-wavy decoration-2 underline-offset-4",
  confirmed: "bg-transparent underline decoration-success-bold decoration-2 underline-offset-4",
  applied: "bg-transparent animate-flash rounded-sm",
};

interface Range {
  start: number;
  end: number;
  tone: Highlight["tone"];
}

function ranges(text: string, highlights: Highlight[]): Range[] {
  const out: Range[] = [];
  const lower = text.toLowerCase();
  for (const h of highlights) {
    const q = h.quote.trim();
    if (!q) continue;
    let i = text.indexOf(q);
    if (i < 0) i = lower.indexOf(q.toLowerCase());
    if (i < 0) continue;
    const r = { start: i, end: i + q.length, tone: h.tone };
    if (!out.some((o) => r.start < o.end && o.start < r.end)) out.push(r);
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * A plain textarea with inline highlights rendered underneath it by a mirrored layer
 * (same font, padding and wrapping; text in the mirror is transparent). No HTML injection:
 * the mirror renders React text nodes and <mark> elements only.
 */
export const HighlightedTextarea = forwardRef<HTMLTextAreaElement, Props>(function HighlightedTextarea({ value, onValueChange, highlights, className = "", ...rest }, ref) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => taRef.current as HTMLTextAreaElement);
  const parts = useMemo(() => {
    const rs = ranges(value, highlights);
    const nodes: ReactNode[] = [];
    let pos = 0;
    rs.forEach((r, i) => {
      if (r.start > pos) nodes.push(value.slice(pos, r.start));
      nodes.push(
        <mark key={`${i}-${r.start}-${r.tone}`} data-tone={r.tone} className={`text-transparent ${TONE[r.tone]}`}>
          {value.slice(r.start, r.end)}
        </mark>,
      );
      pos = r.end;
    });
    nodes.push(value.slice(pos) + "\n");
    return nodes;
  }, [value, highlights]);

  const shared = `whitespace-pre-wrap break-words px-4 py-3 font-sans text-body-s leading-relaxed tracking-body ${className}`;
  return (
    <div className="relative min-h-0 flex-1">
      <div ref={mirrorRef} aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden text-transparent ${shared}`}>
        {parts}
      </div>
      <textarea
        ref={taRef}
        {...rest}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onScroll={(e) => {
          if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
        }}
        className={`relative block h-full w-full resize-none bg-transparent text-textStrong caret-primary outline-none focus-visible:shadow-none ${shared}`}
      />
    </div>
  );
});

const VISIBLE_TONE: Record<Highlight["tone"], string> = {
  conflict: "bg-danger-subtle text-textStrong underline decoration-danger-bold decoration-wavy decoration-2 underline-offset-4",
  approach: "bg-vt-subtle text-textStrong underline decoration-vt decoration-wavy decoration-2 underline-offset-4",
  confirmed: "bg-transparent text-textStrong underline decoration-success-bold decoration-2 underline-offset-4",
  applied: "bg-transparent text-textStrong animate-flash rounded-sm",
};

/** Read-only text with the same inline highlights (used in chat replies). */
export function HighlightedText({ text, highlights, className = "" }: { text: string; highlights: Highlight[]; className?: string }) {
  const rs = ranges(text, highlights);
  const nodes: ReactNode[] = [];
  let pos = 0;
  rs.forEach((r, i) => {
    if (r.start > pos) nodes.push(text.slice(pos, r.start));
    nodes.push(
      <mark key={`${i}-${r.start}-${r.tone}`} data-tone={r.tone} className={VISIBLE_TONE[r.tone]}>
        {text.slice(r.start, r.end)}
      </mark>,
    );
    pos = r.end;
  });
  nodes.push(text.slice(pos));
  return <div className={`whitespace-pre-wrap break-words ${className}`}>{nodes}</div>;
}
