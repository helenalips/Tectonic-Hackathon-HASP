"""Dedup at three levels: documents, claims and dossier items (contracts/schema.md §5).

Repetition is confirmation: a repeated document is linked to the original, a repeated fact adds
evidence to the existing claim, a repeated question is linked to the open dossier item.
All matching is scoped to the SAME client. Cross-client matching never happens here.

Agent functions add/flush but do not commit; the caller (capture / API) owns the transaction.
Nothing in this module logs document content.
"""
from __future__ import annotations

import hashlib
import re
import unicodedata
import uuid
from dataclasses import dataclass
from datetime import date, datetime
from typing import TYPE_CHECKING, Any

from sqlmodel import Session, select

from app import embeddings
from app.config import get_settings
from app.models import (
    Category,
    Claim,
    ClaimEvidence,
    ClaimStatus,
    DedupDecision,
    DedupLevel,
    DedupOutcome,
    DocStatus,
    Document,
    DossierItem,
    EvidenceRelation,
    ItemStatus,
    Person,
)

if TYPE_CHECKING:  # pragma: no cover
    from app.agents.capture import ExtractedClaim


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def fmt_date(value: date | datetime | None) -> str:
    """'14 Mar 2025' style, used in every human-readable explanation."""
    if value is None:
        return "an unknown date"
    return f"{value.day} {value.strftime('%b %Y')}"


def person_name(session: Session, person_id: str | None) -> str:
    if not person_id:
        return "someone"
    p = session.get(Person, person_id)
    return p.name if p else "someone"


# ------------------------------------------------------------------ normalization / hashing

_HEADER_LINE_RE = re.compile(r"^(from|sent|to|cc|bcc|subject|date|van|aan|onderwerp|verzonden)\s*:.*$", re.IGNORECASE)
_SEPARATOR_RE = re.compile(
    r"^-{2,}\s*(forwarded message|original message|doorgestuurd bericht|oorspronkelijk bericht)\s*-{2,}$",
    re.IGNORECASE,
)
_SUBJECT_PREFIX_RE = re.compile(r"^\s*((fwd?|re|tr|aw|wg)\s*:\s*)+", re.IGNORECASE)
_QUOTE_RE = re.compile(r"^(\s*>)+\s?")
_WS_RE = re.compile(r"\s+")
_FORWARD_MARKER_RE = re.compile(r"(^|\n)\s*(fwd?:|-{2,}\s*(forwarded|original) message)", re.IGNORECASE)


def normalize_text(text: str) -> str:
    """NFKC, strip quote markers, forwarded/quoted mail headers and Fwd:/Re: subject lines, lowercase, collapse whitespace."""
    text = unicodedata.normalize("NFKC", text or "")
    kept: list[str] = []
    for raw_line in text.splitlines():
        line = _QUOTE_RE.sub("", raw_line).strip()
        if _SUBJECT_PREFIX_RE.match(line):
            continue  # "Fwd: <subject>" / "Re: <subject>" lines are mail metadata, not content
        if not line or _HEADER_LINE_RE.match(line) or _SEPARATOR_RE.match(line):
            continue
        kept.append(line)
    return _WS_RE.sub(" ", " ".join(kept).lower()).strip()


def content_hash(text: str) -> str:
    return hashlib.sha256(normalize_text(text).encode("utf-8")).hexdigest()


def looks_forwarded(text: str) -> bool:
    """Fwd marker, quoted lines, or a pasted mail header block (From:/Sent:/To:/Subject:)."""
    text = text or ""
    if _FORWARD_MARKER_RE.search(text) or re.search(r"^\s*>", text, re.MULTILINE):
        return True
    headers = sum(1 for line in text.splitlines() if _HEADER_LINE_RE.match(_QUOTE_RE.sub("", line).strip()))
    return headers >= 2


# ------------------------------------------------------------------ results


@dataclass
class DedupMatch:
    matched_id: str
    similarity: float
    reason: str


@dataclass
class ClaimUpsert:
    claim: Claim
    created: bool
    match: DedupMatch | None


# ------------------------------------------------------------------ documents


def find_duplicate_document(session: Session, client_id: str, text: str) -> DedupMatch | None:
    """Return the best active document of the SAME client with the same content (hash or cosine ≥ threshold)."""
    if not client_id:
        return None
    docs = session.exec(
        select(Document).where(Document.client_id == client_id, Document.status == DocStatus.active)
    ).all()
    if not docs:
        return None
    forwarded = looks_forwarded(text)
    h = content_hash(text)
    for d in docs:
        if d.content_hash == h or content_hash(d.content) == h:
            kind = "forwarded copy" if forwarded else "exact copy"
            return DedupMatch(d.id, 1.0, _doc_reason(session, d, kind))

    threshold = get_settings().dedup_document_similarity
    norm = normalize_text(text)
    vectors = embeddings.embed([norm] + [normalize_text(d.content) for d in docs])
    best_doc, best_sim = None, -1.0
    for d, v in zip(docs, vectors[1:]):
        sim = embeddings.cosine(vectors[0], v)
        if sim > best_sim:
            best_doc, best_sim = d, sim
    if best_doc is not None and best_sim >= threshold:
        kind = "forwarded copy" if forwarded else f"{round(best_sim * 100)}% identical"
        return DedupMatch(best_doc.id, round(best_sim, 4), _doc_reason(session, best_doc, kind))
    return None


def _doc_reason(session: Session, doc: Document, kind: str) -> str:
    return f"Same content as '{doc.title}' by {person_name(session, doc.author_id)} on {fmt_date(doc.created_at)} ({kind})"


# ------------------------------------------------------------------ dossier items


def _item_text(item: DossierItem) -> str:
    return f"{item.title}. {item.description}"


def find_open_dossier_item(session: Session, client_id: str, category: Category, text: str) -> DedupMatch | None:
    """Same client + same category + open + cosine ≥ settings.dedup_dossier_similarity on title+description."""
    if not client_id:
        return None
    items = session.exec(
        select(DossierItem).where(
            DossierItem.client_id == client_id,
            DossierItem.category == category,
            DossierItem.status == ItemStatus.open,
        )
    ).all()
    if not items:
        return None
    vectors = embeddings.embed([text] + [_item_text(i) for i in items])
    best, best_sim = None, -1.0
    for item, v in zip(items, vectors[1:]):
        sim = embeddings.cosine(vectors[0], v)
        if sim > best_sim:
            best, best_sim = item, sim
    if best is None or best_sim < get_settings().dedup_dossier_similarity:
        return None
    reason = (
        f"Same {best.category.value.replace('_', ' ')} is already open: '{best.title}', raised by "
        f"{person_name(session, best.created_by)} on {fmt_date(best.created_at)} ({round(best_sim * 100)}% similar)"
    )
    return DedupMatch(best.id, round(best_sim, 4), reason)


# ------------------------------------------------------------------ claims

KEY_LABELS = {
    "discount_pct": "discount",
    "price_model": "price model",
    "headcount": "headcount",
    "headcount_target": "headcount target",
    "go_live_date": "go-live date",
    "payroll_frequency": "payroll frequency",
    "payroll_country": "payroll country",
    "payroll_provider_count": "number of payroll providers",
    "hr_system": "HR system",
    "self_service_status": "self-service status",
    "sla_response_hours": "SLA response time",
    "pay_gap_method": "pay gap method",
    "contact_person": "contact person",
}


def describe_value(key: str, value: str, unit: str | None = None) -> str:
    """Human-readable fact value, e.g. '10%' or '500 employees' or 'full price'."""
    if key == "discount_pct":
        return f"{value}%"
    if key == "price_model":
        return value.replace("_", " ")
    if key == "go_live_date":
        try:
            return fmt_date(date.fromisoformat(value))
        except ValueError:
            return value
    if unit and unit not in ("%",):
        return f"{value} {unit}"
    return value.replace("_", " ")


def _norm_value(value: str) -> str:
    return _WS_RE.sub(" ", unicodedata.normalize("NFKC", str(value))).strip().lower()


def upsert_claim(
    session: Session, client_id: str, extracted: "ExtractedClaim | Any", document: Document, valid_from: date
) -> ClaimUpsert:
    """Link to the existing active claim (confirmation) or create a new claim with its origin evidence."""
    key = extracted.key
    value = _norm_value(extracted.value)
    existing = session.exec(
        select(Claim).where(
            Claim.client_id == client_id, Claim.key == key, Claim.value == value, Claim.status == ClaimStatus.active
        )
    ).first()
    if existing is not None:
        evidence = session.exec(select(ClaimEvidence).where(ClaimEvidence.claim_id == existing.id)).all()
        already = any(e.document_id == document.id for e in evidence)
        if not already:
            session.add(
                ClaimEvidence(
                    id=new_id("ev"),
                    claim_id=existing.id,
                    document_id=document.id,
                    author_id=document.author_id,
                    relation=EvidenceRelation.confirmation,
                )
            )
            session.flush()
        count = len(evidence) + (0 if already else 1)
        origin = next((e for e in evidence if e.relation == EvidenceRelation.origin), None)
        origin_doc = session.get(Document, origin.document_id) if origin else None
        source = (
            f" from '{origin_doc.title}' by {person_name(session, origin_doc.author_id)} on {fmt_date(origin_doc.created_at)}"
            if origin_doc
            else ""
        )
        reason = (
            f"Same fact already on record ({KEY_LABELS.get(key, key)}: {describe_value(key, value, existing.unit)}){source}. "
            f"Counted as a confirmation: now confirmed by {count} documents"
        )
        return ClaimUpsert(existing, False, DedupMatch(existing.id, 1.0, reason))

    claim = Claim(
        id=new_id("clm"),
        client_id=client_id,
        key=key,
        value=value,
        unit=getattr(extracted, "unit", None),
        valid_from=valid_from,
        first_author_id=document.author_id,
        confidence=float(getattr(extracted, "confidence", 1.0) or 1.0),
        status=ClaimStatus.active,
    )
    session.add(claim)
    session.flush()
    session.add(
        ClaimEvidence(
            id=new_id("ev"),
            claim_id=claim.id,
            document_id=document.id,
            author_id=document.author_id,
            relation=EvidenceRelation.origin,
        )
    )
    session.flush()
    return ClaimUpsert(claim, True, None)


# ------------------------------------------------------------------ decisions


def record_decision(
    session: Session,
    *,
    client_id: str,
    level: DedupLevel | str,
    new_ref: str,
    match: DedupMatch,
    user_id: str,
    outcome: DedupOutcome | str = "linked",
    override_reason: str | None = None,
) -> DedupDecision:
    outcome = DedupOutcome(outcome)
    if outcome == DedupOutcome.created_anyway and not (override_reason and override_reason.strip()):
        raise ValueError("override_reason is required when outcome is created_anyway")
    decision = DedupDecision(
        id=new_id("dd"),
        client_id=client_id,
        level=DedupLevel(level),
        new_ref=(new_ref or "")[:200],
        matched_id=match.matched_id,
        similarity=float(max(0.0, min(1.0, match.similarity))),
        reason=match.reason[:500],
        outcome=outcome,
        override_reason=override_reason.strip()[:500] if override_reason else None,
        user_id=user_id,
    )
    session.add(decision)
    session.flush()
    return decision
