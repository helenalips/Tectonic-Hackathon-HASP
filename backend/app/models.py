"""SQLModel tables implementing contracts/schema.md. Change only via the orchestrator."""
from datetime import date, datetime, timezone
from enum import Enum

from sqlalchemy import JSON, Column, Index, text
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, Enum):
    consultant = "consultant"
    lead = "lead"
    admin = "admin"


class Segment(str, Enum):
    mid_market = "mid_market"
    enterprise = "enterprise"
    global_ = "global"


class DocType(str, Enum):
    email = "email"
    meeting = "meeting"
    visit = "visit"
    contract = "contract"
    onboarding = "onboarding"
    ticket = "ticket"
    note = "note"
    policy = "policy"
    solution = "solution"


class DocStatus(str, Enum):
    active = "active"
    superseded = "superseded"
    draft = "draft"
    duplicate = "duplicate"


class Source(str, Enum):
    mock = "mock"
    generated = "generated"
    sdworx_public = "sdworx_public"
    user = "user"


class Category(str, Enum):
    feature_request = "feature_request"
    problem = "problem"
    question = "question"
    complaint = "complaint"
    commercial = "commercial"
    payroll_rule = "payroll_rule"


class ItemStatus(str, Enum):
    open = "open"
    resolved = "resolved"


class ClaimStatus(str, Enum):
    active = "active"
    superseded = "superseded"


class EvidenceRelation(str, Enum):
    origin = "origin"
    confirmation = "confirmation"


class ConflictScope(str, Enum):
    within_record = "within_record"
    across_records = "across_records"


class Severity(str, Enum):
    high = "high"
    medium = "medium"
    low = "low"


class Resolution(str, Enum):
    pending = "pending"
    updated_record = "updated_record"
    updated_new_info = "updated_new_info"
    both_valid = "both_valid"


class DedupLevel(str, Enum):
    document = "document"
    claim = "claim"
    dossier_item = "dossier_item"


class DedupOutcome(str, Enum):
    linked = "linked"
    created_anyway = "created_anyway"


# --------------------------------------------------------------------------- tables


class Person(SQLModel, table=True):
    id: str = Field(primary_key=True, max_length=40)
    name: str = Field(max_length=120)
    role: str = Field(max_length=120)
    team: str = Field(max_length=120)
    email: str = Field(max_length=254)
    domains: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    countries: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    source: Source = Source.generated


class User(SQLModel, table=True):
    id: str = Field(primary_key=True, max_length=40)
    person_id: str = Field(foreign_key="person.id", max_length=40)
    email: str = Field(unique=True, index=True, max_length=254)
    password_hash: str = Field(max_length=100)
    role: Role


class Client(SQLModel, table=True):
    id: str = Field(primary_key=True, max_length=40)
    name: str = Field(max_length=200)
    country: str = Field(max_length=5)
    sector: str = Field(max_length=120)
    segment: Segment
    summary: str = Field(default="", max_length=4000)
    source: Source = Source.mock


class ClientAssignment(SQLModel, table=True):
    user_id: str = Field(foreign_key="user.id", primary_key=True, max_length=40)
    client_id: str = Field(foreign_key="client.id", primary_key=True, max_length=40)


class Document(SQLModel, table=True):
    id: str = Field(primary_key=True, max_length=40)
    client_id: str | None = Field(default=None, foreign_key="client.id", index=True, max_length=40)
    type: DocType
    title: str = Field(max_length=200)
    content: str = Field(max_length=20000)
    content_hash: str = Field(index=True, max_length=64)
    author_id: str = Field(foreign_key="person.id", max_length=40)
    owner_id: str | None = Field(default=None, foreign_key="person.id", max_length=40)
    country_scope: str = Field(max_length=5)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    status: DocStatus = DocStatus.active
    duplicate_of: str | None = Field(default=None, foreign_key="document.id", max_length=40)
    suspicious: bool = False
    suspicious_reason: str | None = Field(default=None, max_length=300)
    source: Source = Source.generated


class DossierItem(SQLModel, table=True):
    id: str = Field(primary_key=True, max_length=40)
    client_id: str = Field(foreign_key="client.id", index=True, max_length=40)
    category: Category
    title: str = Field(max_length=200)
    description: str = Field(max_length=4000)
    status: ItemStatus = ItemStatus.open
    resolution: str | None = Field(default=None, max_length=4000)
    created_by: str = Field(foreign_key="person.id", max_length=40)
    created_at: datetime = Field(default_factory=utcnow)
    linked_document_ids: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))


class Claim(SQLModel, table=True):
    __table_args__ = (
        # Invariant: one active row per (client, key, value). Dedup must link instead of insert.
        Index(
            "uq_active_claim",
            "client_id",
            "key",
            "value",
            unique=True,
            sqlite_where=text("status = 'active'"),
        ),
    )
    id: str = Field(primary_key=True, max_length=40)
    client_id: str = Field(foreign_key="client.id", index=True, max_length=40)
    key: str = Field(max_length=60)
    value: str = Field(max_length=200)
    unit: str | None = Field(default=None, max_length=30)
    valid_from: date
    valid_to: date | None = None
    first_author_id: str = Field(foreign_key="person.id", max_length=40)
    confidence: float = 1.0
    status: ClaimStatus = ClaimStatus.active


class ClaimEvidence(SQLModel, table=True):
    id: str = Field(primary_key=True, max_length=40)
    claim_id: str = Field(foreign_key="claim.id", index=True, max_length=40)
    document_id: str = Field(foreign_key="document.id", max_length=40)
    author_id: str = Field(foreign_key="person.id", max_length=40)
    added_at: datetime = Field(default_factory=utcnow)
    relation: EvidenceRelation


class Conflict(SQLModel, table=True):
    id: str = Field(primary_key=True, max_length=40)
    client_id: str | None = Field(default=None, foreign_key="client.id", index=True, max_length=40)
    scope: ConflictScope
    new_claim_id: str | None = Field(default=None, foreign_key="claim.id", max_length=40)
    existing_claim_id: str | None = Field(default=None, foreign_key="claim.id", max_length=40)
    new_document_id: str | None = Field(default=None, foreign_key="document.id", max_length=40)
    existing_document_id: str | None = Field(default=None, foreign_key="document.id", max_length=40)
    severity: Severity
    explanation: str = Field(max_length=2000)
    resolution: Resolution = Resolution.pending
    resolution_note: str | None = Field(default=None, max_length=1000)
    resolved_by: str | None = Field(default=None, foreign_key="person.id", max_length=40)
    created_at: datetime = Field(default_factory=utcnow)
    resolved_at: datetime | None = None


class Contribution(SQLModel, table=True):
    person_id: str = Field(foreign_key="person.id", primary_key=True, max_length=40)
    client_id: str = Field(foreign_key="client.id", primary_key=True, max_length=40)
    hours: float
    first_date: date
    last_date: date


class Solution(SQLModel, table=True):
    id: str = Field(primary_key=True, max_length=40)
    dossier_item_id: str = Field(foreign_key="dossieritem.id", max_length=40)
    document_id: str = Field(foreign_key="document.id", max_length=40)
    draft: str = Field(max_length=20000)
    based_on_document_ids: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    record_expert_id: str | None = Field(default=None, foreign_key="person.id", max_length=40)
    problem_expert_id: str | None = Field(default=None, foreign_key="person.id", max_length=40)
    consistency_status: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utcnow)


class DedupDecision(SQLModel, table=True):
    id: str = Field(primary_key=True, max_length=40)
    client_id: str = Field(foreign_key="client.id", index=True, max_length=40)
    level: DedupLevel
    new_ref: str = Field(max_length=200)
    matched_id: str = Field(max_length=40)
    similarity: float
    reason: str = Field(max_length=500)
    outcome: DedupOutcome = DedupOutcome.linked
    override_reason: str | None = Field(default=None, max_length=500)
    user_id: str = Field(foreign_key="user.id", max_length=40)
    created_at: datetime = Field(default_factory=utcnow)


class AuditLog(SQLModel, table=True):
    """Append-only. Only app.security.audit.record() writes here; nothing updates or deletes."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: str | None = Field(default=None, max_length=40)
    action: str = Field(max_length=40)
    entity: str = Field(max_length=40)
    entity_id: str | None = Field(default=None, max_length=40)
    timestamp: datetime = Field(default_factory=utcnow)
    detail: str | None = Field(default=None, max_length=300)
