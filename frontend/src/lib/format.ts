import type { Category, DocType, TrustFactorName } from "../api/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "14 Mar 2025". Accepts ISO date or date-time; returns "" for missing/invalid input. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return "";
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return "";
  return `${Number(m[3])} ${month} ${m[1]}`;
}

export function formatHours(h: number | null | undefined): string {
  if (h === null || h === undefined) return "";
  const rounded = Math.round(h * 10) / 10;
  return `${rounded} h`;
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  feature_request: "Feature request",
  problem: "Problem",
  question: "Question",
  complaint: "Complaint",
  commercial: "Commercial",
  payroll_rule: "Payroll rule",
};

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  email: "Email",
  meeting: "Meeting",
  visit: "Visit",
  contract: "Contract",
  onboarding: "Onboarding",
  ticket: "Ticket",
  note: "Note",
  policy: "Policy",
  solution: "Solution",
};

export const FACTOR_LABEL: Record<TrustFactorName, string> = {
  recency: "Recency",
  ownership: "Ownership",
  country_relevance: "Country relevance",
  author_expertise: "Author expertise",
  corroboration: "Corroboration",
  no_open_conflicts: "No open conflicts",
};

const CLAIM_LABEL: Record<string, string> = {
  discount_pct: "Discount",
  price_model: "Price model",
  headcount: "Headcount",
  headcount_target: "Headcount target",
  go_live_date: "Go-live date",
  payroll_frequency: "Payroll frequency",
  payroll_country: "Payroll country",
  payroll_provider_count: "Payroll providers",
  hr_system: "HR system",
  self_service_status: "Self-service",
  sla_response_hours: "SLA response time",
  pay_gap_method: "Pay gap method",
  contact_person: "Contact person",
};

export function claimLabel(key: string): string {
  return CLAIM_LABEL[key] ?? sentenceCase(key.replace(/_/g, " "));
}

export function claimValue(value: string, unit: string | null): string {
  const v = value.replace(/_/g, " ");
  if (!unit) return sentenceCase(v);
  return unit === "%" ? `${v}%` : `${v} ${unit}`;
}

export function sentenceCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .filter((c) => c === c.toUpperCase())
    .slice(0, 2)
    .join("");
}

/** Only allow plain email addresses into mailto: links. */
export function safeMailto(contact: string, subject: string): string | null {
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(contact)) return null;
  return `mailto:${contact}?subject=${encodeURIComponent(subject)}`;
}
