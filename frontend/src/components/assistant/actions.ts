import { api } from "../../api/client";
import type { DocType, HorizontalFinding } from "../../api/types";

/**
 * "Update the record": the draft becomes the new truth. Saves it as a document (POST /events) and resolves
 * the within-record conflict it raises as updated_record. Returns the name of the superseded author.
 */
export async function updateRecordFromDraft(args: { clientId: string; text: string; subject?: string; type?: DocType; finding: HorizontalFinding }): Promise<{ superseded: string | null; resolved: boolean }> {
  const { clientId, text, subject, type = "email", finding } = args;
  const ev = await api.createEvent({ client_id: clientId, type, text, ...(subject?.trim() ? { title: subject.trim().slice(0, 200) } : {}) });
  const cf = ev.conflicts_within_record.find((c) => c.resolution === "pending") ?? null;
  if (cf) {
    await api.resolveConflict(cf.id, { resolution: "updated_record", note: `Updated from the TrustGrid assistant (${finding.key_label}).` });
  }
  return { superseded: finding.sources[0]?.author.name ?? null, resolved: cf !== null };
}

/** Replaces the first occurrence of quote in text (exact, then case-insensitive). */
export function replaceQuote(text: string, quote: string, rewrite: string): string {
  const i = text.indexOf(quote);
  if (i >= 0) return text.slice(0, i) + rewrite + text.slice(i + quote.length);
  const j = text.toLowerCase().indexOf(quote.toLowerCase());
  if (j >= 0) return text.slice(0, j) + rewrite + text.slice(j + quote.length);
  return text;
}
