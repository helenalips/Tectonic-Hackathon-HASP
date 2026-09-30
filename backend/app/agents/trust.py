"""Explainable trust scores (contracts/schema.md §6). Every factor carries a readable reason.

Deterministic for a fixed `now` (pass `now=` in tests).
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Session, or_, select

from app.models import (
    Claim,
    ClaimEvidence,
    Client,
    Conflict,
    Document,
    EvidenceRelation,
    Person,
    Resolution,
)
from app.schemas import PersonReliability, TrustFactor, TrustScore

WEIGHTS = {
    "recency": 0.20,
    "ownership": 0.15,
    "country_relevance": 0.15,
    "author_expertise": 0.20,
    "corroboration": 0.15,
    "no_open_conflicts": 0.15,
}
SUSPICIOUS_CAP = 40

# Keyword -> domain (schema.md §4), used to decide what a document is about.
_DOMAIN_KEYWORDS: dict[str, tuple[str, ...]] = {
    "commercial": ("discount", "price", "pricing", "invoice", "quote", "fee", "contract", "commercial"),
    "pay_transparency": ("pay gap", "pay equity", "pay transparency", "salary scale", "competence matrix", "equal pay"),
    "payroll": ("payroll", "payslip", "salary payment", "net pay", "gross pay"),
    "hr_system_implementation": ("successfactors", "hr system", "implementation", "go-live", "go live", "hris"),
    "onboarding": ("onboarding", "new joiner", "new hire"),
    "time_management": ("timesheet", "time registration", "attendance", "shift", "time management"),
    "compliance": ("leave", "policy", "compliance", "labour law", "labor law", "regulation", "directive"),
    "multi_country_payroll": ("multi-country", "multiple countries", "cross-border", "global payroll"),
    "change_management": ("change management", "training", "e-learning", "adoption"),
}


def label_for(score: int) -> str:
    if score >= 75:
        return "Reliable"
    if score >= 50:
        return "Verify"
    return "Uncertain"


def _now(now: datetime | None) -> datetime:
    return now or datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _days_ago_text(days: int) -> str:
    if days <= 0:
        return "Updated today"
    if days == 1:
        return "Updated 1 day ago"
    if days < 60:
        return f"Updated {days} days ago"
    if days < 730:
        return f"Updated {days // 30} months ago"
    return f"Updated {days // 365} years ago"


def _recency(updated_at: datetime, now: datetime) -> TrustFactor:
    days = max(0, (now - _aware(updated_at)).days)
    if days <= 90:
        value = 1.0
    elif days >= 3 * 365:
        value = 0.0
    else:
        value = 1.0 - (days - 90) / (3 * 365 - 90)
    return TrustFactor(name="recency", value=round(value, 3), weight=WEIGHTS["recency"], reason=_days_ago_text(days))


def _ownership(session: Session, doc: Document) -> TrustFactor:
    if doc.owner_id:
        owner = session.get(Person, doc.owner_id)
        reason = f"Owner: {owner.name}" if owner else "Owner assigned"
        return TrustFactor(name="ownership", value=1.0, weight=WEIGHTS["ownership"], reason=reason)
    return TrustFactor(name="ownership", value=0.0, weight=WEIGHTS["ownership"], reason="No owner assigned")


def _country(session: Session, doc: Document) -> TrustFactor:
    w = WEIGHTS["country_relevance"]
    client = session.get(Client, doc.client_id) if doc.client_id else None
    scope = doc.country_scope
    noun = "Policy" if doc.type.value == "policy" else "Document"
    if scope == "MULTI":
        return TrustFactor(name="country_relevance", value=1.0, weight=w, reason=f"{noun} applies to all countries")
    if client is None:
        return TrustFactor(name="country_relevance", value=1.0, weight=w, reason="Not client-specific")
    if client.country == "MULTI" or client.country == scope:
        return TrustFactor(name="country_relevance", value=1.0, weight=w, reason=f"{noun} applies to {scope}, matches the client")
    return TrustFactor(
        name="country_relevance", value=0.0, weight=w, reason=f"{noun} applies to {scope}, client is in {client.country}"
    )


def document_domains(doc: Document) -> set[str]:
    text = f"{doc.title} {doc.content}".lower()
    return {d for d, words in _DOMAIN_KEYWORDS.items() if any(w in text for w in words)}


def _expertise(session: Session, doc: Document, now: datetime) -> TrustFactor:
    w = WEIGHTS["author_expertise"]
    author = session.get(Person, doc.author_id)
    rel = person_reliability(session, doc.author_id, now=now)
    topics = document_domains(doc)
    name = author.name if author else "The author"
    if not topics:
        match, match_reason = 0.5, "topic not classified"
    elif author and topics & set(author.domains):
        overlap = sorted(topics & set(author.domains))[0].replace("_", " ")
        match, match_reason = 1.0, f"{name} works in {overlap}"
    else:
        match, match_reason = 0.0, f"{name} is not a specialist in {sorted(topics)[0].replace('_', ' ')}"
    value = 0.5 * match + 0.5 * rel.score / 100
    return TrustFactor(
        name="author_expertise",
        value=round(value, 3),
        weight=w,
        reason=f"{match_reason[0].upper()}{match_reason[1:]}; reliability {rel.score}/100",
    )


def _corroboration(count: int) -> TrustFactor:
    w = WEIGHTS["corroboration"]
    if count >= 3:
        value = 1.0
    elif count == 2:
        value = 0.5
    else:
        value = 0.0
    reason = f"Confirmed by {count} documents" if count >= 2 else "Not confirmed by another document yet"
    return TrustFactor(name="corroboration", value=value, weight=w, reason=reason)


def _conflicts(count: int) -> TrustFactor:
    w = WEIGHTS["no_open_conflicts"]
    if count == 0:
        return TrustFactor(name="no_open_conflicts", value=1.0, weight=w, reason="No open conflicts")
    reason = "1 open conflict" if count == 1 else f"{count} open conflicts"
    return TrustFactor(name="no_open_conflicts", value=0.0, weight=w, reason=reason)


def _combine(factors: list[TrustFactor], suspicious: bool, suspicious_reason: str | None) -> TrustScore:
    score = round(100 * sum(f.value * f.weight for f in factors))
    score = max(0, min(100, score))
    if suspicious and score > SUSPICIOUS_CAP:
        score = SUSPICIOUS_CAP
    if suspicious:
        # TrustScore has no free-text note field: the cap is explained on the first factor.
        cap_reason = "Capped at 40: flagged as suspicious (instruction-like text)"
        first = factors[0]
        factors[0] = TrustFactor(name=first.name, value=first.value, weight=first.weight, reason=f"{first.reason}. {cap_reason}")
    return TrustScore(score=score, label=label_for(score), factors=factors)


def _claim_ids_for_document(session: Session, doc_id: str) -> list[str]:
    return list(session.exec(select(ClaimEvidence.claim_id).where(ClaimEvidence.document_id == doc_id)).all())


def _evidence_count(session: Session, claim_id: str) -> int:
    return len(session.exec(select(ClaimEvidence.id).where(ClaimEvidence.claim_id == claim_id)).all())


def _pending_conflicts(session: Session, doc_ids: list[str], claim_ids: list[str]) -> int:
    conds = []
    if doc_ids:
        conds += [Conflict.new_document_id.in_(doc_ids), Conflict.existing_document_id.in_(doc_ids)]  # type: ignore[union-attr]
    if claim_ids:
        conds += [Conflict.new_claim_id.in_(claim_ids), Conflict.existing_claim_id.in_(claim_ids)]  # type: ignore[union-attr]
    if not conds:
        return 0
    rows = session.exec(select(Conflict.id).where(Conflict.resolution == Resolution.pending, or_(*conds))).all()
    return len(set(rows))


def document_trust(session: Session, doc: Document, now: datetime | None = None) -> TrustScore:
    now = _now(now)
    claim_ids = _claim_ids_for_document(session, doc.id)
    duplicates = session.exec(select(Document.id).where(Document.duplicate_of == doc.id)).all()
    count = 1 + len(duplicates)
    for cid in claim_ids:
        count = max(count, _evidence_count(session, cid))
    factors = [
        _recency(doc.updated_at, now),
        _ownership(session, doc),
        _country(session, doc),
        _expertise(session, doc, now),
        _corroboration(count),
        _conflicts(_pending_conflicts(session, [doc.id], claim_ids)),
    ]
    return _combine(factors, doc.suspicious, doc.suspicious_reason)


def claim_trust(session: Session, claim: Claim, now: datetime | None = None) -> TrustScore:
    """Trust of a fact: most recent evidence document for recency/ownership/country/author, evidence count
    for corroboration, and pending conflicts on the claim itself."""
    now = _now(now)
    evidence = session.exec(select(ClaimEvidence).where(ClaimEvidence.claim_id == claim.id)).all()
    docs = [d for d in (session.get(Document, e.document_id) for e in evidence) if d is not None]
    count = len(evidence)
    open_conflicts = _pending_conflicts(session, [], [claim.id])
    if not docs:
        factors = [
            TrustFactor(name="recency", value=0.0, weight=WEIGHTS["recency"], reason="No source document"),
            TrustFactor(name="ownership", value=0.0, weight=WEIGHTS["ownership"], reason="No owner assigned"),
            TrustFactor(name="country_relevance", value=0.0, weight=WEIGHTS["country_relevance"], reason="No source document"),
            TrustFactor(name="author_expertise", value=0.0, weight=WEIGHTS["author_expertise"], reason="No source document"),
            _corroboration(count),
            _conflicts(open_conflicts),
        ]
        return _combine(factors, False, None)
    # Prefer non-suspicious documents; among those the most recently updated.
    best = max(docs, key=lambda d: (not d.suspicious, _aware(d.updated_at), d.id))
    factors = [
        _recency(best.updated_at, now),
        _ownership(session, best),
        _country(session, best),
        _expertise(session, best, now),
        _corroboration(count),
        _conflicts(open_conflicts),
    ]
    return _combine(factors, all(d.suspicious for d in docs), best.suspicious_reason)


def person_reliability(session: Session, person_id: str, now: datetime | None = None) -> PersonReliability:
    now = _now(now)
    origin_claim_ids = sorted(
        set(
            session.exec(
                select(ClaimEvidence.claim_id).where(
                    ClaimEvidence.author_id == person_id, ClaimEvidence.relation == EvidenceRelation.origin
                )
            ).all()
        )
    )
    n = len(origin_claim_ids)
    if n < 2:
        return PersonReliability(score=60, reasons=["Limited track record"])

    confirmed_ids = set(
        session.exec(
            select(ClaimEvidence.claim_id).where(
                ClaimEvidence.claim_id.in_(origin_claim_ids),  # type: ignore[attr-defined]
                ClaimEvidence.relation == EvidenceRelation.confirmation,
            )
        ).all()
    )
    confirmed = len(confirmed_ids)

    resolved = session.exec(
        select(Conflict).where(
            Conflict.resolution.in_([Resolution.updated_record, Resolution.updated_new_info]),  # type: ignore[attr-defined]
            or_(
                Conflict.new_claim_id.in_(origin_claim_ids),  # type: ignore[union-attr]
                Conflict.existing_claim_id.in_(origin_claim_ids),  # type: ignore[union-attr]
            ),
        )
    ).all()
    overruled: set[str] = set()
    for c in resolved:
        loser = c.existing_claim_id if c.resolution == Resolution.updated_record else c.new_claim_id
        if loser in origin_claim_ids:
            overruled.add(loser)

    docs = session.exec(select(Document.updated_at).where(Document.author_id == person_id)).all()
    recent = sum(1 for u in docs if (now - _aware(u)).days <= 365)
    currency = recent / len(docs) if docs else 0.0

    confirmed_share = confirmed / n
    conflict_share = len(overruled) / n
    score = round(100 * (0.6 * confirmed_share + 0.2 * (1 - conflict_share) + 0.2 * currency))
    reasons = [
        f"{confirmed} of {n} claims later confirmed",
        f"{len(overruled)} of {n} claims overruled in a conflict" if overruled else "No claims overruled in a conflict",
        f"{recent} of {len(docs)} documents updated in the last 12 months" if docs else "No documents authored",
    ]
    return PersonReliability(score=max(0, min(100, score)), reasons=reasons)
