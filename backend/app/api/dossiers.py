"""Dossier items: override a dossier-item dedup link ("create anyway"). Reason required, audited."""
from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlmodel import Session, select

from app import embeddings
from app.agents.dedup import DedupMatch, new_id, record_decision
from app.db import get_session
from app.models import DedupDecision, DedupLevel, DedupOutcome, Document, DossierItem, ItemStatus
from app.schemas import CreateAnywayRequest, DossierItemView
from app.security import audit, rbac
from app.security.auth import CurrentUser, get_current_user
from app.views import dossier_item_view

router = APIRouter(tags=["dossiers"])

_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


@router.post("/dossier-items/{item_id}/create-anyway", response_model=DossierItemView, status_code=201)
def create_anyway(
    body: CreateAnywayRequest,
    item_id: str = Path(max_length=40),
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> DossierItemView:
    item = session.get(DossierItem, item_id)
    if item is None:
        raise _NOT_FOUND
    rbac.require_client_write(user, item.client_id)
    doc = session.get(Document, body.document_id)
    if doc is None or doc.client_id != item.client_id:
        raise _NOT_FOUND
    already = session.exec(
        select(DedupDecision).where(
            DedupDecision.client_id == item.client_id,
            DedupDecision.level == DedupLevel.dossier_item,
            DedupDecision.new_ref == doc.id,
            DedupDecision.matched_id == item.id,
            DedupDecision.outcome == DedupOutcome.created_anyway,
        )
    ).first()
    if already is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A separate item was already created")

    new_item = DossierItem(
        id=new_id("di"),
        client_id=item.client_id,
        category=item.category,
        title=doc.title[:200],
        description=doc.content[:4000],
        status=ItemStatus.open,
        created_by=user.person_id,
        linked_document_ids=[doc.id],
    )
    session.add(new_item)
    if doc.id in (item.linked_document_ids or []):
        item.linked_document_ids = [d for d in item.linked_document_ids if d != doc.id]
        session.add(item)

    previous = session.exec(
        select(DedupDecision).where(
            DedupDecision.client_id == item.client_id,
            DedupDecision.level == DedupLevel.dossier_item,
            DedupDecision.new_ref == doc.id,
            DedupDecision.matched_id == item.id,
        )
    ).first()
    similarity = (
        previous.similarity
        if previous
        else embeddings.similarity(f"{item.title}. {item.description}", f"{doc.title}. {doc.content}")
    )
    record_decision(
        session,
        client_id=item.client_id,
        level=DedupLevel.dossier_item,
        new_ref=doc.id,
        match=DedupMatch(
            matched_id=item.id,
            similarity=similarity,
            reason=f"Kept separate from '{item.title}' on request; new item {new_item.id} created",
        ),
        user_id=user.id,
        outcome=DedupOutcome.created_anyway,
        override_reason=body.reason,
    )
    audit.record(
        session,
        user_id=user.id,
        action="create_anyway",
        entity="dossier_item",
        entity_id=new_item.id,
        detail=f"override of {item.id} for {doc.id}",
    )
    session.refresh(new_item)
    return dossier_item_view(session, new_item)
