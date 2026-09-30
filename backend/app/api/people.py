"""People: the directory (GET /people) and the v2 person profile (GET /people/{person_id}).

Cross-client parts are data-minimized: client labels via rbac.client_label (the name only for assigned
users and leads/admins), titles of other clients' material neutral and figure-masked.
Profile fields (title, location, languages, bio, years at SD Worx) come from data/seed/profiles.json,
read at request time (models.py stays unchanged).
"""
from __future__ import annotations

import json
import logging
from collections import defaultdict
from pathlib import Path as FsPath

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlmodel import Session, select

from app.agents import experts as ex
from app.agents import trust, vertical
from app.agents.check import solvers_of
from app.api.clients import person_contribution
from app.config import get_settings
from app.db import get_session
from app.models import Client, Contribution, DocStatus, Document, DossierItem, ItemStatus, Person
from app.schemas import PersonDirectoryEntry, PersonProfileV2, SolvedCase, TopDocument
from app.security import rbac
from app.security.auth import CurrentUser, get_current_user

router = APIRouter(prefix="/people", tags=["people"])
log = logging.getLogger("trustgrid.people")

_MAX_DOCUMENTS = 6
_profiles_cache: dict[str, tuple[float, dict]] = {}


def load_profiles() -> dict[str, dict]:
    """profiles.json keyed by person id; cached until the file changes. Missing/invalid file -> {}."""
    path = FsPath(get_settings().seed_dir) / "profiles.json"
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return {}
    cached = _profiles_cache.get(str(path))
    if cached and cached[0] == mtime:
        return cached[1]
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        log.warning("profiles.json could not be read")
        return {}
    data = data if isinstance(data, dict) else {}
    _profiles_cache[str(path)] = (mtime, data)
    return data


def _profile_fields(person_id: str) -> dict:
    raw = load_profiles().get(person_id) or {}
    years = raw.get("years_at_sdworx")
    return {
        "title": str(raw.get("title") or "")[:120],
        "location": str(raw.get("location") or "")[:120],
        "languages": [str(x)[:40] for x in (raw.get("languages") or [])][:10],
        "bio": str(raw.get("bio") or "")[:1000],
        "years_at_sdworx": int(years) if isinstance(years, int) else None,
    }


def _solved_items(session: Session) -> dict[str, list[DossierItem]]:
    """person id -> resolved dossier items they solved (authored a solution document, or the item's expert)."""
    out: dict[str, list[DossierItem]] = defaultdict(list)
    for item in session.exec(select(DossierItem).where(DossierItem.status == ItemStatus.resolved)).all():
        for pid in solvers_of(session, item):
            out[pid].append(item)
    return out


@router.get("", response_model=list[PersonDirectoryEntry])
def list_people(user: CurrentUser = Depends(get_current_user), session: Session = Depends(get_session)):
    solved = _solved_items(session)
    entries = []
    for p in session.exec(select(Person).order_by(Person.name)).all():
        if not p.domains:  # platform accounts (admin) are not colleagues to ask
            continue
        items = solved.get(p.id, [])
        fields = _profile_fields(p.id)
        entries.append(PersonDirectoryEntry(
            person=ex.person_ref(session, p.id),
            domains=list(p.domains or []),
            countries=list(p.countries or []),
            reliability=trust.person_reliability(session, p.id),
            title=fields["title"],
            location=fields["location"],
            solved_count=len(items),
            solved_clients_count=len({i.client_id for i in items}),
        ))
    return entries


@router.get("/{person_id}", response_model=PersonProfileV2)
def get_person(
    person_id: str = Path(max_length=40, pattern=r"^p-[a-z0-9-]{1,38}$"),
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    person = session.get(Person, person_id)
    if person is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    clients = {c.id: c for c in session.exec(select(Client)).all()}

    contributions = session.exec(
        select(Contribution).where(Contribution.person_id == person.id).order_by(Contribution.last_date.desc())
    ).all()
    contribution_views = []
    for c in contributions:
        view = person_contribution(session, c)
        view.client_id = c.client_id
        client = clients.get(c.client_id)
        view.client_label = rbac.client_label(user, client) if client else None
        contribution_views.append(view)

    solved_cases = []
    for item in sorted(_solved_items(session).get(person.id, []), key=lambda i: i.created_at, reverse=True):
        client = clients.get(item.client_id)
        show_name = rbac.can_see_client_name(user, item.client_id)
        solved_cases.append(SolvedCase(
            dossier_item_id=item.id,
            client_label=rbac.client_label(user, client) if client else "Another client",
            category=item.category,
            title=vertical._minimize(item.title, client, show_name, 200),
            date=item.created_at.date(),
        ))

    docs = session.exec(
        select(Document).where(
            (Document.author_id == person.id) | (Document.owner_id == person.id),
            Document.status != DocStatus.duplicate,
            Document.suspicious == False,  # noqa: E712  (SQL expression)
        )
    ).all()
    scored = sorted(((trust.document_trust(session, d), d) for d in docs),
                    key=lambda t: (-t[0].score, -ex.as_aware(t[1].updated_at).timestamp()))
    documents = []
    for ts, d in scored[:_MAX_DOCUMENTS]:
        visible = d.client_id is None or rbac.can_see_client_name(user, d.client_id)
        client = clients.get(d.client_id) if d.client_id else None
        title = d.title if visible else ex.minimized_title(d, rbac.client_label(user, client) if client else "Another client")
        documents.append(TopDocument(id=d.id, title=title, trust=ts))

    return PersonProfileV2(
        person=ex.person_ref(session, person.id),
        domains=list(person.domains or []),
        countries=list(person.countries or []),
        reliability=trust.person_reliability(session, person.id),
        contributions=contribution_views,
        solved_cases=solved_cases,
        documents=documents,
        clients_count=len({c.client_id for c in contributions}),
        total_hours=round(sum(c.hours for c in contributions), 1),
        **_profile_fields(person.id),
    )
