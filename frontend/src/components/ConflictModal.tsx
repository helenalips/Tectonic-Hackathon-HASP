import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Conflict, ConflictResolve } from "../api/types";
import { ConflictCompare } from "./ConflictCompare";

type Choice = ConflictResolve["resolution"];

const CHOICES: { value: Choice; label: string; hint: string }[] = [
  { value: "updated_record", label: "Update the record", hint: "The new information is correct. The fact in the record is replaced." },
  { value: "updated_new_info", label: "Update my information", hint: "The record is correct. The new information is corrected to match it." },
  { value: "both_valid", label: "Both are valid", hint: "Both facts hold, for example for different scopes or periods. Explain why in a note." },
];

interface Props {
  conflict: Conflict;
  onClose: () => void;
  onResolve: (body: ConflictResolve) => Promise<void>;
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Accessible dialog: labelled, aria-modal, focus trap, Esc closes, focus returns to the trigger. */
export function ConflictModal({ conflict, onClose, onResolve }: Props) {
  const titleId = useId();
  const descId = useId();
  const noteId = useId();
  const noteHintId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noteRequired = choice === "both_valid";
  const canSubmit = choice !== null && (!noteRequired || note.trim().length > 0) && !busy;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!choice) return;
    if (noteRequired && !note.trim()) {
      setError("Add a note to explain why both are valid.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onResolve({ resolution: choice, ...(note.trim() ? { note: note.trim() } : {}) });
    } catch {
      setError("We couldn't save your decision. Try again in a moment.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 p-0 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onKeyDown={onKeyDown}
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-lg bg-surface p-6 shadow-4 sm:rounded-lg"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-heading-s font-bold">
              Resolve this conflict
            </h2>
            <p id={descId} className="mt-1 text-body-s text-textMuted">
              Pick which information is right. Your decision is saved with your name.
            </p>
          </div>
          <button type="button" className="btn-ghost -mr-2 px-2" aria-label="Close" onClick={onClose}>
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <ConflictCompare conflict={conflict} />

        <form onSubmit={submit} className="mt-6 space-y-4">
          <fieldset>
            <legend className="field-label">Your decision</legend>
            <div className="grid gap-2">
              {CHOICES.map((c) => (
                <label
                  key={c.value}
                  className={`flex cursor-pointer gap-3 rounded-md border p-3 transition-colors ${choice === c.value ? "border-primary bg-primarySubtle" : "border-border hover:border-primary"}`}
                >
                  <input
                    type="radio"
                    name="resolution"
                    value={c.value}
                    checked={choice === c.value}
                    onChange={() => {
                      setChoice(c.value);
                      setError(null);
                    }}
                    className="mt-1 size-4 accent-primary"
                  />
                  <span>
                    <span className="block text-body-s font-semibold text-textStrong">{c.label}</span>
                    <span className="block text-body-xs text-textMuted">{c.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor={noteId} className="field-label">
              Note{noteRequired ? " (required)" : " (optional)"}
            </label>
            <textarea
              id={noteId}
              className="field min-h-24"
              value={note}
              maxLength={1000}
              required={noteRequired}
              aria-required={noteRequired}
              aria-describedby={noteHintId}
              onChange={(e) => setNote(e.target.value)}
            />
            <p id={noteHintId} className="mt-1 text-body-xs text-textMuted">
              {noteRequired ? "Explain why both facts hold." : "Add context for your colleagues."}
            </p>
          </div>

          {error && (
            <p role="alert" className="text-body-s text-danger-text">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!canSubmit}>
              {busy ? "Saving…" : "Save decision"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
