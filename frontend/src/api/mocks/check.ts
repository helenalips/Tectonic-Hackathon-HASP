/**
 * Preview engine for POST /check (v2). Deterministic keyword rules over the mock records, so the
 * assistant panel is fully demo-able without a backend. Shapes match backend/app/schemas.py CheckResult.
 * All people, documents and facts are fictional demo data.
 */
import type {
  ApproachWarning,
  Category,
  CheckRequest,
  CheckResult,
  ClientRecord,
  ClientSummary,
  Conflict,
  DimensionStatus,
  DocType,
  Expert,
  HorizontalFinding,
  PersonRef,
  SimilarCase,
  SourceDoc,
  TimelineItem,
} from "../types";
import { emails, good, people, reliabilityById } from "./fixtures";

export interface CheckContext {
  records: Record<string, ClientRecord>;
  conflicts: Conflict[];
  /** Facts that were superseded by "Update the record" during this session. */
  overrides: Set<string>;
}

const SUSPICIOUS = /ignore (all |any )?(previous|prior|above) instructions|disregard (the )?(rules|instructions)|system prompt|you are now/i;

/** Returns the full sentence (exact substring of text) that contains a match for re. */
function sentenceWith(text: string, re: RegExp): string | null {
  const m = re.exec(text);
  if (!m) return null;
  let start = m.index;
  while (start > 0 && !/[.!?\n]/.test(text[start - 1])) start--;
  while (start < m.index && /\s/.test(text[start])) start++;
  let end = m.index + m[0].length;
  while (end < text.length && !/[.!?\n]/.test(text[end])) end++;
  if (end < text.length && /[.!?]/.test(text[end])) end++;
  return text.slice(start, end);
}

function src(record: ClientRecord | undefined, id: string): SourceDoc | null {
  const d: TimelineItem | undefined = record?.timeline.find((x) => x.document_id === id);
  if (!d) return null;
  return { document_id: d.document_id, title: d.title, type: d.type, author: d.author, date: d.date, trust: d.trust, excerpt: d.excerpt };
}

function srcs(record: ClientRecord | undefined, ids: string[]): SourceDoc[] {
  return ids.map((id) => src(record, id)).filter((x): x is SourceDoc => x !== null);
}

function vdoc(id: string, clientLabel: string, type: DocType, title: string, excerpt: string, date: string, author: PersonRef, country = "BE"): SourceDoc {
  return { document_id: id, title, type, author, date, trust: good(country, "Solution confirmed by the client"), excerpt, client_label: clientLabel };
}

// ------------------------------------------------------------------ vertical library (other clients, data-minimised)

const CASES: Record<string, SimilarCase[]> = {
  discount: [
    {
      dossier_item_id: "di-v-disc-chem",
      client_label: "Chemicals · BE",
      category: "commercial",
      title: "Renewal invoiced at full price despite a written loyalty discount",
      resolution_summary: "Credit note within 5 days. The billing rule now reads discounts from the signed offer, not from the rate card.",
      approach: "Invoice from the signed offer, never from the rate card",
      date: "2026-03-02",
      similarity: 0.88,
      status: "resolved",
      solvers: [people.ines, people.jan],
      sources: [vdoc("doc-v-disc-chem", "Chemicals · BE", "solution", "Credit note and billing-rule fix", "Discount taken from the signed offer; rate card no longer used for renewals.", "2026-03-02T10:00:00Z", people.ines)],
    },
    {
      dossier_item_id: "di-v-disc-log",
      client_label: "Logistics · NL",
      category: "commercial",
      title: "Follow-up project billed without the framework discount",
      resolution_summary: "Account manager and billing agreed on one 'commercial terms' fact per client; the invoice template pulls it automatically.",
      approach: "One commercial-terms fact per client, reused by billing",
      date: "2025-11-14",
      similarity: 0.79,
      status: "resolved",
      solvers: [people.daan, people.ines],
      sources: [vdoc("doc-v-disc-log", "Logistics · NL", "note", "Commercial terms fact introduced", "Framework discount stored once; billing reads it for every follow-up.", "2025-11-14T09:00:00Z", people.daan, "NL")],
    },
    {
      dossier_item_id: "di-v-disc-retail",
      client_label: "Retail · BE",
      category: "complaint",
      title: "Client escalated a missing 8% discount on an audit follow-up",
      resolution_summary: "Apology and corrected invoice. Discount scope clarified in writing: audit and all follow-ups.",
      approach: "Clarify discount scope in writing",
      date: "2025-06-20",
      similarity: 0.71,
      status: "resolved",
      solvers: [people.marc],
      sources: [vdoc("doc-v-disc-retail", "Retail · BE", "email", "Corrected invoice and scope confirmation", "The 8% discount applies to the audit and every follow-up in 2025.", "2025-06-20T14:00:00Z", people.marc)],
    },
  ],
  clocking: [
    {
      dossier_item_id: "di-v-clock-hort",
      client_label: "Horticulture · ET",
      category: "feature_request",
      title: "Client declined digital clocking, revisited after a pilot",
      resolution_summary: "Kept the badge terminals. A one-site opt-in pilot 12 months later won approval for the roll-out.",
      approach: "Respect the no; propose a small pilot only at the agreed review date",
      date: "2026-02-10",
      similarity: 0.86,
      status: "resolved",
      solvers: [people.pieter, people.abebe],
      sources: [vdoc("doc-v-clock-hort", "Horticulture · ET", "solution", "Pilot plan: opt-in clocking at one site", "Pilot at one farm, badge terminals stay elsewhere; review after 3 months.", "2026-02-10T09:00:00Z", people.pieter, "ET")],
    },
    {
      dossier_item_id: "di-v-clock-cz",
      client_label: "Manufacturing · CZ",
      category: "complaint",
      title: "Pushing a clocking app after a 'no' damaged the relationship",
      resolution_summary: "Proposal withdrawn with an apology; roadmap review planned instead. Lesson: log the decision and its review date.",
      approach: "Log declined scope with a review date; don't re-propose before it",
      date: "2025-09-03",
      similarity: 0.81,
      status: "resolved",
      solvers: [people.lukas],
      sources: [vdoc("doc-v-clock-cz", "Manufacturing · CZ", "note", "Lessons learned: declined scope", "Re-proposing declined scope within 6 months led to an escalation.", "2025-09-03T09:00:00Z", people.lukas, "CZ")],
    },
    {
      dossier_item_id: "di-v-clock-food",
      client_label: "Food production · BE",
      category: "feature_request",
      title: "Phased time-registration modernisation after an initial refusal",
      resolution_summary: "Started with shift planning only; digital clocking followed at the contract renewal, with a change plan for supervisors.",
      approach: "Phase it: planning first, clocking at renewal",
      date: "2025-04-22",
      similarity: 0.74,
      status: "resolved",
      solvers: [people.pieter, people.noor],
      sources: [vdoc("doc-v-clock-food", "Food production · BE", "solution", "Phased roll-out plan", "Phase 1 shift planning, phase 2 clocking at renewal; supervisors trained first.", "2025-04-22T09:00:00Z", people.noor)],
    },
  ],
  overtime: [
    {
      dossier_item_id: "di-v-ot-hort",
      client_label: "Horticulture · ET",
      category: "payroll_rule",
      title: "Overtime premium: 150% on weekdays vs 200% on rest days",
      resolution_summary: "Separate wage types for weekday (150%) and rest-day (200%) overtime, validated against local labour law.",
      approach: "Separate wage types per overtime kind",
      date: "2026-05-12",
      similarity: 0.9,
      status: "resolved",
      solvers: [people.abebe, people.lotte],
      sources: [vdoc("doc-v-ot-hort", "Horticulture · ET", "solution", "Overtime wage types configured", "Weekday overtime 150%, rest-day overtime 200%; validated with local counsel.", "2026-05-12T09:00:00Z", people.abebe, "ET")],
    },
    {
      dossier_item_id: "di-v-ot-pl",
      client_label: "Manufacturing · PL",
      category: "problem",
      title: "Overtime premium for night shifts calculated twice",
      resolution_summary: "Removed the duplicate night-shift rule; the premium is now calculated once, on top of base pay.",
      approach: "One premium rule, applied on base pay",
      date: "2026-01-28",
      similarity: 0.84,
      status: "resolved",
      solvers: [people.katarzyna],
      sources: [vdoc("doc-v-ot-pl", "Manufacturing · PL", "ticket", "Fix: double night-shift premium", "Duplicate rule removed; retro-correction for 2 pay periods.", "2026-01-28T09:00:00Z", people.katarzyna, "PL")],
    },
    {
      dossier_item_id: "di-v-ot-de",
      client_label: "Logistics · DE",
      category: "payroll_rule",
      title: "Overtime premium not applied to part-timers above contract hours",
      resolution_summary: "Labour-law check: the premium applies above the full-time threshold only. Payroll rule updated and explained to managers.",
      approach: "Check the threshold with labour law before configuring",
      date: "2025-10-07",
      similarity: 0.77,
      status: "resolved",
      solvers: [people.hannah, people.bram],
      sources: [vdoc("doc-v-ot-de", "Logistics · DE", "policy", "Legal note: overtime threshold for part-timers", "Premium due above the full-time weekly threshold, not above contract hours.", "2025-10-07T09:00:00Z", people.hannah, "DE")],
    },
  ],
  paygap: [
    {
      dossier_item_id: "di-cityd-framework",
      client_label: "Consulting · BE",
      category: "feature_request",
      title: "Pay framework and pay gap reporting after a merger",
      resolution_summary: "Competence matrix and salary scale in one system, with automated pay gap calculations instead of manual Excel forecasting.",
      approach: "One system with job architecture and automated calculations",
      date: "2026-04-13",
      similarity: 0.82,
      status: "resolved",
      solvers: [people.sofie],
      sources: [vdoc("doc-cityd-solution", "Consulting · BE", "solution", "Solution: one system for pay framework and pay gap reporting", "Competence matrix and salary scale in one system, automated calculations. Manual Excel forecasting retired.", "2026-04-13T10:00:00Z", people.sofie)],
    },
    {
      dossier_item_id: "di-v-pg-pharma",
      client_label: "Pharma · FR",
      category: "feature_request",
      title: "Pay gap per category of workers doing work of equal value",
      resolution_summary: "Job categories mapped to 6 value bands; adjusted gap reported per band, unadjusted gap company-wide.",
      approach: "Value bands from the job architecture",
      date: "2026-06-30",
      similarity: 0.78,
      status: "resolved",
      solvers: [people.amelie, people.marc],
      sources: [vdoc("doc-v-pg-pharma", "Pharma · FR", "solution", "Equal-value categories for pay gap reporting", "Six value bands; adjusted gap per band.", "2026-06-30T09:00:00Z", people.amelie, "FR")],
    },
    {
      dossier_item_id: "di-gp-consolidation",
      client_label: "Manufacturing · MULTI",
      category: "problem",
      title: "Consolidating pay data from many sources into one reporting layer",
      resolution_summary: "Regional shared service centres feed one payroll data model; reports run from that single source.",
      approach: "One payroll data model as the single source",
      date: "2025-07-10",
      similarity: 0.64,
      status: "resolved",
      solvers: [people.lotte],
      sources: [vdoc("doc-gp-contract", "Manufacturing · MULTI", "contract", "Managed payroll agreement", "One provider for 45 countries, coordinated through regional shared service centres.", "2025-07-10T09:00:00Z", people.lotte, "MULTI")],
    },
  ],
  headcount: [
    {
      dossier_item_id: "di-v-hc-onb",
      client_label: "Manufacturing · HU",
      category: "problem",
      title: "Onboarding headcount higher than the contracted volume",
      resolution_summary: "Contract addendum for the extra employees before the first pay run; price per payslip unchanged.",
      approach: "Addendum before loading extra employees",
      date: "2026-02-18",
      similarity: 0.8,
      status: "resolved",
      solvers: [people.elena, people.daan],
      sources: [vdoc("doc-v-hc-onb", "Manufacturing · HU", "contract", "Contract addendum: volume increase", "Volume raised from 400 to 560 employees before go-live.", "2026-02-18T09:00:00Z", people.elena, "HU")],
    },
  ],
};

// ------------------------------------------------------------------ helpers

function expertFor(p: PersonRef, why: string, solved: number, docs: SourceDoc[]): Expert {
  return {
    person: p,
    kind: "problem_expert",
    reason: why,
    reliability: reliabilityById[p.id] ?? { score: 70, reasons: ["Limited track record"] },
    hours_on_client: null,
    solved_count: solved,
    top_documents: docs.slice(0, 2).map((d) => ({ id: d.document_id, title: d.title, trust: d.trust })),
    contact: emails[p.id] ?? "",
  };
}

function problemExperts(cases: SimilarCase[]): Expert[] {
  const byId = new Map<string, { p: PersonRef; cases: SimilarCase[] }>();
  for (const c of cases) for (const s of c.solvers) {
    const e = byId.get(s.id) ?? { p: s, cases: [] };
    e.cases.push(c);
    byId.set(s.id, e);
  }
  return [...byId.values()]
    .sort((a, b) => b.cases.length - a.cases.length || (reliabilityById[b.p.id]?.score ?? 0) - (reliabilityById[a.p.id]?.score ?? 0))
    .map(({ p, cases: cs }) =>
      expertFor(
        p,
        cs.length > 1
          ? `Solved this at ${cs.length} clients (${cs.map((c) => c.client_label).join(", ")}).`
          : `Solved "${cs[0].title}" at ${cs[0].client_label}.`,
        cs.length + 1,
        cs.flatMap((c) => c.sources),
      ),
    );
}

function fallbackClient(id: string): ClientSummary {
  return { id, name: "This client", country: "BE", sector: "", segment: "mid_market", can_edit: true, open_conflicts: 0, demo_data: true };
}

// ------------------------------------------------------------------ engine

export function runCheck(body: CheckRequest, ctx: CheckContext): CheckResult {
  const text = `${body.text ?? ""}`;
  const record = ctx.records[body.client_id];
  const id = body.client_id;
  const findings: HorizontalFinding[] = [];
  const groups: SimilarCase[][] = [];
  const addCases = (list: SimilarCase[]) => groups.push(list);
  let approach: ApproachWarning | null = null;
  let category: Category | null = null;
  let topic: string | null = null;

  // --- Kaneka: discount vs full price -------------------------------------------------------------
  const fullPrice = /\b(full price|standard rate card|standard rate|list price|no discount)\b/i;
  if (fullPrice.test(text)) {
    category = "commercial";
    topic = "Discount on the pay equity audit";
    addCases(CASES.discount);
    const quote = sentenceWith(text, fullPrice)!;
    if (id === "cl-kaneka" && !ctx.overrides.has("kaneka_discount")) {
      const claim = record?.claims.find((c) => c.key === "discount_pct") ?? null;
      findings.push({
        kind: "conflict",
        key: "discount_pct",
        key_label: "Discount",
        draft_value: "Full price",
        draft_quote: quote,
        record_value: "10% discount on the pay equity audit and its follow-up",
        record_claim: claim,
        sources: srcs(record, ["doc-kan-email", "doc-kan-meeting"]),
        severity: "high",
        explanation: "You write full price, but Jan Peeters promised Kaneka a 10% discount in writing on 14 Mar 2025, and Kaneka HR restated it on 18 Sep 2026.",
        suggested_rewrite: "As agreed, the pay equity audit follow-up is invoiced with your 10% returning-customer discount.",
      });
    } else if (id === "cl-kaneka") {
      findings.push({
        kind: "confirmed",
        key: "price_model",
        key_label: "Price model",
        draft_value: "Full price",
        draft_quote: quote,
        record_value: "Full price (record updated today)",
        record_claim: null,
        sources: srcs(record, ["doc-kan-invoice"]),
        severity: null,
        explanation: "Matches the record: the discount was superseded today.",
        suggested_rewrite: null,
      });
    }
  } else if (id === "cl-kaneka" && /10 ?%|ten percent|discount/i.test(text)) {
    category = "commercial";
    topic = "Discount on the pay equity audit";
    const quote = sentenceWith(text, /10 ?%|ten percent|discount/i)!;
    findings.push({
      kind: "confirmed",
      key: "discount_pct",
      key_label: "Discount",
      draft_value: "10%",
      draft_quote: quote,
      record_value: "10%",
      record_claim: record?.claims.find((c) => c.key === "discount_pct") ?? null,
      sources: srcs(record, ["doc-kan-email", "doc-kan-meeting"]),
      severity: null,
      explanation: "Matches the record · confirmed by 3 documents.",
      suggested_rewrite: null,
    });
    addCases(CASES.discount.slice(0, 2));
  }

  // --- Headcount -----------------------------------------------------------------------------------
  const hc = /\b(\d{3,5})\s+(employees|people|workers|staff)\b/i.exec(text);
  if (hc && (id === "cl-kaneka" || id === "cl-skhitech")) {
    const n = Number(hc[1]);
    const recordN = id === "cl-kaneka" ? 350 : 500;
    const quote = sentenceWith(text, new RegExp(hc[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))!;
    const ids = id === "cl-kaneka" ? ["doc-kan-contract", "doc-kan-kickoff"] : ["doc-sk-contract"];
    if (n === recordN) {
      findings.push({ kind: "confirmed", key: "headcount", key_label: "Headcount", draft_value: String(n), draft_quote: quote, record_value: `${recordN} employees`, record_claim: null, sources: srcs(record, ids), severity: null, explanation: `Matches the record · confirmed by ${ids.length} documents.`, suggested_rewrite: null });
    } else {
      findings.push({
        kind: "conflict",
        key: "headcount",
        key_label: "Headcount",
        draft_value: String(n),
        draft_quote: quote,
        record_value: `${recordN} employees (signed contract)`,
        record_claim: null,
        sources: srcs(record, ids),
        severity: "medium",
        explanation: `You write ${n}, but the signed contract says ${recordN} employees.`,
        suggested_rewrite: quote.replace(hc[1], String(recordN)),
      });
      if (id === "cl-skhitech") addCases(CASES.headcount);
    }
  }

  // --- SK hi-tech: digital clocking was declined ----------------------------------------------------
  const clocking = /\b(digital clocking|clocking app|time[- ]registration|time and attendance|badge terminals?|clock(ing)? in)\b/i;
  if (clocking.test(text)) {
    category = category ?? "feature_request";
    topic = topic ?? "Modernising time registration";
    addCases(CASES.clocking);
    if (id === "cl-skhitech" && !ctx.overrides.has("sk_timereg")) {
      findings.push({
        kind: "conflict",
        key: "time_registration_scope",
        key_label: "Time registration scope",
        draft_value: "Propose digital clocking now",
        draft_quote: sentenceWith(text, clocking)!,
        record_value: "Declined by the client: badge terminals stay until the 2027 review",
        record_claim: record?.claims.find((c) => c.key === "time_registration_scope") ?? null,
        sources: srcs(record, ["doc-sk-timereg-meeting", "doc-sk-timereg-email", "doc-sk-onboarding"]),
        severity: "high",
        explanation: "SK hi-tech explicitly declined modernising time registration on 18 Nov 2025 and asked us not to propose it again before the 2027 review (Katarzyna Wiśniewska, 20 Nov 2025).",
        suggested_rewrite: "As agreed, your existing badge terminals stay in place; we'll put digital clocking on the agenda of the 2027 plant expansion review.",
      });
    }
  }

  // --- Overtime premium ---------------------------------------------------------------------------
  if (/overtime/i.test(text)) {
    category = category ?? "payroll_rule";
    topic = topic ?? "Overtime premium";
    addCases(CASES.overtime);
    const q = sentenceWith(text, /overtime/i)!;
    if (id === "cl-afriflora") {
      findings.push({ kind: "confirmed", key: "overtime_premium", key_label: "Overtime premium", draft_value: "150%", draft_quote: q, record_value: "1.5x on weekdays", record_claim: null, sources: srcs(record, ["doc-af-note"]), severity: null, explanation: "Matches the record, but the source has no owner. Verify before you rely on it.", suggested_rewrite: null });
    } else {
      const pctm = /(\d{3})\s?%/.exec(q);
      findings.push({ kind: "new_fact", key: "overtime_premium", key_label: "Overtime premium", draft_value: pctm ? `${pctm[1]}%` : null, draft_quote: q, record_value: null, record_claim: null, sources: [], severity: null, explanation: "Not in this client's record yet. It will be added as a new fact when you save to the record.", suggested_rewrite: null });
    }
  }

  // --- Pay gap / pay transparency -----------------------------------------------------------------
  const excel = /\b(excel|spreadsheet|manually|manual calculation)\b/i;
  const payGap = /pay gap|pay transparency|equal value/i;
  if (payGap.test(text)) {
    category = category ?? "feature_request";
    topic = topic ?? "Pay gap reporting";
    addCases(CASES.paygap);
    if (excel.test(text)) {
      const q = sentenceWith(text, excel)!;
      approach = {
        explanation: "At 2 comparable clients this problem was solved by calculating the pay gap from one system with a job architecture. Manual Excel calculations were retired there because figures diverged between exports.",
        draft_approach: "Manual Excel calculation from quarterly exports",
        proven_approach: "One system with job architecture and automated calculations (Consulting · BE, Pharma · FR)",
        draft_quote: q,
        suggested_rewrite: "We calculate the adjusted and unadjusted pay gap automatically from one system, combining payroll data with your job architecture, the approach that worked at comparable clients.",
      };
    }
    if (id === "cl-kaneka") {
      const q = sentenceWith(text, payGap)!;
      if (!findings.some((f) => f.draft_quote === q)) {
        findings.push({ kind: "confirmed", key: "pay_gap_request", key_label: "Pay gap report", draft_value: "Adjusted and unadjusted", draft_quote: q, record_value: "Open request: adjusted and unadjusted pay gap per job level", record_claim: null, sources: srcs(record, ["doc-kan-request", "doc-kan-meeting"]), severity: null, explanation: "Matches the open request in the record · confirmed by 2 documents.", suggested_rewrite: null });
      }
    }
  }

  // Vertical stays focused: the primary topic's cases first, other topics only fill up to 4.
  const seen = new Set<string>();
  const primary = [...(groups[0] ?? [])].sort((a, b) => b.similarity - a.similarity);
  const rest = groups.slice(1).flat().sort((a, b) => b.similarity - a.similarity);
  const cases = [...primary, ...rest.slice(0, Math.max(0, 4 - primary.length))].filter((c) => (seen.has(c.dossier_item_id) ? false : (seen.add(c.dossier_item_id), true))).slice(0, 5);

  const conflicts = findings.filter((f) => f.kind === "conflict");
  const confirmed = findings.filter((f) => f.kind === "confirmed");
  const confirmDocs = new Set(confirmed.flatMap((f) => f.sources.map((s) => s.document_id))).size;
  const horizontal: DimensionStatus = conflicts.length
    ? { status: "conflict", headline: `${conflicts.length} ${conflicts.length === 1 ? "inconsistency" : "inconsistencies"} with this client's record` }
    : confirmed.length
      ? { status: "consistent", headline: `Consistent · matches ${confirmDocs || confirmed.length} ${confirmDocs === 1 ? "document" : "documents"}` }
      : findings.length
        ? { status: "info", headline: `${findings.length} new ${findings.length === 1 ? "fact" : "facts"} for this record` }
        : { status: "empty", headline: "Nothing in this draft touches the record yet" };

  const solvers = new Set(cases.flatMap((c) => c.solvers.map((s) => s.id)));
  const clientsN = new Set(cases.map((c) => c.client_label)).size;
  const vertical: DimensionStatus = approach
    ? { status: "conflict", headline: `Differs from the approach that worked at ${clientsN} clients` }
    : cases.length
      ? { status: "info", headline: `${clientsN} ${clientsN === 1 ? "client" : "clients"} solved this · ${solvers.size} ${solvers.size === 1 ? "person" : "people"}` }
      : { status: "empty", headline: "No similar cases at other clients" };

  const suspicious = SUSPICIOUS.test(text);
  const client = record ? { ...record.client, open_conflicts: ctx.conflicts.filter((c) => c.client_id === id && c.resolution === "pending").length } : fallbackClient(id);
  const pe = problemExperts(cases);

  return {
    client,
    detected_category: category,
    topic,
    horizontal,
    horizontal_findings: findings,
    vertical,
    similar_cases: cases,
    approach_warning: approach,
    experts: { record_expert: record?.experts.record_expert ?? null, problem_expert: pe[0] ?? null },
    problem_experts: pe,
    suspicious,
    suspicious_reason: suspicious ? "Contains text that tries to give instructions to the system. It is treated as text only." : null,
    mode: "mock",
  };
}
