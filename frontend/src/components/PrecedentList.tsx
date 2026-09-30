import { History } from "lucide-react";
import type { Precedent } from "../api/types";
import { CATEGORY_LABEL, formatDate, pct } from "../lib/format";
import { EmptyState } from "./States";
import { Tag } from "./Tag";

/** Solved cases at other clients (data-minimised: pattern, date and expert only). */
export function PrecedentList({ precedents }: { precedents: Precedent[] }) {
  if (precedents.length === 0) {
    return <EmptyState title="No similar cases at other clients" icon={History} />;
  }
  return (
    <ul className="space-y-3">
      {precedents.map((p) => (
        <li key={p.dossier_item_id} className="rounded-md border border-borderSubtle border-l-4 border-l-secondary bg-surface p-4">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-body-xs font-semibold text-secondary">{p.client_label}</span>
            <Tag tone="neutral">{CATEGORY_LABEL[p.category] ?? p.category}</Tag>
            <span className="ml-auto text-body-xs text-textMuted">{pct(p.similarity)} similar</span>
          </div>
          <p className="text-body-s font-semibold text-textStrong">{p.title}</p>
          <p className="mt-1 text-body-s text-text">{p.resolution_summary}</p>
          <p className="mt-2 text-body-xs text-textMuted">
            Solved by {p.expert.name} on {formatDate(p.date)}
          </p>
        </li>
      ))}
    </ul>
  );
}
