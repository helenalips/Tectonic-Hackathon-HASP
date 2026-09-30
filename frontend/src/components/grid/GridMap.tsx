import { useId, useMemo, useState } from "react";
import type { SimilarCase } from "../../api/types";
import { formatDate } from "../../lib/format";
import { CaseCard, SourceDocCard } from "./SourceDocCard";
import type { GridDoc } from "./gridData";

interface GridMapProps {
  clientName: string;
  docs: GridDoc[];
  cases: SimilarCase[];
  /** Short label of the new item (your draft or question). */
  newItemLabel?: string;
  compact?: boolean;
  className?: string;
}

/** Column position of the new item on the shared track, in percent. */
const COL = 84;
const FILLERS = ["Retail · NL", "Logistics · BE", "Healthcare · FR", "Public sector · BE"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Decorative grey dots for other clients' rows (their own documents), kept clear of the column. */
function greyDots(seed: string, n: number): number[] {
  const h = hash(seed);
  return Array.from({ length: n }, (_, i) => 4 + (((h >> (i * 5)) & 0xff) / 255) * (COL - 14) + i * 3).map((x) => Math.min(x, COL - 9));
}

/** x positions (percent) for the record's documents, oldest left, spread to avoid overlap. */
function positions(docs: GridDoc[]): number[] {
  if (docs.length === 0) return [];
  const times = docs.map((d) => Date.parse(d.date) || 0);
  const min = Math.min(...times);
  const max = Math.max(Date.now(), ...times);
  const span = Math.max(1, max - min);
  const lo = 3;
  const hi = COL - 10;
  const xs = times.map((t) => lo + ((t - min) / span) * (hi - lo));
  const gap = Math.min(6, (hi - lo) / Math.max(1, docs.length));
  for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] < gap) xs[i] = xs[i - 1] + gap;
  const over = xs[xs.length - 1] - hi;
  if (over > 0) for (let i = 0; i < xs.length; i++) xs[i] = lo + ((xs[i] - lo) * (hi - lo)) / (hi - lo + over);
  return xs;
}

const DOT_KIND_TEXT = { conflict: "conflicts with the new item", confirm: "confirms the new item", neutral: "in the record" } as const;

type Selection = { kind: "doc"; doc: GridDoc } | { kind: "case"; c: SimilarCase } | null;

/**
 * The signature TrustGrid visual (team one-pager). Rows are clients. The current client's row is the
 * blue band (horizontal ↔: its documents over time) ending in the red NEW ITEM. A plum column (vertical ↕)
 * runs through the new item and crosses every other client; plum dots = same problem, already solved.
 */
export function GridMap({ clientName, docs, cases, newItemLabel = "New item", compact = false, className = "" }: GridMapProps) {
  const [sel, setSel] = useState<Selection>(null);
  const titleId = useId();
  const detailId = useId();
  const xs = useMemo(() => positions(docs), [docs]);

  const labelW = compact ? 92 : 172;
  const caseRows = cases.slice(0, compact ? 4 : 5);
  const usedLabels = new Set(caseRows.map((c) => c.client_label));
  const fillers = FILLERS.filter((f) => !usedLabels.has(f)).slice(0, compact ? 1 : 2);
  type Row = { key: string; label: string; c?: SimilarCase };
  const above: Row[] = [
    ...(fillers[0] ? [{ key: "f0", label: fillers[0] }] : []),
    ...caseRows.slice(0, 1).map((c) => ({ key: c.dossier_item_id, label: c.client_label, c })),
  ];
  const below: Row[] = [
    ...caseRows.slice(1).map((c) => ({ key: c.dossier_item_id, label: c.client_label, c })),
    ...(fillers[1] ? [{ key: "f1", label: fillers[1] }] : []),
  ];

  const rowH = compact ? 26 : 34;
  const bandH = compact ? 46 : 78;
  const colLeft = `calc(${labelW + 12}px + (100% - ${labelW + 24}px) * ${COL / 100})`;
  const conflicts = docs.filter((d) => d.kind === "conflict").length;
  const confirms = docs.filter((d) => d.kind === "confirm").length;

  let lastLabel = -100;
  const otherRow = (row: Row) => (
    <div key={row.key} className="relative flex items-center px-3" style={{ height: rowH }}>
      <div className={`shrink-0 truncate pr-3 text-caption ${row.c ? "font-semibold text-vt" : "text-textMuted"}`} style={{ width: labelW }} title={row.label}>
        {row.label}
      </div>
      <div className="relative h-full flex-1">
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-rowLine" />
        {greyDots(row.key, compact ? 3 : 5).map((x, i) => (
          <span key={i} aria-hidden="true" className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rowLine" style={{ left: `${x}%` }} />
        ))}
        {row.c && (
          <button
            type="button"
            className={`absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-vt shadow-0 transition-transform duration-fast hover:scale-125 ${compact ? "size-3" : "size-3.5"} ${sel?.kind === "case" && sel.c === row.c ? "ring-2 ring-vt/40" : ""}`}
            style={{ left: `${COL}%` }}
            aria-label={`Same problem, already solved at ${row.label}: ${row.c.title}`}
            aria-controls={detailId}
            onClick={() => setSel(sel?.kind === "case" && sel.c === row.c ? null : { kind: "case", c: row.c! })}
          />
        )}
      </div>
    </div>
  );

  return (
    <figure className={`min-w-0 ${className}`} aria-labelledby={titleId}>
      <figcaption id={titleId} className="sr-only">
        TrustGrid map for {clientName}. Horizontal: {docs.length} documents in the record, {conflicts} conflicting and {confirms} confirming. Vertical:{" "}
        {caseRows.length} other clients with the same problem, already solved.
      </figcaption>
      <div className="relative select-none rounded-2xl border border-borderSubtle bg-surface py-3">
        {/* plum column through the new item, crossing every row */}
        <div
          aria-hidden="true"
          className="absolute bottom-2 z-10 -translate-x-1/2 rounded-full border border-vt/70 bg-vt-soft/60"
          style={{ left: colLeft, top: compact ? 22 : 30, width: compact ? 26 : 38 }}
        />
        {/* header: vertical label above the column */}
        <div className="relative flex px-3" style={{ height: compact ? 18 : 24 }}>
          <div style={{ width: labelW }} />
          <div className="relative flex-1">
            <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-caption font-bold text-vt" style={{ left: `${Math.min(COL, compact ? 70 : 84)}%` }}>
              ↕ {compact ? "all clients" : "checked against all clients"}
            </span>
          </div>
        </div>

        {above.map(otherRow)}

        {/* the current client's row: blue band */}
        <div className="relative mx-1.5 flex items-center rounded-xl border border-hz bg-hz-soft px-1.5" style={{ height: bandH }}>
          <div className="shrink-0 truncate pr-3 text-caption font-bold text-hz" style={{ width: labelW }} title={clientName}>
            {clientName}
          </div>
          <div className="relative h-full flex-1">
            <span aria-hidden="true" className="absolute inset-x-0 top-[62%] h-0.5 rounded-full bg-hz" style={{ right: `${100 - COL}%` }} />
            {docs.map((d, i) => {
              const x = xs[i];
              const showLabel = !compact && x - lastLabel >= 11;
              if (showLabel) lastLabel = x;
              const active = sel?.kind === "doc" && sel.doc.id === d.id;
              return (
                <div key={d.id} className="absolute top-[62%] z-20" style={{ left: `${x}%` }}>
                  {showLabel && (
                    <span aria-hidden="true" className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold leading-none text-hz">
                      {d.label}
                    </span>
                  )}
                  <button
                    type="button"
                    className={`absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-transform duration-fast hover:scale-125 ${compact ? "size-3" : "size-3.5"} ${
                      d.kind === "conflict" ? "animate-pulse-dot border-surface bg-newItem" : d.kind === "confirm" ? "border-success-bold bg-hz" : "border-surface bg-hz"
                    } ${active ? "ring-2 ring-navy" : ""}`}
                    aria-label={`${d.label}, ${formatDate(d.date)}: ${d.doc.title}, ${DOT_KIND_TEXT[d.kind]}`}
                    aria-controls={detailId}
                    onClick={() => setSel(active ? null : { kind: "doc", doc: d })}
                  />
                </div>
              );
            })}
            {/* the new item at the crossing */}
            <div className="absolute top-[62%] z-30" style={{ left: `${COL}%` }}>
              <span
                className={`absolute left-0 top-0 block -translate-x-1/2 -translate-y-1/2 rounded-full bg-newItem ring-[3px] ring-surface ${compact ? "size-5" : "size-7"}`}
                style={{ boxShadow: "0 0 0 6px rgba(228,0,58,.18)" }}
                aria-hidden="true"
              />
              {!compact && (
                <span className="absolute bottom-5 left-0 -translate-x-1/2 whitespace-nowrap rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-ink shadow-0">
                  {newItemLabel}
                </span>
              )}
            </div>
          </div>
        </div>
        <p className="mt-1 px-3 text-caption font-bold text-hz" style={{ paddingLeft: labelW + 12 }}>
          checked against the record ↔
        </p>

        {below.map(otherRow)}
      </div>

      {/* legend */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-caption text-textMuted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-hz" /> Record document
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-newItem" /> Conflicts
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-full border-2 border-success-bold bg-hz" /> Confirms
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-vt" /> Same problem, already solved
        </span>
        {!sel && <span className="ml-auto hidden sm:inline">Click a dot to open it</span>}
      </div>

      <div id={detailId} aria-live="polite" className="empty:hidden">
        {sel?.kind === "doc" && (
          <div className="mt-3">
            <SourceDocCard doc={sel.doc.doc} onClose={() => setSel(null)} />
          </div>
        )}
        {sel?.kind === "case" && (
          <div className="mt-3">
            <CaseCard c={sel.c} onClose={() => setSel(null)} />
          </div>
        )}
      </div>
    </figure>
  );
}
