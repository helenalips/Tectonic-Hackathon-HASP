/**
 * API types. Mirrors backend/app/schemas.py and contracts/openapi.yaml exactly.
 * Dates are ISO strings on the wire.
 */

export type Category = "feature_request" | "problem" | "question" | "complaint" | "commercial" | "payroll_rule";
export type DocType = "email" | "meeting" | "visit" | "contract" | "onboarding" | "ticket" | "note" | "policy" | "solution";
export type Severity = "high" | "medium" | "low";
export type TrustLabel = "Reliable" | "Verify" | "Uncertain";
export type Role = "consultant" | "lead" | "admin";

export interface PersonRef {
  id: string;
  name: string;
  role: string;
  team: string;
}

export interface Me {
  user_id: string;
  person: PersonRef;
  role: Role | string;
  assigned_client_ids: string[];
}

export type TrustFactorName =
  | "recency"
  | "ownership"
  | "country_relevance"
  | "author_expertise"
  | "corroboration"
  | "no_open_conflicts";

export interface TrustFactor {
  name: TrustFactorName;
  value: number;
  weight: number;
  reason: string;
}

export interface TrustScore {
  score: number;
  label: TrustLabel;
  factors: TrustFactor[];
}

export interface PersonReliability {
  score: number;
  reasons: string[];
}

export interface ClientSummary {
  id: string;
  name: string;
  country: string;
  sector: string;
  segment: string;
  can_edit: boolean;
  open_conflicts: number;
  demo_data: boolean;
}

export interface ConsistencyStatus {
  open_conflicts: number;
  open_duplicates: number;
  linked_duplicates: number;
  consistent: boolean;
}

export interface DocRef {
  id: string;
  title: string;
  excerpt: string;
  author: PersonRef | null;
  date: string | null;
}

export interface TimelineItem {
  document_id: string;
  type: DocType;
  title: string;
  excerpt: string;
  date: string;
  author: PersonRef;
  owner: PersonRef | null;
  trust: TrustScore;
  suspicious: boolean;
  suspicious_reason: string | null;
  dossier_item_ids: string[];
  linked_duplicate_count: number;
  source: string;
}

export interface EvidenceView {
  document_id: string;
  title: string;
  author: PersonRef;
  added_at: string;
  relation: "origin" | "confirmation";
}

export interface ClaimView {
  id: string;
  key: string;
  value: string;
  unit: string | null;
  status: "active" | "superseded";
  valid_from: string;
  evidence_count: number;
  evidence: EvidenceView[];
  trust: TrustScore;
}

export interface PersonContribution {
  person: PersonRef;
  hours: number;
  first_date: string;
  last_date: string;
  domains: string[];
  reliability: PersonReliability;
}

export interface DossierItem {
  id: string;
  client_id: string;
  category: Category;
  title: string;
  description: string;
  status: "open" | "resolved";
  resolution: string | null;
  created_by: PersonRef;
  created_at: string;
  linked_document_ids: string[];
}

export interface TopDocument {
  id: string;
  title: string;
  trust: TrustScore;
}

export interface Expert {
  person: PersonRef;
  kind: "record_expert" | "problem_expert";
  reason: string;
  reliability: PersonReliability;
  hours_on_client: number | null;
  solved_count: number | null;
  top_documents: TopDocument[];
  contact: string;
}

export interface Experts {
  record_expert: Expert | null;
  problem_expert: Expert | null;
}

export interface ClientRecord {
  client: ClientSummary;
  summary: string;
  consistency: ConsistencyStatus;
  timeline: TimelineItem[];
  claims: ClaimView[];
  dossier_items: DossierItem[];
  people: PersonContribution[];
  experts: Experts;
}

export interface Precedent {
  dossier_item_id: string;
  client_label: string;
  category: Category;
  title: string;
  resolution_summary: string;
  date: string;
  expert: PersonRef;
  similarity: number;
}

export type ConflictResolution = "pending" | "updated_record" | "updated_new_info" | "both_valid";

export interface Conflict {
  id: string;
  client_id: string | null;
  scope: "within_record" | "across_records";
  severity: Severity;
  explanation: string;
  new_claim: ClaimView | null;
  existing_claim: ClaimView | null;
  new_document: DocRef | null;
  existing_document: DocRef | null;
  resolution: ConflictResolution;
  resolution_note: string | null;
  resolved_by: PersonRef | null;
  created_at: string;
}

export interface DedupDecision {
  level: "document" | "claim" | "dossier_item";
  outcome: "linked" | "created_anyway";
  matched_id: string;
  matched_title: string;
  matched_author: PersonRef | null;
  matched_date: string | null;
  similarity: number;
  reason: string;
}

export interface Citation {
  ref: number;
  document_id: string;
  title: string;
  author: PersonRef;
  date: string;
  trust: TrustScore;
  confirmed_by: number;
}

export interface Answer {
  answer: string;
  citations: Citation[];
  uncertainties: string[];
  experts: Experts;
  mode: "llm" | "mock";
}

export interface SolutionConsistency {
  within_record: "consistent" | "conflict";
  across_records: "consistent" | "conflict";
  conflict_ids: string[];
  reasons: string[];
}

export interface Solution {
  id: string;
  dossier_item_id: string;
  document_id: string;
  draft: string;
  built_on: Citation[];
  backed_by: Experts;
  consistency_status: SolutionConsistency;
  created_at: string;
}

export interface PersonProfile {
  person: PersonRef;
  domains: string[];
  countries: string[];
  reliability: PersonReliability;
  contributions: PersonContribution[];
}

export interface EventResult {
  document_id: string;
  document_status: "active" | "duplicate";
  dossier_item: DossierItem | null;
  dossier_item_created: boolean;
  new_claims: ClaimView[];
  confirmed_claims: ClaimView[];
  dedup: DedupDecision[];
  conflicts_within_record: Conflict[];
  conflicts_across_records: Conflict[];
  precedents: Precedent[];
  suspicious: boolean;
  suspicious_reason: string | null;
  consistency: ConsistencyStatus;
}

// ------------------------------------------------------------------ requests

export interface LoginRequest {
  email: string;
  password: string;
}

export interface EventCreate {
  client_id: string;
  type: DocType;
  title?: string;
  text: string;
  country_scope?: string;
}

export interface CreateAnywayRequest {
  document_id: string;
  reason: string;
}

export interface ConflictResolve {
  resolution: Exclude<ConflictResolution, "pending">;
  note?: string;
}

export interface AskRequest {
  client_id: string;
  question: string;
}

export interface SolutionRequest {
  dossier_item_id: string;
}

// ------------------------------------------------------------------ v2: live draft check (POST /check)

export type Channel = "email" | "chat" | "note" | "ticket";

export interface SourceDoc {
  document_id: string;
  title: string;
  type: DocType;
  author: PersonRef;
  date: string;
  trust: TrustScore;
  excerpt: string;
  /** Set on vertical sources (data-minimised label of the other client). */
  client_label?: string | null;
}

export type FindingKind = "conflict" | "confirmed" | "new_fact" | "duplicate_document";

/** One statement in the draft, compared with THIS client's record (horizontal dimension). */
export interface HorizontalFinding {
  kind: FindingKind;
  key: string | null;
  key_label: string;
  draft_value: string | null;
  /** Exact substring of the draft text, so the UI can highlight it. */
  draft_quote: string;
  record_value: string | null;
  record_claim: ClaimView | null;
  sources: SourceDoc[];
  severity: Severity | null;
  explanation: string;
  suggested_rewrite: string | null;
}

/** A similar problem at ANOTHER client (vertical dimension). Data-minimised. */
export interface SimilarCase {
  dossier_item_id: string;
  client_label: string;
  category: Category;
  title: string;
  resolution_summary: string;
  approach: string | null;
  date: string;
  similarity: number;
  status: "open" | "resolved";
  solvers: PersonRef[];
  sources: SourceDoc[];
}

export interface ApproachWarning {
  explanation: string;
  draft_approach: string;
  proven_approach: string;
  draft_quote: string | null;
  suggested_rewrite: string | null;
}

export interface DimensionStatus {
  status: "consistent" | "conflict" | "info" | "empty";
  headline: string;
}

export interface CheckRequest {
  client_id: string;
  channel?: Channel;
  subject?: string;
  text: string;
}

export interface CheckResult {
  client: ClientSummary;
  detected_category: Category | null;
  topic: string | null;
  horizontal: DimensionStatus;
  horizontal_findings: HorizontalFinding[];
  vertical: DimensionStatus;
  similar_cases: SimilarCase[];
  approach_warning: ApproachWarning | null;
  experts: Experts;
  /** Everyone who solved this problem elsewhere (can be 3+ people). */
  problem_experts: Expert[];
  suspicious: boolean;
  suspicious_reason: string | null;
  mode: "llm" | "mock";
}

// ------------------------------------------------------------------ v2: richer person profile

export interface SolvedCase {
  dossier_item_id: string;
  client_label: string;
  category: Category;
  title: string;
  date: string;
}

export interface PersonProfileV2 extends PersonProfile {
  title: string;
  location: string;
  languages: string[];
  bio: string;
  years_at_sdworx: number | null;
  solved_cases: SolvedCase[];
  documents: TopDocument[];
  clients_count: number;
  total_hours: number;
}
