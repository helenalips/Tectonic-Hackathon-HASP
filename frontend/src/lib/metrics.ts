import type { ClientRecord } from "../api/types";

/** Average trust over the documents in the record timeline (0-100). */
export function recordTrust(record: ClientRecord): number | null {
  const docs = record.timeline;
  if (docs.length === 0) return null;
  return Math.round(docs.reduce((s, d) => s + d.trust.score, 0) / docs.length);
}

/** Share of active facts confirmed by at least 2 documents (0-1). */
export function factsConfirmedShare(record: ClientRecord): number | null {
  const active = record.claims.filter((c) => c.status === "active");
  if (active.length === 0) return null;
  return active.filter((c) => c.evidence_count >= 2).length / active.length;
}

/** Share of documents rated Reliable (0-1). */
export function reliableDocsShare(record: ClientRecord): number | null {
  if (record.timeline.length === 0) return null;
  return record.timeline.filter((d) => d.trust.score >= 75).length / record.timeline.length;
}
