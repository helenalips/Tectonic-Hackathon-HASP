import { useId, useState, type FormEvent } from "react";
import type { DedupDecision } from "../api/types";
import { status } from "../theme/tokens";
import { formatDate, pct } from "../lib/format";
import { TONE } from "../lib/tones";
import { STATUS_ICON } from "./icons";

interface Props {
  decision: DedupDecision;
  /** For dossier-item matches: who handles the open item. */
  handledBy?: string;
  canOverride?: boolean;
  /** Called with the reason (≥ 10 characters) when the user asks for a separate item. */
  onCreateAnyway?: (reason: string) => Promise<void>;
}

export function duplicateSentence(d: DedupDecision): string {
  if (d.level === "dossier_item") return "";
  const who = d.matched_author ? ` from ${d.matched_author.name}` : "";
  const when = d.matched_date ? ` on ${formatDate(d.matched_date)}` : "";
  return `Already known in this record, confirmed by ${d.matched_title}${who}${when}. Linked as confirmation.`;
}

/** Explains a duplicate that was linked instead of stored twice. */
export function DuplicateNotice({ decision, handledBy, canOverride = false, onCreateAnyway }: Props) {
  const isItem = decision.level === "dossier_item";
  const meta = isItem ? status.link.duplicate : status.link.confirmed;
  const Icon = STATUS_ICON[meta.icon];
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(decision.outcome === "created_anyway");
  const reasonId = useId();
  const hintId = useId();
  const tooShort = reason.trim().length < 10;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (tooShort || !onCreateAnyway) return;
    setBusy(true);
    setError(null);
    try {
      await onCreateAnyway(reason.trim());
      setDone(true);
      setOpen(false);
    } catch {
      setError("We couldn't create a separate item. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-md border-l-4 p-4 ${TONE[meta.tone].panel}`}>
      <div className="flex gap-3">
        <Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${TONE[meta.tone].icon}`} />
        <div className="min-w-0 flex-1">
          <p className="text-body-s font-semibold text-textStrong">{meta.label}</p>
          <p className="mt-1 text-body-s text-text">
            {isItem
              ? `This question is already open in ${decision.matched_title}${handledBy ? `, handled by ${handledBy}` : ""}.`
              : duplicateSentence(decision)}
          </p>
          <p className="mt-2 text-body-xs text-textMuted">
            {pct(decision.similarity)} similar · {decision.reason}
          </p>

          {isItem && done && <p className="mt-3 text-body-xs font-semibold text-success-text">Created as a separate item.</p>}

          {isItem && !done && canOverride && onCreateAnyway && (
            <div className="mt-3">
              {!open ? (
                <button type="button" className="btn-ghost -ml-3 text-primaryPressed" onClick={() => setOpen(true)}>
                  Create separate item
                </button>
              ) : (
                <form onSubmit={submit} className="space-y-2">
                  <label htmlFor={reasonId} className="field-label">
                    Why is this a separate item?
                  </label>
                  <textarea
                    id={reasonId}
                    className="field min-h-20"
                    value={reason}
                    maxLength={500}
                    required
                    aria-describedby={hintId}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <p id={hintId} className="text-body-xs text-textMuted">
                    At least 10 characters. Your reason is saved in the audit log.
                  </p>
                  {error && <p role="alert" className="text-body-xs text-danger-text">{error}</p>}
                  <div className="flex gap-2">
                    <button type="submit" className="btn-secondary" disabled={tooShort || busy}>
                      {busy ? "Creating…" : "Create separate item"}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
