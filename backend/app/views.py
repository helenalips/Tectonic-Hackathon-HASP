"""ORM -> response-schema converters shared by every API module."""
from __future__ import annotations

from sqlmodel import Session, select

from app.agents import trust
from app.models import (
    Claim,
    ClaimEvidence,
    Conflict,
    DedupDecision,
    DedupLevel,
    DedupOutcome,
    DocStatus,
    Document,
    DossierItem,
    EvidenceRelation,
    Person,
    Resolution,
)
from app.schemas import (
    ClaimView,
    ConflictView,
    ConsistencyStatus,
    DocRef,
    DossierItemView,
    EvidenceView,
    PersonRef,
)

EXCERPT_LEN = 200


def person_ref(session: Session, person_id: str | None) -> PersonRef:
    p = session.get(Person, person_id) if person_id else None
    if p is None:
        return PersonRef(id=person_id or "", name="Unknown", role="", team="")
    return PersonRef(id=p.id, name=p.name, role=p.role, team=p.team)


def excerpt(text: str, length: int = EXCERPT_LEN) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= length else text[: length - 1].rstrip() + "…"


def doc_ref(session: Session, doc_id: str | None) -> DocRef | None:
    doc = session.get(Document, doc_id) if doc_id else None
    if doc is None:
        return None
    return DocRef(
        id=doc.id,
        title=doc.title,
        excerpt=excerpt(doc.content),
        author=person_ref(session, doc.author_id),
        date=doc.created_at,
    )


def claim_view(session: Session, claim: Claim) -> ClaimView:
    evidence = session.exec(select(ClaimEvidence).where(ClaimEvidence.claim_id == claim.id)).all()
    evidence = sorted(evidence, key=lambda e: (e.relation != EvidenceRelation.origin, e.added_at, e.id))
    views: list[EvidenceView] = []
    for e in evidence:
        doc = session.get(Document, e.document_id)
        views.append(
            EvidenceView(
                document_id=e.document_id,
                title=doc.title if doc else "Unknown document",
                author=person_ref(session, e.author_id),
                added_at=e.added_at,
                relation=e.relation.value,
            )
        )
    return ClaimView(
        id=claim.id,
        key=claim.key,
        value=claim.value,
        unit=claim.unit,
        status=claim.status.value,
        valid_from=claim.valid_from,
        evidence_count=len(views),
        evidence=views,
        trust=trust.claim_trust(session, claim),
    )


def conflict_view(session: Session, conflict: Conflict) -> ConflictView:
    new_claim = session.get(Claim, conflict.new_claim_id) if conflict.new_claim_id else None
    old_claim = session.get(Claim, conflict.existing_claim_id) if conflict.existing_claim_id else None
    return ConflictView(
        id=conflict.id,
        client_id=conflict.client_id,
        scope=conflict.scope.value,
        severity=conflict.severity,
        explanation=conflict.explanation,
        new_claim=claim_view(session, new_claim) if new_claim else None,
        existing_claim=claim_view(session, old_claim) if old_claim else None,
        new_document=doc_ref(session, conflict.new_document_id),
        existing_document=doc_ref(session, conflict.existing_document_id),
        resolution=conflict.resolution.value,
        resolution_note=conflict.resolution_note,
        resolved_by=person_ref(session, conflict.resolved_by) if conflict.resolved_by else None,
        created_at=conflict.created_at,
    )


def dossier_item_view(session: Session, item: DossierItem) -> DossierItemView:
    return DossierItemView(
        id=item.id,
        client_id=item.client_id,
        category=item.category,
        title=item.title,
        description=item.description,
        status=item.status.value,
        resolution=item.resolution,
        created_by=person_ref(session, item.created_by),
        created_at=item.created_at,
        linked_document_ids=list(item.linked_document_ids or []),
    )


def consistency_status(session: Session, client_id: str) -> ConsistencyStatus:
    open_conflicts = len(
        session.exec(
            select(Conflict.id).where(Conflict.client_id == client_id, Conflict.resolution == Resolution.pending)
        ).all()
    )
    duplicate_ids = set(
        session.exec(
            select(Document.id).where(Document.client_id == client_id, Document.status == DocStatus.duplicate)
        ).all()
    )
    # A duplicate document that also confirms a claim is counted once (as the duplicate).
    confirmations = sum(
        1
        for doc_id in session.exec(
            select(ClaimEvidence.document_id)
            .join(Claim, Claim.id == ClaimEvidence.claim_id)
            .where(Claim.client_id == client_id, ClaimEvidence.relation == EvidenceRelation.confirmation)
        ).all()
        if doc_id not in duplicate_ids
    )
    duplicate_docs = len(duplicate_ids)
    decisions = session.exec(
        select(DedupDecision).where(
            DedupDecision.client_id == client_id, DedupDecision.level == DedupLevel.dossier_item
        )
    ).all()
    overridden = {(d.new_ref, d.matched_id) for d in decisions if d.outcome == DedupOutcome.created_anyway}
    linked_items = sum(
        1 for d in decisions if d.outcome == DedupOutcome.linked and (d.new_ref, d.matched_id) not in overridden
    )
    return ConsistencyStatus(
        open_conflicts=open_conflicts,
        open_duplicates=0,
        linked_duplicates=duplicate_docs + confirmations + linked_items,
        consistent=open_conflicts == 0,
    )
