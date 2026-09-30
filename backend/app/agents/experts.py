"""The right people behind every answer.

- Record expert: the person who knows THIS client best (most hours, most recent activity; ties by domain match).
- Problem expert: the person who solved the SAME problem type for OTHER clients (via vertical precedents).

Cross-client data is minimized (contracts/schema.md §8): other clients appear only through the
precedent's `client_label`, and document titles from clients the user may not see are replaced by
a neutral label.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timezone

from sqlmodel import Session, select

from app.agents import trust, vertical
from app.models import Category, Client, Contribution, DocStatus, Document, DossierItem, ItemStatus, Person
from app.schemas import Expert, Experts, PersonRef, Precedent, TopDocument
from app.security import rbac
from app.security.auth import CurrentUser

# Which person domains are relevant for which dossier category (used for tie-breaks and wording).
CATEGORY_DOMAINS: dict[str, list[str]] = {
    "feature_request": ["pay_transparency", "hr_system_implementation", "time_management"],
    "problem": ["payroll", "hr_system_implementation", "multi_country_payroll"],
    "question": ["payroll", "onboarding", "compliance"],
    "complaint": ["commercial", "change_management"],
    "commercial": ["commercial"],
    "payroll_rule": ["payroll", "compliance", "multi_country_payroll"],
}

# Human wording for the claim key taxonomy (contracts/schema.md §3). Shared with answer/solution.
KEY_LABELS: dict[str, str] = {
    "discount_pct": "agreed discount",
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

_MAX_TOP_DOCS = 3


# --------------------------------------------------------------------------- shared helpers


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def as_aware(dt: datetime) -> datetime:
    """SQLite returns naive datetimes; treat them as UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def person_ref(session: Session, person_id: str | None) -> PersonRef | None:
    if not person_id:
        return None
    p = session.get(Person, person_id)
    if p is None:
        return PersonRef(id=person_id, name="Unknown colleague", role="", team="")
    return PersonRef(id=p.id, name=p.name, role=p.role, team=p.team)


def human(text: str) -> str:
    return text.replace("_", " ")


def format_value(session: Session, key: str, value: str, unit: str | None) -> str:
    if key == "contact_person":
        ref = person_ref(session, value)
        return ref.name if ref else value
    if key == "price_model":
        return human(value)
    if unit == "%":
        return f"{value}%"
    if unit and unit not in KEY_LABELS.get(key, ""):  # "1 providers" reads badly after "number of payroll providers"
        return f"{value} {unit}"
    return value


def sentence_case(text: str) -> str:
    """Capitalize the first letter only, so acronyms like SLA and HR survive."""
    return text[:1].upper() + text[1:]


def ago(days: int) -> str:
    if days <= 0:
        return "today"
    if days == 1:
        return "yesterday"
    if days < 60:
        return f"{days} days ago"
    months = days // 30
    if months < 24:
        return f"{months} months ago"
    return f"{days // 365} years ago"


def minimized_title(doc: Document, client_label: str) -> str:
    """Neutral title for a document of a client the user may not see by name."""
    when = as_aware(doc.updated_at).strftime("%b %Y")
    return f"{human(doc.type.value).capitalize()} ({client_label}, {when})"


def client_label(client: Client | None) -> str:
    if client is None:
        return "Another client"
    return f"{client.sector}, {client.country}"


# --------------------------------------------------------------------------- record expert


def _client_domains(session: Session, client_id: str) -> set[str]:
    cats = session.exec(select(DossierItem.category).where(DossierItem.client_id == client_id)).all()
    domains: set[str] = set()
    for c in cats:
        domains.update(CATEGORY_DOMAINS.get(c.value if isinstance(c, Category) else str(c), []))
    return domains


def _top_documents_on_client(session: Session, person_id: str, client_id: str) -> list[TopDocument]:
    docs = session.exec(
        select(Document).where(
            Document.client_id == client_id,
            Document.status == DocStatus.active,
            Document.suspicious == False,  # noqa: E712  (SQL expression)
            (Document.author_id == person_id) | (Document.owner_id == person_id),
        )
    ).all()
    scored = [(trust.document_trust(session, d), d) for d in docs]
    scored.sort(key=lambda t: (-t[0].score, -as_aware(t[1].updated_at).timestamp()))
    return [TopDocument(id=d.id, title=d.title, trust=ts) for ts, d in scored[:_MAX_TOP_DOCS]]


def record_expert(session: Session, client_id: str, exclude_person_id: str | None = None) -> Expert | None:
    """exclude_person_id: the asking user. "Who to ask" should be someone else, unless nobody else exists."""
    contributions = session.exec(select(Contribution).where(Contribution.client_id == client_id)).all()
    if not contributions:
        return None
    others = [c for c in contributions if c.person_id != exclude_person_id]
    candidates = others or contributions
    today = date.today()
    max_hours = max(c.hours for c in contributions) or 1.0
    wanted = _client_domains(session, client_id)

    def rank(c: Contribution) -> tuple[float, int, str]:
        recency = max(0.0, 1.0 - (today - c.last_date).days / 365)
        score = 0.6 * (c.hours / max_hours) + 0.4 * recency
        person = session.get(Person, c.person_id)
        domain_match = len(wanted & set(person.domains or [])) if person else 0
        return (-round(score, 4), -domain_match, c.person_id)

    best = sorted(candidates, key=rank)[0]
    person = session.get(Person, best.person_id)
    if person is None:
        return None
    days = max(0, (today - best.last_date).days)
    reason = (
        f"Worked {best.hours:g} h on this client since {best.first_date.strftime('%b %Y')}, "
        f"most recently {ago(days)}"
    )
    return Expert(
        person=person_ref(session, person.id),
        kind="record_expert",
        reason=reason,
        reliability=trust.person_reliability(session, person.id),
        hours_on_client=best.hours,
        top_documents=_top_documents_on_client(session, person.id, client_id),
        contact=person.email,
    )


# --------------------------------------------------------------------------- problem expert


def _context_from_open_item(session: Session, client_id: str) -> tuple[Category | None, str]:
    """No explicit problem given: use the client's most recent open dossier item as context."""
    item = session.exec(
        select(DossierItem)
        .where(DossierItem.client_id == client_id, DossierItem.status == ItemStatus.open)
        .order_by(DossierItem.created_at.desc())
    ).first()
    if item is None:
        return None, ""
    return item.category, f"{item.title}\n{item.description}"


def _precedent_documents(
    session: Session, user: CurrentUser, person_id: str, precedents: list[Precedent]
) -> list[TopDocument]:
    """The expert's solution/resolution documents behind the precedents, titles minimized when needed."""
    seen: set[str] = set()
    candidates: list[tuple[Document, str]] = []
    for p in precedents:
        item = session.get(DossierItem, p.dossier_item_id)
        if item is None:
            continue
        for doc_id in item.linked_document_ids or []:
            doc = session.get(Document, doc_id)
            if doc is None or doc.id in seen or doc.suspicious or doc.status == DocStatus.duplicate:
                continue
            if person_id not in (doc.author_id, doc.owner_id):
                continue
            seen.add(doc.id)
            candidates.append((doc, p.client_label))
    scored = []
    for doc, label in candidates:
        ts = trust.document_trust(session, doc)
        visible = doc.client_id is None or rbac.can_see_client_name(user, doc.client_id)
        title = doc.title if visible else minimized_title(doc, label)
        scored.append((ts, doc, title))
    # Prefer written solutions over other material, then trust.
    scored.sort(key=lambda t: (t[1].type.value != "solution", -t[0].score))
    return [TopDocument(id=d.id, title=title, trust=ts) for ts, d, title in scored[:_MAX_TOP_DOCS]]


def resolved_precedents(
    session: Session, user: CurrentUser, client_id: str, text: str, category: Category | None, k: int = 5
) -> list[Precedent]:
    """Precedents at other clients that were actually solved (open items elsewhere prove nothing yet)."""
    out = []
    for p in vertical.find_precedents(session, user, client_id, text, category, k=k):
        item = session.get(DossierItem, p.dossier_item_id)
        if item is not None and item.status == ItemStatus.resolved and p.expert is not None:
            out.append(p)
    return out


def problem_expert(
    session: Session, user: CurrentUser, client_id: str, category: Category | None, text: str
) -> Expert | None:
    if not text.strip() and category is None:
        category, text = _context_from_open_item(session, client_id)
    if not text.strip():
        return None
    precedents = resolved_precedents(session, user, client_id, text, category)
    if not precedents:
        return None

    by_person: dict[str, list[Precedent]] = defaultdict(list)
    for p in precedents:
        by_person[p.expert.id].append(p)
    # The asking user is never recommended to themselves, unless they are the only one who solved it.
    pool = {pid: ps for pid, ps in by_person.items() if pid != user.person_id} or by_person
    person_id, solved = sorted(
        pool.items(), key=lambda kv: (-len(kv[1]), -max(p.similarity for p in kv[1]), kv[0])
    )[0]
    person = session.get(Person, person_id)
    if person is None:
        return None

    cat = category or solved[0].category
    cat_value = cat.value if isinstance(cat, Category) else str(cat)
    relevant = set(CATEGORY_DOMAINS.get(cat_value, []))
    for p in solved:
        relevant.update(CATEGORY_DOMAINS.get(p.category.value, []))
    # The person's own order puts their primary domain first.
    matching = [d for d in (person.domains or []) if d in relevant]
    topic = human(matching[0]) if matching else human(cat_value)
    n = len(solved)
    labels = sorted({p.client_label for p in solved})
    latest = max(p.date for p in solved)
    reason = (
        f"Solved {n} similar {topic} case{'s' if n != 1 else ''} at other clients "
        f"({'; '.join(labels)}), most recently in {latest.strftime('%b %Y')}"
    )
    return Expert(
        person=person_ref(session, person.id),
        kind="problem_expert",
        reason=reason,
        reliability=trust.person_reliability(session, person.id),
        solved_count=n,
        top_documents=_precedent_documents(session, user, person.id, solved),
        contact=person.email,
    )


def experts_for(
    session: Session, user: CurrentUser, client_id: str, category: Category | None = None, text: str = ""
) -> Experts:
    return Experts(
        record_expert=record_expert(session, client_id, exclude_person_id=user.person_id),
        problem_expert=problem_expert(session, user, client_id, category, text),
    )
