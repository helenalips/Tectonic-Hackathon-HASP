"""Horizontal check: one client's record must never contradict itself (within_record conflicts).

A new claim is compared with the client's OTHER active claims on the same key, or on a key in the
same group (contracts/schema.md §3). Conflicts are persisted with a plain-language explanation that
cites the person, the date and the document. Resolving never deletes anything: the losing claim is
marked superseded with valid_to = today.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.agents.dedup import KEY_LABELS, describe_value, fmt_date, new_id, person_name
from app.models import (
    Claim,
    ClaimEvidence,
    ClaimStatus,
    Conflict,
    ConflictScope,
    Document,
    EvidenceRelation,
    Resolution,
    Severity,
)
from app.schemas import ConflictResolve
from app.security import audit, rbac
from app.security.auth import CurrentUser

KEY_GROUPS: list[frozenset[str]] = [
    frozenset({"discount_pct", "price_model"}),
    frozenset({"headcount", "headcount_target"}),
]
_HIGH = {"discount_pct", "price_model", "invoice_terms_days", "declined_scope"}
_MEDIUM = {
    "headcount", "headcount_target", "go_live_date", "payroll_provider_count", "sla_response_hours",
    "payroll_cutoff_day", "contact_person",
}
# Keys where several different values can be true at once (a client can decline several modules).
_MULTI_VALUED = {"declined_scope"}

_DOC_TYPE_WORDS = {
    "email": "an email",
    "meeting": "a meeting note",
    "visit": "a visit report",
    "contract": "the contract",
    "onboarding": "an onboarding note",
    "ticket": "a ticket",
    "note": "a note",
    "policy": "a policy",
    "solution": "a solution",
}

_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def _related_keys(key: str) -> set[str]:
    keys = {key}
    for group in KEY_GROUPS:
        if key in group:
            keys |= group
    return keys


def _as_float(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def is_conflict(a: Claim, b: Claim) -> bool:
    """True when the two active claims (or claim-like objects with key/value) cannot both be true."""
    if a.key == b.key:
        if a.key in _MULTI_VALUED:
            return False
        if a.value == b.value:
            return False
        fa, fb = _as_float(a.value), _as_float(b.value)
        return not (fa is not None and fb is not None and fa == fb)
    pair = {a.key, b.key}
    if pair == {"discount_pct", "price_model"}:
        price = a if a.key == "price_model" else b
        disc = b if price is a else a
        pct = _as_float(disc.value) or 0.0
        return (price.value == "full_price" and pct > 0) or (price.value == "discounted" and pct == 0)
    # headcount vs headcount_target describe different things: never a conflict with each other.
    return False


_is_conflict = is_conflict  # backwards-compatible private name


def proposal_conflicts(declined: Claim, module: str) -> bool:
    """A draft or document PROPOSING `module` conflicts with an active declined_scope claim for that module."""
    return declined.key == "declined_scope" and declined.value == module


def related_keys(key: str) -> set[str]:
    return _related_keys(key)


def severity_for(key: str) -> Severity:
    if key in _HIGH:
        return Severity.high
    if key in _MEDIUM or key.endswith("_date") or key.endswith("_count"):
        return Severity.medium
    return Severity.low


def evidence_document(session: Session, claim: Claim) -> Document | None:
    """The origin document of a claim (falls back to the most recent evidence)."""
    evidence = session.exec(select(ClaimEvidence).where(ClaimEvidence.claim_id == claim.id)).all()
    if not evidence:
        return None
    origin = next((e for e in evidence if e.relation == EvidenceRelation.origin), None)
    chosen = origin or max(evidence, key=lambda e: e.added_at)
    return session.get(Document, chosen.document_id)


def _explain(session: Session, new: Claim, new_doc: Document, old: Claim, old_doc: Document | None) -> str:
    who = person_name(session, old_doc.author_id if old_doc else old.first_author_id)
    when = fmt_date(old_doc.created_at if old_doc else old.valid_from)
    title = f" ('{old_doc.title}')" if old_doc else ""
    in_writing = " in writing" if old_doc and old_doc.type.value in ("email", "contract") else ""

    if {new.key, old.key} == {"discount_pct", "price_model"}:
        if new.key == "price_model" and new.value == "full_price":
            return f"You're invoicing full price, but {who} promised a {old.value}% discount{in_writing} on {when}{title}."
        if new.key == "discount_pct":
            return (
                f"This {new_doc.type.value} mentions a {new.value}% discount, but {who} recorded "
                f"{describe_value(old.key, old.value)} on {when}{title}."
            )
        return (
            f"This {new_doc.type.value} says the price model is {describe_value(new.key, new.value)}, but {who} "
            f"recorded a {old.value}% discount on {when}{title}."
        )

    label = KEY_LABELS.get(new.key, new.key.replace("_", " "))
    source = _DOC_TYPE_WORDS.get(new_doc.type.value, "a document")
    old_source = f" in {_DOC_TYPE_WORDS.get(old_doc.type.value, 'a document')}" if old_doc else ""
    return (
        f"{source[0].upper()}{source[1:]} says the {label} is {describe_value(new.key, new.value, new.unit)}, "
        f"but {who} recorded {describe_value(old.key, old.value, old.unit)}{old_source} on {when}{title}."
    )


def _pending_pair_exists(session: Session, a_id: str, b_id: str) -> bool:
    rows = session.exec(
        select(Conflict).where(
            Conflict.resolution == Resolution.pending,
            Conflict.scope == ConflictScope.within_record,
            Conflict.new_claim_id.in_([a_id, b_id]),  # type: ignore[union-attr]
            Conflict.existing_claim_id.in_([a_id, b_id]),  # type: ignore[union-attr]
        )
    ).all()
    return any({r.new_claim_id, r.existing_claim_id} == {a_id, b_id} for r in rows)


def check_claim(session: Session, claim: Claim, document: Document) -> list[Conflict]:
    """Persist (flush) a within_record Conflict for every contradicting active claim of the same client."""
    if claim.status != ClaimStatus.active:
        return []
    others = session.exec(
        select(Claim).where(
            Claim.client_id == claim.client_id,
            Claim.status == ClaimStatus.active,
            Claim.id != claim.id,
            Claim.key.in_(sorted(_related_keys(claim.key))),  # type: ignore[attr-defined]
        )
    ).all()
    conflicts: list[Conflict] = []
    for other in others:
        if not is_conflict(claim, other) or _pending_pair_exists(session, claim.id, other.id):
            continue
        other_doc = evidence_document(session, other)
        keys = {claim.key, other.key}
        severity = Severity.high if keys & _HIGH else severity_for(claim.key)
        conflict = Conflict(
            id=new_id("cf"),
            client_id=claim.client_id,
            scope=ConflictScope.within_record,
            new_claim_id=claim.id,
            existing_claim_id=other.id,
            new_document_id=document.id,
            existing_document_id=other_doc.id if other_doc else None,
            severity=severity,
            explanation=_explain(session, claim, document, other, other_doc)[:2000],
        )
        session.add(conflict)
        conflicts.append(conflict)
    if conflicts:
        session.flush()
    return conflicts


def resolve_conflict(session: Session, user: CurrentUser, conflict_id: str, body: ConflictResolve) -> Conflict:
    """Resolve a pending conflict. Supersedes (never deletes) the losing claim. Commits (via audit)."""
    conflict = session.get(Conflict, conflict_id)
    if conflict is None:
        raise _NOT_FOUND
    rbac.require_client_write(user, conflict.client_id)
    if conflict.resolution != Resolution.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This conflict is already resolved")
    note = (body.note or "").strip() or None
    resolution = Resolution(body.resolution)
    if resolution == Resolution.both_valid and not note:
        raise HTTPException(status_code=422, detail="A note is required when both statements are valid")

    today = datetime.now(timezone.utc).date()
    loser_id = None
    if resolution == Resolution.updated_record:
        loser_id = conflict.existing_claim_id
    elif resolution == Resolution.updated_new_info:
        loser_id = conflict.new_claim_id
    losers = [session.get(Claim, loser_id)] if loser_id else []
    if (
        conflict.scope == ConflictScope.across_records
        and resolution == Resolution.updated_new_info
        and conflict.new_document_id
    ):
        # Across records there is no claim pair: "update my information" retires the facts this
        # proposal introduced, so the record falls back in line with the proven approach.
        origin_claim_ids = session.exec(
            select(ClaimEvidence.claim_id).where(
                ClaimEvidence.document_id == conflict.new_document_id,
                ClaimEvidence.relation == EvidenceRelation.origin,
            )
        ).all()
        losers += [session.get(Claim, cid) for cid in origin_claim_ids]
    for loser in losers:
        if loser is not None and loser.status == ClaimStatus.active and loser.client_id == conflict.client_id:
            loser.status = ClaimStatus.superseded
            loser.valid_to = today
            session.add(loser)

    conflict.resolution = resolution
    conflict.resolution_note = note
    conflict.resolved_by = user.person_id
    conflict.resolved_at = datetime.now(timezone.utc)
    session.add(conflict)
    session.flush()
    audit.record(
        session,
        user_id=user.id,
        action="resolve",
        entity="conflict",
        entity_id=conflict.id,
        detail=f"resolution={resolution.value}",
    )
    session.refresh(conflict)
    return conflict
