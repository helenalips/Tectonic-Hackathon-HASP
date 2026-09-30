import { BookOpen, CircleCheck, CircleX, FileCheck, ShieldCheck, Users } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { Solution } from "../api/types";
import { ExpertPair } from "../components/ExpertCard";
import { DimensionLabel, SectionHeader } from "../components/SectionHeader";
import { SourceList } from "../components/SourceList";
import { EmptyState, ErrorState } from "../components/States";
import { CATEGORY_LABEL } from "../lib/format";
import { useClientContext } from "./ClientLayout";

function CheckRow({ ok, label, dimension, reasons }: { ok: boolean; label: string; dimension: "record" | "across"; reasons: string[] }) {
  const Icon = ok ? CircleCheck : CircleX;
  return (
    <li className={`flex gap-3 rounded-md border-l-4 p-4 ${ok ? "border-success-bold bg-success-subtle" : "border-danger-bold bg-danger-subtle"}`}>
      <Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${ok ? "text-success-text" : "text-danger-text"}`} strokeWidth={2.25} />
      <div className="min-w-0">
        <p className="text-body-s font-semibold text-textStrong">
          {label}
          <span className={`ml-2 text-body-xs font-semibold ${ok ? "text-success-text" : "text-danger-text"}`}>{ok ? "Yes" : "No"}</span>
        </p>
        <DimensionLabel dimension={dimension} />
        {!ok && reasons.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-body-s text-textStrong">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export function SolutionPage() {
  const { record, refresh } = useClientContext();
  const c = record.client;
  const [params, setParams] = useSearchParams();
  const items = [...record.dossier_items].sort((a, b) => (a.status === b.status ? 0 : a.status === "open" ? -1 : 1));
  const initial = params.get("item");
  const [itemId, setItemId] = useState(items.some((d) => d.id === initial) ? (initial as string) : (items.find((d) => d.status === "open")?.id ?? ""));
  const [solution, setSolution] = useState<Solution | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectId = useId();

  if (!c.can_edit) return <ErrorState message="You can view this client, but you are not assigned to change it." />;
  if (items.length === 0) {
    return (
      <div className="card">
        <EmptyState title="No dossier items yet">Capture an event first. Questions and requests become dossier items.</EmptyState>
      </div>
    );
  }

  const selected = items.find((d) => d.id === itemId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!itemId) return;
    setBusy(true);
    setError(null);
    setSolution(null);
    try {
      setSolution(await api.buildSolution({ dossier_item_id: itemId }));
      setParams({ item: itemId }, { replace: true });
      refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const cs = solution?.consistency_status;
  const withinOk = cs?.within_record === "consistent";
  const acrossOk = cs?.across_records === "consistent";

  return (
    <div className="space-y-6">
      <section aria-labelledby="builder-title" className="card">
        <SectionHeader icon={FileCheck} id="builder-title" title="Build solution" subtitle="A draft built on this record, backed by two experts and checked for consistency." />
        <form onSubmit={submit} className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor={selectId} className="field-label">
              Dossier item
            </label>
            <select id={selectId} className="field" value={itemId} onChange={(e) => setItemId(e.target.value)}>
              {items.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} · {CATEGORY_LABEL[d.category] ?? d.category}
                  {d.status === "resolved" ? " · resolved" : ""}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary" disabled={busy || !itemId}>
            {busy ? "Building…" : "Build solution"}
          </button>
        </form>
        {selected && <p className="mt-4 text-body-s text-textMuted">{selected.description}</p>}
      </section>

      {error && <ErrorState message={error} />}

      {solution && cs && (
        <div className="space-y-6" aria-live="polite">
          <section aria-labelledby="checks-title" className="card">
            <SectionHeader icon={ShieldCheck} id="checks-title" title="Consistency checks" level={3} />
            <ul className="grid gap-3 md:grid-cols-2">
              <CheckRow ok={withinOk} label="Consistent within this record" dimension="record" reasons={cs.reasons} />
              <CheckRow ok={acrossOk} label="Consistent across clients" dimension="across" reasons={cs.reasons} />
            </ul>
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            <section aria-labelledby="draft-title" className="card lg:col-span-2">
              <SectionHeader icon={FileCheck} id="draft-title" title="Draft" subtitle="Saved as a solution document on this record. Review it before you share it." />
              <div className="whitespace-pre-line rounded-md border border-borderSubtle bg-backgroundAlt p-5 text-body text-textStrong">{solution.draft}</div>
            </section>
            <section aria-labelledby="built-title" className="card self-start">
              <SectionHeader icon={BookOpen} id="built-title" title="Built on" level={3} />
              <SourceList citations={solution.built_on} idPrefix="built-on" />
            </section>
          </div>

          <section aria-labelledby="backed-title">
            <SectionHeader icon={Users} id="backed-title" title="Backed by" />
            <ExpertPair record={solution.backed_by.record_expert} problem={solution.backed_by.problem_expert} context={`${c.name}: ${selected?.title ?? "solution"}`} />
          </section>
        </div>
      )}
    </div>
  );
}
