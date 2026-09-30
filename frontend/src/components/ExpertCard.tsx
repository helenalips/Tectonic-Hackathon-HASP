import { Clock, Mail, Trophy } from "lucide-react";
import type { Expert } from "../api/types";
import { formatHours, initials, plural, safeMailto } from "../lib/format";
import { TrustBadge } from "./TrustBadge";

const KIND_LABEL = { record_expert: "Record expert", problem_expert: "Problem expert" } as const;
const KIND_HINT = {
  record_expert: "Knows this client best",
  problem_expert: "Solved this kind of problem before",
} as const;

/** Who to ask, and why: reason, reliability with reasons, hours or solved count, top documents, contact. */
export function ExpertCard({ expert, context }: { expert: Expert; context?: string }) {
  const mailto = safeMailto(expert.contact, context ? `TrustGrid: ${context}` : "TrustGrid question");
  const across = expert.kind === "problem_expert";
  return (
    <article className="card flex h-full flex-col gap-4 p-5" aria-label={`${KIND_LABEL[expert.kind]}: ${expert.person.name}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-body-xs font-semibold ${across ? "text-secondary" : "text-primaryPressed"}`}>
          {KIND_LABEL[expert.kind]}
        </span>
        <span className="text-caption text-textMuted">{KIND_HINT[expert.kind]}</span>
      </div>

      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full font-display text-body-s font-bold ${across ? "bg-secondarySubtle text-secondary" : "bg-primaryTint text-navy"}`}
        >
          {initials(expert.person.name)}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-heading-xxs font-semibold">{expert.person.name}</h3>
          <p className="truncate text-body-xs text-textMuted">
            {expert.person.role} · {expert.person.team}
          </p>
        </div>
      </div>

      <p className="text-body-s text-text">{expert.reason}</p>

      <dl className="grid grid-cols-2 gap-3 text-body-xs">
        <div className="rounded-md bg-backgroundAlt p-3">
          <dt className="text-textMuted">Reliability</dt>
          <dd className="font-display text-heading-xs font-bold text-heading tabular-nums">
            {expert.reliability.score}
            <span className="text-body-xs font-medium text-textMuted"> / 100</span>
          </dd>
        </div>
        <div className="rounded-md bg-backgroundAlt p-3">
          {expert.solved_count !== null && expert.solved_count !== undefined ? (
            <>
              <dt className="flex items-center gap-1 text-textMuted">
                <Trophy aria-hidden="true" className="size-3.5" /> Solved
              </dt>
              <dd className="font-display text-heading-xs font-bold text-heading">{plural(expert.solved_count, "case")}</dd>
            </>
          ) : (
            <>
              <dt className="flex items-center gap-1 text-textMuted">
                <Clock aria-hidden="true" className="size-3.5" /> On this client
              </dt>
              <dd className="font-display text-heading-xs font-bold text-heading">{formatHours(expert.hours_on_client) || "–"}</dd>
            </>
          )}
        </div>
      </dl>

      {expert.reliability.reasons.length > 0 && (
        <ul className="space-y-1 text-body-xs text-textMuted">
          {expert.reliability.reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <span aria-hidden="true">–</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {expert.top_documents.length > 0 && (
        <div>
          <h4 className="mb-2 font-sans text-body-xs font-semibold text-textStrong">Top documents</h4>
          <ul className="space-y-2">
            {expert.top_documents.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-2 text-body-xs">
                <span className="min-w-0 text-text">{d.title}</span>
                <TrustBadge trust={d.trust} className="shrink-0" />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto pt-1">
        {mailto ? (
          <a href={mailto} className="link inline-flex items-center gap-2 text-body-s">
            <Mail aria-hidden="true" className="size-4" />
            Connect with an expert
          </a>
        ) : (
          <span className="text-body-xs text-textMuted">No contact details on file</span>
        )}
      </div>
    </article>
  );
}

export function ExpertPair({ record, problem, context }: { record: Expert | null; problem: Expert | null; context?: string }) {
  if (!record && !problem) {
    return <p className="text-body-s text-textMuted">No expert found yet for this record.</p>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {record && <ExpertCard expert={record} context={context} />}
      {problem && <ExpertCard expert={problem} context={context} />}
    </div>
  );
}
