"""API response/request models, mirroring contracts/openapi.yaml. Shared by all agents; change via orchestrator."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models import Category, DocType, Severity

ClientIdStr = Field(max_length=40, pattern=r"^cl-[a-z0-9-]{1,36}$")


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------- shared views


class PersonRef(BaseModel):
    id: str
    name: str
    role: str
    team: str


class TrustFactor(BaseModel):
    name: Literal["recency", "ownership", "country_relevance", "author_expertise", "corroboration", "no_open_conflicts"]
    value: float = Field(ge=0, le=1)
    weight: float
    reason: str


class TrustScore(BaseModel):
    score: int = Field(ge=0, le=100)
    label: Literal["Reliable", "Verify", "Uncertain"]
    factors: list[TrustFactor]


class PersonReliability(BaseModel):
    score: int = Field(ge=0, le=100)
    reasons: list[str]


class ClientSummary(BaseModel):
    id: str
    name: str
    country: str
    sector: str
    segment: str
    can_edit: bool
    open_conflicts: int
    demo_data: bool = True  # UI shows a "Demo data" tag: internal facts are fictional


class ConsistencyStatus(BaseModel):
    open_conflicts: int
    open_duplicates: int = 0
    linked_duplicates: int
    consistent: bool


class DocRef(BaseModel):
    id: str
    title: str
    excerpt: str = ""
    author: PersonRef | None = None
    date: datetime | None = None


class TimelineItem(BaseModel):
    document_id: str
    type: DocType
    title: str
    excerpt: str = Field(max_length=300)
    date: datetime
    author: PersonRef
    owner: PersonRef | None
    trust: TrustScore
    suspicious: bool
    suspicious_reason: str | None
    dossier_item_ids: list[str]
    linked_duplicate_count: int
    source: str


class EvidenceView(BaseModel):
    document_id: str
    title: str
    author: PersonRef
    added_at: datetime
    relation: Literal["origin", "confirmation"]


class ClaimView(BaseModel):
    id: str
    key: str
    value: str
    unit: str | None
    status: Literal["active", "superseded"]
    valid_from: date
    evidence_count: int
    evidence: list[EvidenceView]
    trust: TrustScore


class PersonContribution(BaseModel):
    person: PersonRef
    hours: float
    first_date: date
    last_date: date
    domains: list[str]
    reliability: PersonReliability


class DossierItemView(BaseModel):
    id: str
    client_id: str
    category: Category
    title: str
    description: str
    status: Literal["open", "resolved"]
    resolution: str | None
    created_by: PersonRef
    created_at: datetime
    linked_document_ids: list[str]


class TopDocument(BaseModel):
    id: str
    title: str
    trust: TrustScore


class Expert(BaseModel):
    person: PersonRef
    kind: Literal["record_expert", "problem_expert"]
    reason: str
    reliability: PersonReliability
    hours_on_client: float | None = None
    solved_count: int | None = None
    top_documents: list[TopDocument] = Field(default_factory=list, max_length=3)
    contact: str


class Experts(BaseModel):
    record_expert: Expert | None
    problem_expert: Expert | None


class ClientRecord(BaseModel):
    client: ClientSummary
    summary: str
    consistency: ConsistencyStatus
    timeline: list[TimelineItem]
    claims: list[ClaimView]
    dossier_items: list[DossierItemView]
    people: list[PersonContribution]
    experts: Experts


class Precedent(BaseModel):
    """Data-minimized: no client figures (schema.md §8)."""

    dossier_item_id: str
    client_label: str
    category: Category
    title: str
    resolution_summary: str
    date: date
    expert: PersonRef
    similarity: float


class ConflictView(BaseModel):
    id: str
    client_id: str | None
    scope: Literal["within_record", "across_records"]
    severity: Severity
    explanation: str
    new_claim: ClaimView | None
    existing_claim: ClaimView | None
    new_document: DocRef | None
    existing_document: DocRef | None
    resolution: Literal["pending", "updated_record", "updated_new_info", "both_valid"]
    resolution_note: str | None
    resolved_by: PersonRef | None
    created_at: datetime


class DedupDecisionView(BaseModel):
    level: Literal["document", "claim", "dossier_item"]
    outcome: Literal["linked", "created_anyway"]
    matched_id: str
    matched_title: str
    matched_author: PersonRef | None
    matched_date: datetime | None
    similarity: float
    reason: str


class Citation(BaseModel):
    ref: int
    document_id: str
    title: str
    author: PersonRef
    date: datetime
    trust: TrustScore
    confirmed_by: int


class Answer(BaseModel):
    answer: str
    citations: list[Citation]
    uncertainties: list[str]
    experts: Experts
    mode: Literal["llm", "mock"]


class SolutionConsistency(BaseModel):
    within_record: Literal["consistent", "conflict"]
    across_records: Literal["consistent", "conflict"]
    conflict_ids: list[str]
    reasons: list[str]


class SolutionView(BaseModel):
    id: str
    dossier_item_id: str
    document_id: str
    draft: str
    built_on: list[Citation]
    backed_by: Experts
    consistency_status: SolutionConsistency
    created_at: datetime


class PersonProfile(BaseModel):
    person: PersonRef
    domains: list[str]
    countries: list[str]
    reliability: PersonReliability
    contributions: list[PersonContribution]


class EventResult(BaseModel):
    document_id: str
    document_status: Literal["active", "duplicate"]
    dossier_item: DossierItemView | None
    dossier_item_created: bool
    new_claims: list[ClaimView]
    confirmed_claims: list[ClaimView]
    dedup: list[DedupDecisionView]
    conflicts_within_record: list[ConflictView]
    conflicts_across_records: list[ConflictView]
    precedents: list[Precedent]
    suspicious: bool
    suspicious_reason: str | None
    consistency: ConsistencyStatus


# ---------------------------------------------------------------- requests (extra fields forbidden)


class EventCreate(Strict):
    client_id: str = ClientIdStr
    type: DocType
    title: str | None = Field(default=None, max_length=200)
    text: str = Field(min_length=3, max_length=20000)
    country_scope: str | None = Field(default=None, max_length=5, pattern=r"^[A-Z]{2}$|^MULTI$")


class CreateAnywayRequest(Strict):
    document_id: str = Field(max_length=40)
    reason: str = Field(min_length=10, max_length=500)


class ConflictResolve(Strict):
    resolution: Literal["updated_record", "updated_new_info", "both_valid"]
    note: str | None = Field(default=None, max_length=1000)


class AskRequest(Strict):
    client_id: str = ClientIdStr
    question: str = Field(min_length=3, max_length=1000)


class SolutionRequest(Strict):
    dossier_item_id: str = Field(max_length=40)


# ---------------------------------------------------------------- live draft check (v2: "assistant in every channel")


class SourceDoc(BaseModel):
    document_id: str
    title: str
    type: DocType
    author: PersonRef
    date: datetime
    trust: TrustScore
    excerpt: str = Field(max_length=400)
    client_label: str | None = None  # set on vertical sources (data-minimized)


class HorizontalFinding(BaseModel):
    """One statement in the draft, compared with THIS client's record (horizontal dimension)."""

    kind: Literal["conflict", "confirmed", "new_fact", "duplicate_document"]
    key: str | None
    key_label: str
    draft_value: str | None
    draft_quote: str  # exact substring of the draft text, so the UI can highlight it
    record_value: str | None
    record_claim: ClaimView | None
    sources: list[SourceDoc]
    severity: Severity | None
    explanation: str
    suggested_rewrite: str | None  # replacement for draft_quote that is consistent with the record


class SimilarCase(BaseModel):
    """A similar problem at ANOTHER client (vertical dimension). Data-minimized."""

    dossier_item_id: str
    client_label: str
    category: Category
    title: str
    resolution_summary: str
    approach: str | None
    date: date
    similarity: float
    status: Literal["open", "resolved"]
    solvers: list[PersonRef]
    sources: list[SourceDoc]


class ApproachWarning(BaseModel):
    explanation: str
    draft_approach: str
    proven_approach: str
    draft_quote: str | None
    suggested_rewrite: str | None


class DimensionStatus(BaseModel):
    status: Literal["consistent", "conflict", "info", "empty"]
    headline: str  # e.g. "1 inconsistency with earlier promises to this client"


class CheckRequest(Strict):
    client_id: str = ClientIdStr
    channel: Literal["email", "chat", "note", "ticket"] = "email"
    subject: str | None = Field(default=None, max_length=200)
    text: str = Field(min_length=1, max_length=20000)


class CheckResult(BaseModel):
    client: ClientSummary
    detected_category: Category | None
    topic: str | None
    horizontal: DimensionStatus
    horizontal_findings: list[HorizontalFinding]
    vertical: DimensionStatus
    similar_cases: list[SimilarCase]
    approach_warning: ApproachWarning | None
    experts: Experts
    problem_experts: list[Expert]  # everyone who solved this problem elsewhere (can be 3+ people)
    suspicious: bool
    suspicious_reason: str | None
    mode: Literal["llm", "mock"]


# ---------------------------------------------------------------- richer person profile (v2)


class SolvedCase(BaseModel):
    dossier_item_id: str
    client_label: str
    category: Category
    title: str
    date: date


class PersonProfileV2(PersonProfile):
    title: str = ""
    location: str = ""
    languages: list[str] = Field(default_factory=list)
    bio: str = ""
    years_at_sdworx: int | None = None
    solved_cases: list[SolvedCase] = Field(default_factory=list)
    documents: list[TopDocument] = Field(default_factory=list)
    clients_count: int = 0
    total_hours: float = 0
