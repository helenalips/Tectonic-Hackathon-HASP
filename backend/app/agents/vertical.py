"""Vertical check: the same problem at OTHER clients.

Only this module reads other clients' dossier items, and it returns data-minimized results
(contracts/schema.md §8): a client label (sector + country unless the user may see the name),
the category, a figure-masked summary, the date, the expert and a similarity. Never client figures.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from sqlmodel import Session, select

from app import embeddings
from app.agents.dedup import fmt_date, new_id, person_name
from app.models import (
    Category,
    Client,
    Conflict,
    ConflictScope,
    DocType,
    Document,
    DossierItem,
    ItemStatus,
    Person,
    Resolution,
    Severity,
)
from app.schemas import PersonRef, Precedent
from app.security import rbac
from app.security.auth import CurrentUser
from app.security.sanitize import mask_figures as _sanitize_mask_figures

APPROACH_SIMILARITY = 0.6
_MIN_PRECEDENT_SCORE = 0.45
_RESOLVED_BOOST = 0.05
_CATEGORY_BOOST = 0.10
_TOPIC_FLOOR = 0.7

# Shared topics: two texts that both hit the same topic are about the same problem, even when the
# wording differs a lot (e.g. "Excel pay gap calculation" vs "competence matrix + salary scale").
_TOPICS: dict[str, tuple[str, ...]] = {
    "pay_transparency": (
        "pay gap", "pay equity", "pay transparency", "equal pay", "gender pay", "salary scale",
        "competence matrix", "job architecture", "job matrix", "pay framework", "pay discrepanc",
    ),
    "payroll_consolidation": (
        "payroll provider", "single payroll", "one payroll", "multi-country payroll", "payroll consolidation",
        "consolidate payroll",
    ),
    "hr_system": ("successfactors", "hr system", "hris", "employee self-service", "self service"),
    "onboarding": ("onboarding", "new joiner", "new hires"),
    # Recurring payroll problems (v2 seed): same problem, different wording at different clients.
    "overtime_premium": (
        "overtime premium", "overtime supplement", "overtime surcharge", "sunday premium", "weekend premium",
        "night premium", "sunday supplement",
    ),
    "no_smartphone_self_service": (
        "without smartphones", "without a smartphone", "no smartphone", "lack smartphones", "without a company smartphone",
        "kiosk", "shared tablet", "shared device",
    ),
    "retro_corrections": (
        "retroactive", "retro-active", "retro calculation", "back pay", "indexation", "barema update",
    ),
    "payroll_cutoff": ("cut-off dispute", "mid-month cut-off", "late inputs", "late variable pay", "paid a month late"),
    "leave_balance_migration": ("leave balance", "leave balances", "holiday balance", "carry-over leave"),
    "time_registration": (
        "works council", "betriebsrat", "time registration", "clocking", "time sheets", "badge terminal",
    ),
}

_MANUAL = ("excel", "spreadsheet", "manual", "by hand")
_INTEGRATED = ("integrated", "single system", "one system", "successfactors", "automated", "automatic", "automation")
_APPROACH_PHRASE = {
    "manual": "manual Excel calculations",
    "integrated": "one integrated system",
}
# Clauses that NEGATE an approach ("replacing manual Excel forecasting") are removed before classifying.
_NEGATION_RE = re.compile(
    r"\b(replac\w*|instead of|rather than|no more|no longer|no|not|moved? away from|away from|got rid of|without)\b(\s+[\w-]+){1,4}",
    re.IGNORECASE,
)



def mask_figures(text: str) -> str:
    """Replace every number, amount and percentage (years included: "2000 employees" is a figure too)."""
    return _sanitize_mask_figures(text or "")


def _topics(text: str) -> set[str]:
    low = (text or "").lower()
    return {name for name, phrases in _TOPICS.items() if any(p in low for p in phrases)}


def relevance(text_a: str, text_b: str, vec_a=None, vec_b=None, use_topics: bool = True) -> float:
    """Cosine similarity, lifted to a floor when both texts are about the same known topic."""
    if vec_a is None or vec_b is None:
        vec_a, vec_b = embeddings.embed([text_a, text_b])
    sim = max(0.0, embeddings.cosine(vec_a, vec_b))
    if use_topics and _topics(text_a) & _topics(text_b):
        sim = max(sim, _TOPIC_FLOOR)
    return sim


def approach_of(text: str) -> str | None:
    """'manual' | 'integrated' | None, from keyword counts after dropping negated clauses."""
    low = _NEGATION_RE.sub(" ", (text or "").lower())
    manual = sum(low.count(k) for k in _MANUAL)
    integrated = sum(low.count(k) for k in _INTEGRATED)
    if manual > integrated:
        return "manual"
    if integrated > manual:
        return "integrated"
    return None


def _item_text(item: DossierItem) -> str:
    return " ".join(x for x in (item.title, item.description, item.resolution or "") if x)


def item_expert_id(session: Session, item: DossierItem) -> str:
    """The person who solved it: author of the latest linked solution document, else the creator."""
    if item.linked_document_ids:
        docs = session.exec(select(Document).where(Document.id.in_(item.linked_document_ids))).all()  # type: ignore[attr-defined]
        solutions = [d for d in docs if d.type == DocType.solution]
        if solutions:
            return max(solutions, key=lambda d: d.created_at).author_id
    return item.created_by


def anonymous_label(client: Client | None) -> str:
    if client is None:
        return "Another client"
    country = "multiple countries" if client.country == "MULTI" else client.country
    return f"{client.sector} client, {country}"


def _minimize(text: str, client: Client | None, show_name: bool, max_len: int) -> str:
    out = text or ""
    if client is not None and not show_name and client.name:
        names = [client.name]
        first = client.name.split()[0]
        if len(first) >= 4:
            names.append(first)
        for name in names:
            out = re.sub(rf"\b(the\s+)?{re.escape(name)}\b", "the client", out, flags=re.IGNORECASE)
    out = mask_figures(out)
    if len(out) <= max_len:
        return out
    cut = out[: max_len - 1]
    return (cut.rsplit(" ", 1)[0] if " " in cut else cut).rstrip(" ,;:") + "…"


@dataclass
class _Scored:
    item: DossierItem
    score: float
    similarity: float


def _score_items(session: Session, client_id: str, text: str, category: Category | None) -> list[_Scored]:
    items = session.exec(select(DossierItem).where(DossierItem.client_id != client_id)).all()
    if not items:
        return []
    texts = [_item_text(i) for i in items]
    vectors = embeddings.embed([text] + texts)
    # Commercial notes (prices, discounts) are not problems looking for a solution pattern elsewhere:
    # they only match on real textual similarity, not on a shared topic.
    use_topics = category != Category.commercial
    scored: list[_Scored] = []
    for item, item_text, vec in zip(items, texts, vectors[1:]):
        sim = relevance(text, item_text, vectors[0], vec, use_topics)
        score = sim
        if item.status == ItemStatus.resolved:
            score += _RESOLVED_BOOST
        if category is not None and item.category == category:
            score += _CATEGORY_BOOST
        scored.append(_Scored(item, score, sim))
    scored.sort(key=lambda s: (-s.score, s.item.id))
    return scored


def _person_ref(session: Session, person_id: str) -> PersonRef:
    p = session.get(Person, person_id)
    if p is None:
        return PersonRef(id=person_id, name="Unknown", role="", team="")
    return PersonRef(id=p.id, name=p.name, role=p.role, team=p.team)


def find_precedents(
    session: Session, user: CurrentUser, client_id: str, text: str, category: Category | None, k: int = 5
) -> list[Precedent]:
    """Top-k similar dossier items at OTHER clients, data-minimized for this user."""
    results: list[Precedent] = []
    for s in _score_items(session, client_id, text, category):
        if len(results) >= k:
            break
        if s.similarity < _MIN_PRECEDENT_SCORE:
            continue
        item = s.item
        client = session.get(Client, item.client_id)
        show_name = rbac.can_see_client_name(user, item.client_id)
        label = client.name if (show_name and client) else anonymous_label(client)
        summary_src = item.resolution or item.description
        results.append(
            Precedent(
                dossier_item_id=item.id,
                client_label=label,
                category=item.category,
                title=_minimize(item.title, client, show_name, 200),
                resolution_summary=_minimize(summary_src, client, show_name, 300),
                date=item.created_at.date(),
                expert=_person_ref(session, item_expert_id(session, item)),
                similarity=round(min(1.0, s.similarity), 2),
            )
        )
    return results


def check_approach(session: Session, client_id: str, document: Document, category: Category) -> list[Conflict]:
    """across_records conflict when this document proposes a clearly different approach than a proven one elsewhere."""
    text = f"{document.title}. {document.content}"
    new_approach = approach_of(text)
    if new_approach is None:
        return []
    existing = session.exec(
        select(Conflict).where(
            Conflict.client_id == client_id,
            Conflict.scope == ConflictScope.across_records,
            Conflict.new_document_id == document.id,
            Conflict.resolution == Resolution.pending,
        )
    ).first()
    if existing is not None:
        return []
    for s in _score_items(session, client_id, text, category):
        item = s.item
        if item.status != ItemStatus.resolved or s.similarity < APPROACH_SIMILARITY:
            continue
        other_approach = approach_of(_item_text(item))
        if other_approach is None or other_approach == new_approach:
            continue
        client = session.get(Client, item.client_id)
        expert = person_name(session, item_expert_id(session, item))
        first_sentence = re.split(r"(?<=[.!?])\s", (item.resolution or item.description).strip())[0]
        summary = _minimize(first_sentence, client, False, 160)
        label = anonymous_label(client)
        sector_country = label.replace(" client, ", " client in ")
        article = "an" if sector_country[:1].lower() in "aeiou" else "a"
        explanation = (
            f"At {article} {sector_country}, {expert} solved this with {_APPROACH_PHRASE[other_approach]} "
            f"({summary.rstrip('.')}; {fmt_date(item.created_at)}). "
            f"This proposal uses {_APPROACH_PHRASE[new_approach]}. "
            f"Check with {expert} whether the proven approach applies before going ahead."
        )
        conflict = Conflict(
            id=new_id("cf"),
            client_id=client_id,
            scope=ConflictScope.across_records,
            new_document_id=document.id,
            severity=Severity.medium,
            explanation=explanation[:2000],
        )
        session.add(conflict)
        session.flush()
        return [conflict]
    return []
