import { ArrowRight, CircleCheck, CircleX, Info, Lightbulb, LoaderCircle, Mail, MessageSquare, PenLine, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { ApproachWarning, DimensionStatus, Expert, HorizontalFinding, SimilarCase, SourceDoc } from "../../api/types";
import { CATEGORY_LABEL, DOC_TYPE_LABEL, formatDate, pct, safeMailto } from "../../lib/format";
import { PersonChip } from "../profile/ProfileDrawer";
import { TrustBadge } from "../TrustBadge";

export type Dim = "horizontal" | "vertical";

const DIM = {
  horizontal: { arrow: "↔", eyebrow: "Horizontal", title: "The client record", sub: "checked against the record", text: "text-hz", bg: "bg-hz-subtle", border: "border-hz", soft: "bg-hz-soft" },
  vertical: { arrow: "↕", eyebrow: "Vertical", title: "Across all clients", sub: "checked against all clients", text: "text-vt", bg: "bg-vt-subtle", border: "border-vt", soft: "bg-vt-soft" },
} as const;

/** One-pager side-card: soft background, 4px left border, uppercase letter-spaced eyebrow with ↔ / ↕. */
export function Lane({ dim, status, children, title, id }: { dim: Dim; status?: DimensionStatus | null; children: ReactNode; title?: string; id?: string }) {
  const d = DIM[dim];
  return (
    <section aria-labelledby={id} className={`min-w-0 rounded-2xl border-l-4 ${d.border} ${d.bg} p-4`}>
      <p className={`text-caption font-bold uppercase tracking-eyebrow ${d.text}`}>
        <span aria-hidden="true">{d.arrow}</span> {d.eyebrow} · {d.sub}
      </p>
      <h3 id={id} className="mt-1 text-heading-xxs font-bold text-heading">
        {title ?? d.title}
      </h3>
      {status && <p className="mt-0.5 text-body-xs text-textStrong">{status.headline}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

/** Compact status pill for a dimension: arrow + headline + state icon. */
export function DimensionPill({ dim, status, loading = false, onClick }: { dim: Dim; status: DimensionStatus | null; loading?: boolean; onClick?: () => void }) {
  const d = DIM[dim];
  const st = status?.status ?? "empty";
  const Icon = loading ? LoaderCircle : st === "conflict" ? CircleX : st === "consistent" ? CircleCheck : Info;
  const iconTone = loading ? "text-iconMuted animate-spin" : st === "conflict" ? "text-danger-text" : st === "consistent" ? "text-success-bold" : d.text;
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border bg-surface py-1 pl-1 pr-3 text-left text-caption font-semibold text-textStrong ${d.border} ${onClick ? "transition-colors hover:bg-backgroundAlt" : ""}`}
    >
      <span aria-hidden="true" className={`inline-flex h-6 shrink-0 items-center rounded-full px-2 font-bold ${d.soft} ${d.text}`}>
        {d.arrow} {d.eyebrow}
      </span>
      <Icon aria-hidden="true" className={`size-4 shrink-0 ${iconTone}`} />
      <span className="truncate">{loading && !status ? "Checking…" : (status?.headline ?? "Waiting for text")}</span>
    </Tag>
  );
}

function SourceRow({ s }: { s: SourceDoc }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-surface px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-caption text-textStrong">
        <span className="font-semibold">{DOC_TYPE_LABEL[s.type]}</span> · {s.title}
        <span className="text-textMuted">
          {" "}
          · {s.author.name}, {formatDate(s.date)}
        </span>
      </span>
      <TrustBadge trust={s.trust} expandable={false} />
    </li>
  );
}

interface FindingCardProps {
  f: HorizontalFinding;
  /** "email" or "message": used in button labels. */
  noun?: string;
  applied?: boolean;
  recordUpdated?: boolean;
  busy?: boolean;
  onApply?: (f: HorizontalFinding) => void;
  onUpdateRecord?: (f: HorizontalFinding) => void;
}

/** A conflict with this client's record: what you wrote, what was promised earlier, who said it, and two ways out. */
export function FindingCard({ f, noun = "email", applied, recordUpdated, busy, onApply, onUpdateRecord }: FindingCardProps) {
  const origin = f.sources[0];
  const done = applied || recordUpdated;
  return (
    <article className={`animate-fade-in rounded-xl border bg-surface p-4 shadow-0 ${done ? "border-success-bold/40" : "border-danger-bold/40"}`} aria-label={`Inconsistency: ${f.key_label}`}>
      <div className="flex flex-wrap items-center gap-2">
        {done ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-subtle px-2 py-0.5 text-caption font-bold text-success-text">
            <CircleCheck aria-hidden="true" className="size-3.5" /> {applied ? `${noun === "email" ? "Email" : "Message"} updated` : "Record updated"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-danger-subtle px-2 py-0.5 text-caption font-bold text-danger-text">
            <CircleX aria-hidden="true" className="size-3.5" /> {f.severity === "high" ? "High" : f.severity === "medium" ? "Medium" : "Low"} · inconsistency
          </span>
        )}
        <span className="text-caption font-semibold uppercase tracking-eyebrow text-textMuted">{f.key_label}</span>
      </div>
      <p className="mt-2 text-body-xs font-semibold text-ink">{f.explanation}</p>
      {!done && (
        <p className="mt-2 text-caption text-text">
          <span className="font-semibold text-textStrong">You wrote: </span>
          <span className="underline decoration-danger-bold decoration-wavy underline-offset-4">“{f.draft_quote.trim()}”</span>
        </p>
      )}
      {f.record_value && (
        <div className="mt-3 rounded-lg bg-hz-soft px-3 py-2">
          <p className="text-caption font-bold uppercase tracking-eyebrow text-hz">Earlier in the record</p>
          <p className="mt-0.5 text-body-xs font-bold text-heading">{f.record_value}</p>
          {origin && (
            <p className="mt-0.5 text-caption text-textStrong">
              {origin.author.name}, {formatDate(origin.date)}, “{origin.title}”
            </p>
          )}
        </div>
      )}
      {f.sources.length > 0 && (
        <details className="group mt-2">
          <summary className="cursor-pointer list-none text-caption font-semibold text-info-text hover:underline">
            <span className="group-open:hidden">Show {f.sources.length} sources with trust</span>
            <span className="hidden group-open:inline">Hide sources</span>
          </summary>
          <ul className="mt-2 space-y-1.5">
            {f.sources.map((s) => (
              <SourceRow key={s.document_id} s={s} />
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...new Map(f.sources.map((s) => [s.author.id, s.author])).values()].map((p) => (
              <PersonChip key={p.id} person={p} />
            ))}
          </div>
        </details>
      )}
      {!done && f.suggested_rewrite && (
        <p className="mt-3 rounded-lg border border-dashed border-success-bold/50 bg-success-subtle px-3 py-2 text-caption text-textStrong">
          <span className="font-bold text-success-text">Suggested: </span>“{f.suggested_rewrite}”
        </p>
      )}
      {!done && (onApply || onUpdateRecord) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {onApply && f.suggested_rewrite && (
            <button type="button" className="btn-sm bg-primary text-surface hover:bg-primaryHover" onClick={() => onApply(f)}>
              <PenLine aria-hidden="true" className="size-3.5" /> Update my {noun}
            </button>
          )}
          {onUpdateRecord && (
            <button type="button" className="btn-sm border border-primary bg-surface text-primaryPressed hover:bg-primarySubtle" disabled={busy} onClick={() => onUpdateRecord(f)}>
              {busy ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <ArrowRight aria-hidden="true" className="size-3.5" />} Update the record
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/** Quiet green confirmations and new facts. */
export function QuietFindings({ findings }: { findings: HorizontalFinding[] }) {
  const quiet = findings.filter((f) => f.kind !== "conflict");
  if (quiet.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {quiet.map((f) => {
        const confirmed = f.kind === "confirmed" || f.kind === "duplicate_document";
        const n = f.record_claim?.evidence_count ?? f.sources.length;
        return (
          <li
            key={`${f.kind}-${f.key}-${f.draft_quote}`}
            className={`flex items-start gap-2 rounded-lg px-3 py-2 text-caption ${confirmed ? "bg-success-subtle text-textStrong" : "bg-surface text-textStrong"}`}
          >
            {confirmed ? <CircleCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-success-bold" /> : <Sparkles aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-hz" />}
            <span className="min-w-0">
              <span className="font-bold">{f.key_label}</span>
              {f.draft_value ? ` ${f.draft_value}` : ""} ·{" "}
              {confirmed ? (
                <span className="font-semibold text-success-text">
                  Matches record{n > 0 ? ` · confirmed by ${n} ${n === 1 ? "document" : "documents"}` : ""}
                </span>
              ) : (
                <span className="text-textMuted">New for this record</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Vertical: a similar problem at another client, how it was solved and by whom. */
export function SimilarCaseItem({ c }: { c: SimilarCase }) {
  return (
    <article className="animate-fade-in rounded-xl border border-vt/20 bg-surface p-3.5 shadow-0" aria-label={`Similar case at ${c.client_label}`}>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-vt" />
        <span className="min-w-0 truncate text-caption font-bold uppercase tracking-eyebrow text-vt">{c.client_label}</span>
        <span className="ml-auto shrink-0 text-caption text-textMuted">
          {CATEGORY_LABEL[c.category] ?? c.category} · {formatDate(c.date)}
        </span>
      </div>
      <h4 className="mt-1 text-body-xs font-bold text-ink">{c.title}</h4>
      <p className="mt-1 text-caption text-text">
        <span className="font-semibold text-textStrong">Solved: </span>
        {c.resolution_summary}
      </p>
      <div className="mt-2 flex items-center gap-2" aria-label={`${pct(c.similarity)} similar`}>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-vt-soft" aria-hidden="true">
          <div className="h-full rounded-full bg-vt" style={{ width: pct(c.similarity) }} />
        </div>
        <span className="text-caption font-semibold tabular-nums text-textMuted">{pct(c.similarity)} similar</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {c.solvers.map((p) => (
          <PersonChip key={p.id} person={p} />
        ))}
      </div>
    </article>
  );
}

/** Vertical: your approach differs from what worked elsewhere. */
export function ApproachCard({ w, onApply, applied, noun = "email" }: { w: ApproachWarning; onApply?: (w: ApproachWarning) => void; applied?: boolean; noun?: string }) {
  return (
    <article className="animate-fade-in rounded-xl border border-vt/40 bg-surface p-4 shadow-0" aria-label="Approach differs from what worked at other clients">
      <p className="inline-flex items-center gap-1.5 rounded-full bg-vt-soft px-2 py-0.5 text-caption font-bold text-vt">
        <Lightbulb aria-hidden="true" className="size-3.5" /> {applied ? "Proven approach applied" : "Different from what worked elsewhere"}
      </p>
      <p className="mt-2 text-body-xs font-semibold text-ink">{w.explanation}</p>
      <dl className="mt-2 grid gap-1.5 text-caption">
        <div className="rounded-lg bg-backgroundAlt px-3 py-1.5">
          <dt className="font-bold text-textMuted">Your approach</dt>
          <dd className="text-textStrong">{w.draft_approach}</dd>
        </div>
        <div className="rounded-lg bg-vt-subtle px-3 py-1.5">
          <dt className="font-bold text-vt">Proven approach</dt>
          <dd className="text-textStrong">{w.proven_approach}</dd>
        </div>
      </dl>
      {!applied && onApply && w.suggested_rewrite && (
        <button type="button" className="btn-sm mt-3 bg-vt text-surface hover:opacity-90" onClick={() => onApply(w)}>
          <Sparkles aria-hidden="true" className="size-3.5" /> Use the proven approach in my {noun}
        </button>
      )}
    </article>
  );
}

/** Who to ask: the record expert (horizontal) and everyone who solved it elsewhere (vertical). */
export function ExpertsList({ record, problem, context, onAskSlack, compact = false }: { record: Expert | null; problem: Expert[]; context: string; onAskSlack?: (e: Expert) => void; compact?: boolean }) {
  const all: { e: Expert; dim: Dim }[] = [...(record ? [{ e: record, dim: "horizontal" as Dim }] : []), ...problem.filter((p) => p.person.id !== record?.person.id).map((e) => ({ e, dim: "vertical" as Dim }))];
  if (all.length === 0) return <p className="text-caption text-textMuted">No expert found yet.</p>;
  return (
    <ul className={compact ? "space-y-2" : "grid gap-2 md:grid-cols-2"}>
      {all.map(({ e, dim }) => {
        const mail = safeMailto(e.contact, `TrustGrid: ${context}`);
        return (
          <li key={e.person.id} className="rounded-xl border border-borderSubtle bg-surface p-3">
            <div className="flex items-center gap-2">
              <PersonChip person={e.person} showRole />
              <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-caption font-bold ${dim === "horizontal" ? "bg-hz-soft text-hz" : "bg-vt-soft text-vt"}`}>
                {dim === "horizontal" ? "↔ Knows this client" : "↕ Solved it elsewhere"}
              </span>
            </div>
            <p className="mt-2 text-caption text-text">{e.reason}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-caption font-semibold text-textMuted">
                Reliability <span className="tabular-nums text-heading">{e.reliability.score}</span>/100
              </span>
              <span className="ml-auto flex gap-1.5">
                {onAskSlack && (
                  <button type="button" className="btn-sm border border-border bg-surface text-textStrong hover:border-primary" onClick={() => onAskSlack(e)}>
                    <MessageSquare aria-hidden="true" className="size-3.5" /> Ask in Slack
                  </button>
                )}
                {mail && (
                  <a href={mail} className="btn-sm border border-border bg-surface text-textStrong hover:border-primary">
                    <Mail aria-hidden="true" className="size-3.5" /> Email
                  </a>
                )}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
