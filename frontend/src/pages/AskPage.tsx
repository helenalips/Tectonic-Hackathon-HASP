import { BookOpen, CircleHelp, MessageSquareText, TriangleAlert, Users } from "lucide-react";
import { Fragment, useId, useState, type FormEvent, type MouseEvent } from "react";
import { api, errorMessage } from "../api/client";
import type { Answer, Citation } from "../api/types";
import { ExpertPair } from "../components/ExpertCard";
import { SectionHeader } from "../components/SectionHeader";
import { SourceList } from "../components/SourceList";
import { ErrorState } from "../components/States";
import { useClientContext } from "./ClientLayout";

const SUGGESTIONS: Record<string, string[]> = {
  "cl-kaneka": ["Which discount did we agree for the pay equity audit?", "What does Kaneka need in the pay gap report?"],
};
const DEFAULT_SUGGESTIONS = ["What changed on this record recently?", "Who owns the payroll set-up?"];

function focusSource(e: MouseEvent<HTMLAnchorElement>, id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.focus({ preventScroll: true });
}

/** Renders plain answer text; "[n]" markers become citation chips that link to the source. Never HTML. */
export function AnswerText({ text, citations }: { text: string; citations: Citation[] }) {
  const byRef = new Map(citations.map((c) => [c.ref, c]));
  const paragraphs = text.split(/\n{2,}/);
  return (
    <div className="space-y-4">
      {paragraphs.map((para, pi) => (
        <p key={pi} className="whitespace-pre-line text-body text-textStrong">
          {para.split(/(\[\d+\])/g).map((part, i) => {
            const m = /^\[(\d+)\]$/.exec(part);
            const cite = m ? byRef.get(Number(m[1])) : undefined;
            if (!m || !cite) return <Fragment key={i}>{part}</Fragment>;
            const target = `source-${cite.ref}`;
            return (
              <a
                key={i}
                href={`#${target}`}
                onClick={(e) => focusSource(e, target)}
                aria-label={`Source ${cite.ref}: ${cite.title}`}
                className="mx-0.5 inline-flex min-w-6 items-center justify-center rounded-full border border-primary bg-primarySubtle px-1.5 align-baseline text-body-xs font-bold text-primaryPressed hover:bg-primaryTint"
              >
                {cite.ref}
              </a>
            );
          })}
        </p>
      ))}
    </div>
  );
}

export function AskPage() {
  const { record } = useClientContext();
  const c = record.client;
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qId = useId();
  const suggestions = SUGGESTIONS[c.id] ?? DEFAULT_SUGGESTIONS;

  async function run(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 3) {
      setError("Ask a question of at least 3 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setAnswer(await api.ask({ client_id: c.id, question: trimmed }));
      setAsked(trimmed);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(question);
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="ask-title" className="card">
        <SectionHeader icon={MessageSquareText} id="ask-title" title="Ask a question" subtitle={`Answers come from the ${c.name} record, with sources and who to ask.`} />
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor={qId} className="sr-only">
              Your question
            </label>
            <textarea
              id={qId}
              className="field min-h-24 text-body"
              placeholder="For example: which discount did we agree?"
              value={question}
              maxLength={1000}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Finding the answer…" : "Ask"}
            </button>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="chip"
                onClick={() => {
                  setQuestion(s);
                  void run(s);
                }}
              >
                <CircleHelp aria-hidden="true" className="size-3.5" />
                {s}
              </button>
            ))}
          </div>
        </form>
      </section>

      {error && <ErrorState message={error} />}

      {answer && (
        <div className="grid gap-6 lg:grid-cols-3" aria-live="polite">
          <div className="space-y-6 lg:col-span-2">
            <section aria-labelledby="answer-title" className="card">
              <SectionHeader
                icon={BookOpen}
                id="answer-title"
                title="Answer"
                subtitle={asked}
              />
              <AnswerText text={answer.answer} citations={answer.citations} />
              {answer.mode === "mock" && (
                <p className="mt-4 text-body-xs text-textMuted">Built from matching record text (offline mode, no language model).</p>
              )}
            </section>

            {answer.uncertainties.length > 0 && (
              <section aria-labelledby="uncertain-title" className="rounded-lg border border-warning-bold border-l-4 bg-warning-subtle p-6">
                <div className="mb-3 flex items-center gap-2">
                  <TriangleAlert aria-hidden="true" className="size-5 text-textStrong" />
                  <h2 id="uncertain-title" className="text-heading-xxs font-semibold">
                    What we're not sure about
                  </h2>
                </div>
                <ul className="list-disc space-y-1 pl-5 text-body-s text-textStrong">
                  {answer.uncertainties.map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
                <a href="#experts-title" className="link mt-3 inline-block text-body-s">
                  Connect with an expert
                </a>
              </section>
            )}

            <section aria-labelledby="experts-title">
              <SectionHeader icon={Users} id="experts-title" title="Who to ask" />
              <ExpertPair record={answer.experts.record_expert} problem={answer.experts.problem_expert} context={`${c.name}: ${asked}`} />
            </section>
          </div>

          <section aria-labelledby="sources-title" className="card self-start">
            <SectionHeader icon={BookOpen} id="sources-title" title="Sources" level={3} subtitle="Open a trust badge to see why" />
            <SourceList citations={answer.citations} />
          </section>
        </div>
      )}
    </div>
  );
}
