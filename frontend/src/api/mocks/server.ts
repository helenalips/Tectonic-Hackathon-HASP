/**
 * In-memory mock backend for VITE_USE_MOCKS=true. Deterministic and stateful per page load:
 * capturing events, resolving conflicts and creating items update the fixtures in memory.
 * Nothing is persisted in the browser.
 */
import type { RawResponse } from "../client";
import type {
  Answer,
  AskRequest,
  Category,
  Citation,
  ClaimView,
  ClientRecord,
  ClientSummary,
  Conflict,
  ConflictResolve,
  CreateAnywayRequest,
  DedupDecision,
  DossierItem,
  EventCreate,
  EventResult,
  Experts,
  Me,
  PersonProfile,
  Precedent,
  Solution,
  SolutionRequest,
  TimelineItem,
} from "../types";
import type { CheckRequest } from "../types";
import * as fx from "./fixtures";
import { runCheck } from "./check";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// Mutable state, fresh per page load.
const state = {
  records: clone(fx.records),
  conflicts: clone(fx.conflicts),
  user: (import.meta.env.VITE_MOCK_AUTOLOGIN === "true" ? fx.demoUsers["sofie@example.com"] : null) as null | (typeof fx.demoUsers)[string],
  seq: 1,
  /** Facts superseded via "Update the record" (read by the preview check engine). */
  overrides: new Set<string>(),
  /** conflict id -> override key applied when it is resolved as updated_record. */
  overrideFor: {} as Record<string, string>,
};

/** Preview engine for /check, also used as the fallback when the real backend has no /check yet. */
export function previewCheck(body: CheckRequest) {
  return runCheck(body, { records: state.records, conflicts: state.conflicts, overrides: state.overrides });
}

const ok = (body: unknown, status = 200): RawResponse => ({ status, body });
const fail = (status: number, detail: string): RawResponse => ({ status, body: { detail } });
const nextId = (prefix: string) => `${prefix}-mock-${state.seq++}`;
const nowIso = () => new Date().toISOString();

function canEdit(clientId: string): boolean {
  const u = state.user;
  if (!u) return false;
  return u.role !== "consultant" || u.assigned.includes(clientId);
}

function summaryFor(record: ClientRecord): ClientSummary {
  const pending = state.conflicts.filter((c) => c.client_id === record.client.id && c.resolution === "pending").length;
  return { ...record.client, can_edit: canEdit(record.client.id), open_conflicts: pending };
}

function recordFor(clientId: string): ClientRecord | null {
  const r = state.records[clientId];
  if (!r) return null;
  const client = summaryFor(r);
  r.consistency.open_conflicts = client.open_conflicts;
  r.consistency.consistent = client.open_conflicts === 0;
  return { ...r, client };
}

function me(): Me {
  const u = state.user!;
  return { user_id: u.user_id, person: u.person, role: u.role, assigned_client_ids: [...u.assigned].sort() };
}

// ------------------------------------------------------------------ events

const SUSPICIOUS = /ignore (all |any )?(previous|prior|above) instructions|disregard (the )?(rules|instructions)|system prompt|you are now/i;

function classify(text: string): Category {
  const t = text.toLowerCase();
  if (/invoice|price|discount|rate card|offer/.test(t)) return "commercial";
  if (/feature|report|would like|need/.test(t)) return "feature_request";
  if (/complain|unhappy|late/.test(t)) return "complaint";
  if (/error|wrong|bug|issue|fails/.test(t)) return "problem";
  if (/rule|overtime|leave|tax/.test(t)) return "payroll_rule";
  return "question";
}

function captureEvent(body: EventCreate): RawResponse {
  const record = state.records[body.client_id];
  if (!record) return fail(404, "Not found");
  if (!canEdit(body.client_id)) return fail(403, "Forbidden");
  if (!body.text || body.text.trim().length < 3) return fail(422, "Invalid");

  const text = body.text;
  const t = text.toLowerCase();
  const isKaneka = body.client_id === "cl-kaneka";
  const docId = nextId("doc");
  const title = body.title?.trim() || text.trim().slice(0, 60);
  const author = state.user!.person;
  const suspicious = SUSPICIOUS.test(text);

  const dedup: DedupDecision[] = [];
  const newClaims: ClaimView[] = [];
  const confirmed: ClaimView[] = [];
  const within: Conflict[] = [];
  const across: Conflict[] = [];
  let precedents: Precedent[] = [];
  let documentStatus: EventResult["document_status"] = "active";
  let dossierItem: DossierItem | null = null;
  let dossierCreated = false;

  if (isKaneka && /full price|rate card|standard rate/.test(t)) {
    const conflict: Conflict = {
      ...clone(fx.kanekaDiscountConflict),
      id: nextId("cf"),
      new_document: { id: docId, title, excerpt: text.slice(0, 300), author, date: nowIso() },
      created_at: nowIso(),
    };
    within.push(conflict);
    state.conflicts.push(conflict);
    state.overrideFor[conflict.id] = "kaneka_discount";
    newClaims.push({ ...clone(fx.kanekaFullPriceClaim), id: nextId("clm"), evidence: [{ document_id: docId, title, author, added_at: nowIso(), relation: "origin" }] });
  } else if (isKaneka && /10 ?%|ten percent|discount/.test(t)) {
    const claim = record.claims.find((c) => c.id === "clm-kan-discount");
    if (claim) {
      claim.evidence.push({ document_id: docId, title, author, added_at: nowIso(), relation: "confirmation" });
      claim.evidence_count = claim.evidence.length;
      confirmed.push(clone(claim));
    }
    const isCopy = /^fwd:|following our call/.test(t.trim());
    if (isCopy) documentStatus = "duplicate";
    dedup.push({
      level: isCopy ? "document" : "claim",
      outcome: "linked",
      matched_id: "doc-kan-email",
      matched_title: "Pay equity audit offer: 10% discount confirmed",
      matched_author: fx.people.jan,
      matched_date: "2025-03-14T15:20:00Z",
      similarity: isCopy ? 0.97 : 1,
      reason: isCopy ? "Same text as an existing email (forwarded copy)" : "Same fact: discount_pct = 10 %",
    });
    record.consistency.linked_duplicates += 1;
  }

  if (body.client_id === "cl-skhitech" && /digital clocking|clocking app|time[- ]registration|badge terminal/.test(t)) {
    const existing = record.timeline.find((d) => d.document_id === "doc-sk-timereg-meeting");
    const conflict: Conflict = {
      id: nextId("cf"),
      client_id: body.client_id,
      scope: "within_record",
      severity: "high",
      explanation: "This proposes digital clocking, but SK hi-tech declined modernising time registration on 18 Nov 2025.",
      new_claim: null,
      existing_claim: record.claims.find((c) => c.key === "time_registration_scope") ?? null,
      new_document: { id: docId, title, excerpt: text.slice(0, 300), author, date: nowIso() },
      existing_document: existing ? { id: existing.document_id, title: existing.title, excerpt: existing.excerpt, author: existing.author, date: existing.date } : null,
      resolution: "pending",
      resolution_note: null,
      resolved_by: null,
      created_at: nowIso(),
    };
    within.push(conflict);
    state.conflicts.push(conflict);
    state.overrideFor[conflict.id] = "sk_timereg";
  }

  if (isKaneka && /pay gap|unadjusted|adjusted/.test(t)) {
    const item = record.dossier_items.find((d) => d.id === "di-kan-paygap");
    if (item) {
      dossierItem = clone(item);
      item.linked_document_ids.push(docId);
      dedup.push({
        level: "dossier_item",
        outcome: "linked",
        matched_id: item.id,
        matched_title: item.title,
        matched_author: item.created_by,
        matched_date: item.created_at,
        similarity: 0.91,
        reason: "Same client, same category (feature request), item still open",
      });
      record.consistency.linked_duplicates += 1;
    }
    precedents = [clone(fx.cityDPrecedent)];
  }

  if (isKaneka && /excel|spreadsheet|manual/.test(t)) {
    const conflict: Conflict = {
      ...clone(fx.kanekaExcelConflict),
      id: nextId("cf"),
      new_document: { id: docId, title, excerpt: text.slice(0, 300), author, date: nowIso() },
      created_at: nowIso(),
    };
    across.push(conflict);
    state.conflicts.push(conflict);
    precedents = [clone(fx.cityDPrecedent), clone(fx.globalPaintPrecedent)];
  }

  if (!dossierItem && documentStatus === "active") {
    dossierItem = {
      id: nextId("di"),
      client_id: body.client_id,
      category: classify(text),
      title,
      description: text.slice(0, 280),
      status: "open",
      resolution: null,
      created_by: author,
      created_at: nowIso(),
      linked_document_ids: [docId],
    };
    dossierCreated = true;
    record.dossier_items.unshift(dossierItem);
  }

  const docTrust = fx.trust(
    {
      recency: [1, "Captured just now"],
      ownership: [1, "Owner set"],
      country_relevance: [1, `Scope matches client country (${record.client.country})`],
      author_expertise: [0.8, "Author works on this record"],
      corroboration: [confirmed.length ? 0.5 : 0, confirmed.length ? "Confirms an existing fact" : "Only 1 document"],
      no_open_conflicts: [within.length || across.length ? 0 : 1, within.length || across.length ? "Touched by an open conflict" : "No open conflicts"],
    },
    { suspicious },
  );

  if (documentStatus === "active") {
    const item: TimelineItem = {
      document_id: docId,
      type: body.type,
      title,
      excerpt: text.slice(0, 300),
      date: nowIso(),
      author,
      owner: author,
      trust: docTrust,
      suspicious,
      suspicious_reason: suspicious ? "Contains text that tries to give instructions to the system. It was stored as text only and no instructions were followed." : null,
      dossier_item_ids: dossierItem ? [dossierItem.id] : [],
      linked_duplicate_count: 0,
      source: "user",
    };
    record.timeline.unshift(item);
  } else {
    const original = record.timeline.find((d) => d.document_id === "doc-kan-email");
    if (original) original.linked_duplicate_count += 1;
  }

  const fresh = recordFor(body.client_id)!;
  const result: EventResult = {
    document_id: docId,
    document_status: documentStatus,
    dossier_item: dossierItem,
    dossier_item_created: dossierCreated,
    new_claims: newClaims,
    confirmed_claims: confirmed,
    dedup,
    conflicts_within_record: within,
    conflicts_across_records: across,
    precedents,
    suspicious,
    suspicious_reason: suspicious ? "Contains text that tries to give instructions to the system. It was stored as text only and no instructions were followed." : null,
    consistency: fresh.consistency,
  };
  return ok(result, 201);
}

function createAnyway(itemId: string, body: CreateAnywayRequest): RawResponse {
  if (!body?.reason || body.reason.trim().length < 10) return fail(422, "Invalid");
  const record = Object.values(state.records).find((r) => r.dossier_items.some((d) => d.id === itemId));
  if (!record) return fail(404, "Not found");
  if (!canEdit(record.client.id)) return fail(403, "Forbidden");
  const original = record.dossier_items.find((d) => d.id === itemId)!;
  original.linked_document_ids = original.linked_document_ids.filter((id) => id !== body.document_id);
  const item: DossierItem = {
    ...clone(original),
    id: nextId("di"),
    title: `${original.title} (separate)`,
    description: body.reason.trim(),
    created_by: state.user!.person,
    created_at: nowIso(),
    linked_document_ids: [body.document_id],
    status: "open",
    resolution: null,
  };
  record.dossier_items.unshift(item);
  record.consistency.linked_duplicates = Math.max(0, record.consistency.linked_duplicates - 1);
  return ok(item, 201);
}

// ------------------------------------------------------------------ conflicts

function resolveConflict(id: string, body: ConflictResolve): RawResponse {
  const c = state.conflicts.find((x) => x.id === id);
  if (!c) return fail(404, "Not found");
  if (c.client_id && !canEdit(c.client_id)) return fail(403, "Forbidden");
  if (!["updated_record", "updated_new_info", "both_valid"].includes(body?.resolution)) return fail(422, "Invalid");
  if (body.resolution === "both_valid" && !body.note?.trim()) return fail(422, "Invalid");
  c.resolution = body.resolution;
  if (body.resolution === "updated_record" && state.overrideFor[c.id]) state.overrides.add(state.overrideFor[c.id]);
  if (body.resolution === "updated_record" && c.id === "cf-kan-discount") state.overrides.add("kaneka_discount");
  c.resolution_note = body.note?.trim() || null;
  c.resolved_by = state.user!.person;
  if (c.client_id) {
    const r = state.records[c.client_id];
    const touched = new Set([c.new_document?.id, c.existing_document?.id]);
    r?.timeline.forEach((d) => {
      if (touched.has(d.document_id)) {
        const f = d.trust.factors.find((x) => x.name === "no_open_conflicts");
        if (f && f.value === 0) {
          f.value = 1;
          f.reason = "Conflict resolved";
          d.trust.score = Math.min(100, d.trust.score + 15);
          d.trust.label = d.trust.score >= 75 ? "Reliable" : d.trust.score >= 50 ? "Verify" : "Uncertain";
        }
      }
    });
  }
  return ok(clone(c));
}

// ------------------------------------------------------------------ ask & solution

function citation(ref: number, record: ClientRecord, docId: string, confirmedBy = 1): Citation | null {
  const d = record.timeline.find((x) => x.document_id === docId);
  if (!d) return null;
  return { ref, document_id: d.document_id, title: d.title, author: d.author, date: d.date, trust: clone(d.trust), confirmed_by: confirmedBy };
}

function ask(body: AskRequest): RawResponse {
  const record = recordFor(body.client_id);
  if (!record) return fail(404, "Not found");
  if (!body.question || body.question.trim().length < 3) return fail(422, "Invalid");
  const q = body.question.toLowerCase();
  const discountOpen = state.conflicts.some((c) => c.id === "cf-kan-discount" && c.resolution === "pending");

  let answer: Answer;
  if (body.client_id === "cl-kaneka" && /discount|price|invoice|10|audit/.test(q)) {
    const cites = [citation(1, record, "doc-kan-email", 3), citation(2, record, "doc-kan-meeting", 3), citation(3, record, "doc-kan-invoice", 1)].filter(Boolean) as Citation[];
    answer = {
      answer:
        "Kaneka Belgium has a 10% discount on the pay equity audit and its follow-up [1]. Jan Peeters confirmed it in writing on 14 Mar 2025, and Kaneka HR restated it in the quarterly review on 18 Sep 2026 [2].\n\n" +
        (discountOpen
          ? "A billing note from 22 Sep 2026 says to invoice full price [3]. That note conflicts with the written agreement and the conflict is still open."
          : "A billing note from 22 Sep 2026 mentioned full price [3]; that conflict has been resolved."),
      citations: cites,
      uncertainties: discountOpen
        ? ["The billing note of 22 Sep 2026 conflicts with the written discount. Resolve the conflict before you invoice.", "The billing note has no owner."]
        : [],
      experts: record.experts,
      mode: "mock",
    };
  } else if (body.client_id === "cl-kaneka" && /pay gap|report|directive|transparency/.test(q)) {
    const cites = [citation(1, record, "doc-kan-request", 2), citation(2, record, "doc-kan-meeting", 3), citation(3, record, "doc-kan-kickoff", 2)].filter(Boolean) as Citation[];
    answer = {
      answer:
        "Kaneka asked for the adjusted and the unadjusted pay gap in one report, per job level [1]. They raised it again in the quarterly review [2].\n\nThe project priorities are data quality, consistent reporting, job architecture and manager readiness [3]. A similar request was solved at CityD-WES group by keeping compensation data in one system with automated calculations.",
      citations: cites,
      uncertainties: ["No document confirms which job levels Kaneka wants in the report."],
      experts: { record_expert: record.experts.record_expert, problem_expert: record.experts.problem_expert },
      mode: "mock",
    };
  } else {
    const docs = record.timeline.slice(0, 2);
    const cites = docs.map((d, i) => citation(i + 1, record, d.document_id)).filter(Boolean) as Citation[];
    answer = {
      answer:
        docs.length > 0
          ? `No document in this record answers that question directly. The most recent documents are "${docs[0].title}" [1]${docs[1] ? ` and "${docs[1].title}" [2]` : ""}.`
          : "No document in this record answers that question.",
      citations: cites,
      uncertainties: ["No document answers this question directly. Connect with an expert before you rely on it."],
      experts: record.experts,
      mode: "mock",
    };
  }
  return ok(answer);
}

function buildSolution(body: SolutionRequest): RawResponse {
  const record = Object.values(state.records).find((r) => r.dossier_items.some((d) => d.id === body?.dossier_item_id));
  if (!record) return fail(404, "Not found");
  if (!canEdit(record.client.id)) return fail(403, "Forbidden");
  const item = record.dossier_items.find((d) => d.id === body.dossier_item_id)!;
  const view = recordFor(record.client.id)!;
  const backedBy: Experts = view.experts;
  let solution: Solution;

  if (item.id === "di-kan-invoice") {
    const pending = state.conflicts.filter((c) => c.id === "cf-kan-discount" && c.resolution === "pending");
    solution = {
      id: nextId("sol"),
      dossier_item_id: item.id,
      document_id: nextId("doc"),
      draft:
        "Invoice the pay equity audit follow-up with the agreed 10% discount.\n\nWhy:\n- Jan Peeters confirmed the discount in writing on 14 Mar 2025, valid for the audit and its follow-up.\n- Kaneka HR restated it on 18 Sep 2026.\n\nNext steps:\n1. Update the billing note to apply the 10% discount.\n2. Tell Kaneka HR the invoice reflects the written agreement.",
      built_on: [citation(1, view, "doc-kan-email", 3), citation(2, view, "doc-kan-meeting", 3)].filter(Boolean) as Citation[],
      backed_by: backedBy,
      consistency_status: {
        within_record: pending.length ? "conflict" : "consistent",
        across_records: "consistent",
        conflict_ids: pending.map((c) => c.id),
        reasons: pending.length ? ["The billing note of 22 Sep 2026 still says full price. Resolve that conflict first."] : [],
      },
      created_at: nowIso(),
    };
  } else {
    const isPayGap = item.id === "di-kan-paygap";
    solution = {
      id: nextId("sol"),
      dossier_item_id: item.id,
      document_id: nextId("doc"),
      draft: isPayGap
        ? "Report the adjusted and unadjusted pay gap from one system, per job level.\n\nApproach:\n1. Map Kaneka's job matrix and Hay levels onto one job architecture.\n2. Load salary and job data into one system instead of separate spreadsheets.\n3. Calculate both pay gaps automatically and review them with HR each quarter.\n\nThis follows the approach that worked at CityD-WES group (13 Apr 2026)."
        : `Proposed answer for "${item.title}".\n\n1. Confirm the facts in this record with the record expert.\n2. Reuse the approach from similar resolved items.\n3. Share the outcome with the client and log it here.`,
      built_on: view.timeline.filter((d) => item.linked_document_ids.includes(d.document_id)).slice(0, 3).map((d, i) => citation(i + 1, view, d.document_id, 2)!),
      backed_by: backedBy,
      consistency_status: { within_record: "consistent", across_records: "consistent", conflict_ids: [], reasons: [] },
      created_at: nowIso(),
    };
  }
  return ok(solution, 201);
}

function person(id: string): RawResponse {
  const p = Object.values(fx.people).find((x) => x.id === id);
  if (!p) return fail(404, "Not found");
  const contributions = Object.values(state.records).flatMap((r) => r.people.filter((c) => c.person.id === id));
  const profile: PersonProfile = {
    person: p,
    domains: [...new Set(contributions.flatMap((c) => c.domains))],
    countries: [],
    reliability: contributions[0]?.reliability ?? { score: 60, reasons: ["Limited track record"] },
    contributions,
  };
  return ok(profile);
}

// ------------------------------------------------------------------ router

const path_delay = (p: string) => (p.startsWith("/check") ? 320 : 220);

export async function mockFetch(method: string, rawPath: string, body?: unknown): Promise<RawResponse> {
  await new Promise((r) => setTimeout(r, path_delay(rawPath)));
  const url = new URL(rawPath, "http://mock.local");
  const path = url.pathname;
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);

  if (method === "POST" && path === "/auth/login") {
    const b = body as { email?: string; password?: string };
    const u = fx.demoUsers[(b?.email ?? "").trim().toLowerCase()];
    if (!u || !b?.password) return fail(401, "Email or password is incorrect");
    state.user = u;
    return ok(me());
  }
  if (path === "/health") return ok({ status: "ok" });
  if (!state.user) return fail(401, "Not authenticated");

  if (method === "POST" && path === "/auth/logout") {
    state.user = null;
    return ok(null, 204);
  }
  if (method === "GET" && path === "/auth/me") return ok(me());

  if (method === "GET" && path === "/clients") {
    return ok(Object.values(state.records).map(summaryFor));
  }
  if (method === "GET" && parts[0] === "clients" && parts.length === 2) {
    const r = recordFor(parts[1]);
    return r ? ok(clone(r)) : fail(404, "Not found");
  }
  if (method === "GET" && parts[0] === "clients" && parts[2] === "experts") {
    const r = recordFor(parts[1]);
    return r ? ok(clone(r.experts)) : fail(404, "Not found");
  }
  if (method === "POST" && path === "/events") return captureEvent(body as EventCreate);
  if (method === "POST" && parts[0] === "dossier-items" && parts[2] === "create-anyway") {
    return createAnyway(parts[1], body as CreateAnywayRequest);
  }
  if (method === "GET" && path === "/conflicts") {
    const clientId = url.searchParams.get("client_id");
    const status = url.searchParams.get("status");
    const list = state.conflicts.filter(
      (c) =>
        (!clientId || c.client_id === clientId) &&
        (!status || (status === "pending" ? c.resolution === "pending" : c.resolution !== "pending")),
    );
    return ok(clone(list));
  }
  if (method === "POST" && parts[0] === "conflicts" && parts[2] === "resolve") {
    return resolveConflict(parts[1], body as ConflictResolve);
  }
  if (method === "GET" && path === "/search/precedents") {
    return ok([clone(fx.cityDPrecedent), clone(fx.globalPaintPrecedent)]);
  }
  if (method === "GET" && parts[0] === "people" && parts[1]) return person(parts[1]);
  if (method === "POST" && path === "/ask") return ask(body as AskRequest);
  if (method === "POST" && path === "/check") {
    const b = body as CheckRequest;
    if (!b?.text || !b.client_id) return fail(422, "Invalid");
    if (!state.records[b.client_id]) return fail(404, "Not found");
    return ok(previewCheck(b));
  }
  if (method === "POST" && path === "/solutions") return buildSolution(body as SolutionRequest);

  return fail(404, "Not found");
}
