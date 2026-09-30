import type { CheckResult, ClientRecord, Conflict, SourceDoc, TimelineItem } from "../../api/types";
import { DOC_TYPE_LABEL } from "../../lib/format";

export type DotKind = "conflict" | "confirm" | "neutral";

export interface GridDoc {
  id: string;
  date: string;
  /** Division label shown above the dot (document type or domain). */
  label: string;
  kind: DotKind;
  doc: SourceDoc;
}

export function sourceFromTimeline(d: TimelineItem): SourceDoc {
  return { document_id: d.document_id, title: d.title, type: d.type, author: d.author, date: d.date, trust: d.trust, excerpt: d.excerpt };
}

const RANK: Record<DotKind, number> = { neutral: 0, confirm: 1, conflict: 2 };

function put(map: Map<string, GridDoc>, doc: SourceDoc, kind: DotKind) {
  const prev = map.get(doc.document_id);
  if (prev && RANK[prev.kind] >= RANK[kind]) return;
  map.set(doc.document_id, { id: doc.document_id, date: doc.date, label: DOC_TYPE_LABEL[doc.type] ?? doc.type, kind, doc });
}

/** Row dots for a live check: sources of conflicts are red, of confirmations green-ringed, the rest of the record blue. */
export function docsFromCheck(result: CheckResult | null, timeline: TimelineItem[] = []): GridDoc[] {
  const map = new Map<string, GridDoc>();
  timeline.forEach((d) => put(map, sourceFromTimeline(d), "neutral"));
  result?.horizontal_findings.forEach((f) => {
    const kind: DotKind = f.kind === "conflict" ? "conflict" : f.kind === "confirmed" || f.kind === "duplicate_document" ? "confirm" : "neutral";
    f.sources.forEach((s) => put(map, s, kind));
  });
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Row dots for a client record: docs touched by an open conflict are red, corroborated docs green-ringed. */
export function docsFromRecord(record: ClientRecord, conflicts: Conflict[]): GridDoc[] {
  const touched = new Set(conflicts.filter((c) => c.resolution === "pending").flatMap((c) => [c.new_document?.id, c.existing_document?.id]));
  return record.timeline
    .map((d) => {
      const corroborated = d.linked_duplicate_count > 0 || (d.trust.factors.find((f) => f.name === "corroboration")?.value ?? 0) >= 0.5;
      const kind: DotKind = touched.has(d.document_id) ? "conflict" : corroborated ? "confirm" : "neutral";
      return { id: d.document_id, date: d.date, label: DOC_TYPE_LABEL[d.type] ?? d.type, kind, doc: sourceFromTimeline(d) };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Heuristic from the brief: a greeting or > 200 characters means "this is an email draft", not a question. */
export function looksLikeDraft(text: string): boolean {
  const t = text.trim();
  return t.length > 200 || /^(dear|hi|hello|hey|good (morning|afternoon)|beste|hallo|bonjour)\b/i.test(t) || /\n\s*(kind regards|best regards|regards|thanks)/i.test(t);
}
