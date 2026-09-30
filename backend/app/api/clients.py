"""Client list, the horizontal client record, and the experts behind it."""
import re

from fastapi import APIRouter, Depends, Path, Query
from sqlmodel import Session, func, select

from app.agents import experts as ex
from app.agents import trust
from app.db import get_session
from app.models import (
    Category,
    Claim,
    ClaimStatus,
    Client,
    Conflict,
    Contribution,
    DocStatus,
    Document,
    DossierItem,
    Person,
    Resolution,
)
from app.schemas import ClientRecord, ClientSummary, Experts, PersonContribution, TimelineItem
from app.security import audit, rbac
from app.security.auth import CurrentUser, get_current_user

router = APIRouter(prefix="/clients", tags=["clients"])

ClientIdPath = Path(max_length=40, pattern=r"^cl-[a-z0-9-]{1,36}$")


def _open_conflicts(session: Session, client_id: str) -> int:
    return session.exec(
        select(func.count())
        .select_from(Conflict)
        .where(Conflict.client_id == client_id, Conflict.resolution == Resolution.pending)
    ).one()


def _summary(session: Session, user: CurrentUser, c: Client) -> ClientSummary:
    return ClientSummary(
        id=c.id,
        name=c.name,
        country=c.country,
        sector=c.sector,
        segment=c.segment.value,
        can_edit=rbac.can_write_client(user, c.id),
        open_conflicts=_open_conflicts(session, c.id),
        demo_data=True,
    )


def _excerpt(text: str) -> str:
    flat = re.sub(r"\s+", " ", text).strip()
    return flat if len(flat) <= 280 else flat[:277] + "..."


def person_contribution(session: Session, c: Contribution) -> PersonContribution:
    person = session.get(Person, c.person_id)
    return PersonContribution(
        person=ex.person_ref(session, c.person_id),
        hours=c.hours,
        first_date=c.first_date,
        last_date=c.last_date,
        domains=list(person.domains) if person else [],
        reliability=trust.person_reliability(session, c.person_id),
    )


@router.get("", response_model=list[ClientSummary])
def list_clients(user: CurrentUser = Depends(get_current_user), session: Session = Depends(get_session)):
    clients = session.exec(select(Client).order_by(Client.name)).all()
    summaries = [_summary(session, user, c) for c in clients]
    # Own (editable) clients first, then the rest read-only.
    return sorted(summaries, key=lambda s: (not s.can_edit, s.name.lower()))


@router.get("/{client_id}", response_model=ClientRecord)
def get_client_record(
    client_id: str = ClientIdPath,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    from app import views  # Agent 2 converters

    client = rbac.get_client_or_404(session, client_id)

    docs = session.exec(
        select(Document).where(Document.client_id == client.id, Document.status != DocStatus.duplicate)
    ).all()
    dup_counts: dict[str, int] = {}
    for dup_of in session.exec(
        select(Document.duplicate_of).where(Document.client_id == client.id, Document.status == DocStatus.duplicate)
    ).all():
        if dup_of:
            dup_counts[dup_of] = dup_counts.get(dup_of, 0) + 1

    items = session.exec(
        select(DossierItem).where(DossierItem.client_id == client.id).order_by(DossierItem.created_at.desc())
    ).all()
    items_by_doc: dict[str, list[str]] = {}
    for it in items:
        for doc_id in it.linked_document_ids or []:
            items_by_doc.setdefault(doc_id, []).append(it.id)

    timeline = [
        TimelineItem(
            document_id=d.id,
            type=d.type,
            title=d.title,
            excerpt=_excerpt(d.content),
            date=d.updated_at,
            author=ex.person_ref(session, d.author_id),
            owner=ex.person_ref(session, d.owner_id),
            trust=trust.document_trust(session, d),
            suspicious=d.suspicious,
            suspicious_reason=d.suspicious_reason,
            dossier_item_ids=items_by_doc.get(d.id, []),
            linked_duplicate_count=dup_counts.get(d.id, 0),
            source=d.source.value,
        )
        for d in sorted(docs, key=lambda d: ex.as_aware(d.updated_at), reverse=True)
    ]

    claims = session.exec(select(Claim).where(Claim.client_id == client.id)).all()
    claims = sorted(claims, key=lambda c: (c.status != ClaimStatus.active, c.key, c.valid_from))

    contributions = session.exec(
        select(Contribution).where(Contribution.client_id == client.id).order_by(Contribution.hours.desc())
    ).all()

    record = ClientRecord(
        client=_summary(session, user, client),
        summary=client.summary,
        consistency=views.consistency_status(session, client.id),
        timeline=timeline,
        claims=[views.claim_view(session, c) for c in claims],
        dossier_items=[views.dossier_item_view(session, it) for it in items],
        people=[person_contribution(session, c) for c in contributions],
        experts=ex.experts_for(session, user, client.id),
    )
    audit.record(session, user_id=user.id, action="view", entity="client", entity_id=client.id)
    return record


@router.get("/{client_id}/experts", response_model=Experts)
def get_client_experts(
    client_id: str = ClientIdPath,
    category: Category | None = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    client = rbac.get_client_or_404(session, client_id)
    return ex.experts_for(session, user, client.id, category, "")
