"""Solution drafts that reuse a proven approach and are checked before anyone sends them.

build_solution: dossier item -> record expert + problem expert -> their best documents and the precedent
resolutions -> draft (mock template, optional LLM) -> saved as a draft `solution` Document + Solution row
-> consistency: duplicate check, within-record claim check (not persisted), across-records approach check.
"""
from __future__ import annotations

import hashlib
import re
import uuid
from datetime import date

from fastapi import HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, func, select

from app.agents import capture, dedup, horizontal, trust, vertical
from app.agents import experts as ex
from app.models import (
    Role,
    Claim,
    ClaimEvidence,
    ClaimStatus,
    Conflict,
    ConflictScope,
    DocStatus,
    DocType,
    Document,
    DossierItem,
    Resolution,
    Solution,
    Source,
)
from app.schemas import (
    Citation,
    Experts,
    Precedent,
    SolutionConsistency,
    SolutionRequest,
    SolutionView,
)
from app.security import audit, rbac, sanitize
from app.security.auth import CurrentUser

# Claim keys that matter for each kind of dossier item (what "tailored for this client" draws on).
CATEGORY_KEYS: dict[str, list[str]] = {
    "feature_request": ["pay_gap_method", "hr_system", "headcount", "headcount_target", "self_service_status", "go_live_date"],
    "problem": ["hr_system", "payroll_country", "payroll_frequency", "payroll_provider_count", "headcount", "go_live_date"],
    "question": ["headcount", "pay_gap_method", "hr_system", "payroll_country", "go_live_date"],
    "complaint": ["sla_response_hours", "price_model", "discount_pct", "contact_person"],
    "commercial": ["discount_pct", "price_model", "sla_response_hours", "headcount", "contact_person"],
    "payroll_rule": ["payroll_country", "payroll_frequency", "payroll_provider_count", "headcount"],
}
# Keys that can legitimately hold several values at once (never a contradiction on their own).
_MULTI_VALUED = {"payroll_country", "contact_person", "hr_system"}
MAX_BUILT_ON = 6

_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


class _LLMDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    draft: str = Field(min_length=20, max_length=8000)


# --------------------------------------------------------------------------- helpers


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def _content_hash(text: str) -> str:
    try:
        return dedup.content_hash(text)
    except AttributeError:  # dedup not wired yet: same normalization idea, simplified
        norm = re.sub(r"\s+", " ", text.lower()).strip()
        return hashlib.sha256(norm.encode()).hexdigest()


def _evidence_count(session: Session, claim_id: str) -> int:
    return session.exec(select(func.count()).select_from(ClaimEvidence).where(ClaimEvidence.claim_id == claim_id)).one()


def _pending_conflicts_on(session: Session, claim_ids: set[str]) -> list[Conflict]:
    if not claim_ids:
        return []
    return session.exec(
        select(Conflict).where(
            Conflict.resolution == Resolution.pending,
            Conflict.scope == ConflictScope.within_record,
            (Conflict.new_claim_id.in_(claim_ids)) | (Conflict.existing_claim_id.in_(claim_ids)),
        )
    ).all()


def _contradicts(client_id: str, author_id: str, key: str, value: str, existing: Claim) -> bool:
    """The horizontal rule (schema.md §3), evaluated in memory on a transient claim: nothing is persisted."""
    rule = getattr(horizontal, "_is_conflict", None)
    if rule is not None:
        probe = Claim(
            id="clm-draft-probe", client_id=client_id, key=key, value=value,
            valid_from=date.today(), first_author_id=author_id,
        )
        return bool(rule(probe, existing))
    if key == existing.key:
        return key not in _MULTI_VALUED and value != existing.value
    pair = {key: value, existing.key: existing.value}
    if set(pair) == {"price_model", "discount_pct"}:
        try:
            return pair["price_model"] == "full_price" and float(pair["discount_pct"]) > 0
        except ValueError:
            return False
    return False


def _citation(session: Session, doc: Document, title: str, ref: int, confirmed_by: int) -> Citation:
    return Citation(
        ref=ref,
        document_id=doc.id,
        title=title,
        author=ex.person_ref(session, doc.author_id),
        date=doc.updated_at,
        trust=trust.document_trust(session, doc),
        confirmed_by=confirmed_by,
    )


def _relevant_client_docs(session: Session, client_id: str, text: str, k: int = 2) -> list[Document]:
    """This client's own documents about the same topic, ranked by relevance x trust."""
    from app.agents.answer import overlap, similarities, tokens

    docs = session.exec(
        select(Document).where(
            Document.client_id == client_id,
            Document.status == DocStatus.active,
            Document.suspicious == False,  # noqa: E712  (SQL expression)
            Document.type != DocType.solution,
        )
    ).all()
    q = tokens(text)
    sims = similarities(text, [f"{d.title}\n{d.content[:3000]}" for d in docs])
    ranked = []
    for d, sim in zip(docs, sims):
        rel = 0.6 * sim + 0.4 * overlap(q, f"{d.title} {d.content[:3000]}")
        if rel >= 0.25:
            ranked.append((rel * (0.3 + 0.7 * trust.document_trust(session, d).score / 100), d))
    ranked.sort(key=lambda t: -t[0])
    return [d for _, d in ranked[:k]]


# --------------------------------------------------------------------------- draft


def _mock_draft(
    session: Session,
    client,
    item: DossierItem,
    precedents: list[Precedent],
    facts: list[tuple[Claim, int]],
    disputed: list[Claim],
    experts: Experts,
    record_docs: list[str],
) -> str:
    cat = ex.human(item.category.value)
    lines = [f"Solution draft: {item.title}", "", "Situation"]
    desc = re.sub(r"\s+", " ", item.description).strip()
    lines.append(
        f"{client.name} ({client.sector}, {client.country}) raised a {cat}: "
        f"{desc[:400]}{'...' if len(desc) > 400 else ''}"
    )

    lines += ["", "Proven approach"]
    if precedents:
        for p in precedents[:2]:
            lines.append(
                f"- {p.resolution_summary} (solved by {p.expert.name}, {p.client_label}, {p.date.strftime('%b %Y')})"
            )
        lines.append("Reuse this approach rather than building a new one.")
    else:
        lines.append("- No resolved case of this type at other clients yet. This draft starts from the client record.")

    lines += ["", f"Tailored for {client.name}"]
    if facts:
        for c, n in facts:
            label = ex.KEY_LABELS.get(c.key, ex.human(c.key))
            lines.append(
                f"- {ex.sentence_case(label)}: {ex.format_value(session, c.key, c.value, c.unit)} "
                f"(confirmed by {n} document{'s' if n != 1 else ''})"
            )
    else:
        lines.append("- No confirmed facts in the record for this topic yet. Confirm scope with the client.")
    for title in record_docs:
        lines.append(f'- Builds on "{title}" from the client record')
    for c in disputed:
        lines.append(
            f"- Check first: the {ex.KEY_LABELS.get(c.key, ex.human(c.key))} is disputed in the record. "
            "Resolve the open conflict before sharing this draft."
        )

    rec, prob = experts.record_expert, experts.problem_expert
    lines += ["", "Next steps"]
    step = 1
    same = bool(rec and prob and rec.person.id == prob.person.id)
    if same:
        lines.append(
            f"{step}. Walk through the proven approach and the client specifics with {prob.person.name}, "
            f"who solved this before and knows {client.name} best."
        )
        step += 1
    elif prob:
        lines.append(f"{step}. Walk through the proven approach with {prob.person.name}, who solved this before.")
        step += 1
    if rec and not same:
        lines.append(f"{step}. Confirm the client specifics with {rec.person.name}, who knows {client.name} best.")
        step += 1
    lines.append(f"{step}. Share the draft with the client and log the outcome in TrustGrid.")

    lines += ["", "Contacts"]
    if rec:
        lines.append(f"- Record expert: {rec.person.name} ({rec.contact}). {rec.reason}.")
    if prob:
        lines.append(f"- Problem expert: {prob.person.name} ({prob.contact}). {prob.reason}.")
    if not rec and not prob:
        lines.append("- No expert found yet. Ask your team lead.")
    return "\n".join(lines)


def _llm_draft(mock: str, item: DossierItem) -> str | None:
    try:
        from app import llm
    except ImportError:
        return None
    if not llm.llm_enabled():
        return None
    system = (
        sanitize.LLM_SYSTEM_GUARD
        + " Task: rewrite the structured solution draft into a clear, plain-text proposal for an SD Worx "
        "consultant. Keep the sections Situation, Proven approach, Tailored for the client, Next steps and "
        "Contacts. Keep every fact, figure, name and attribution exactly as given; add no new facts. "
        'No markdown, no HTML. Output JSON: {"draft": str}.'
    )
    user_content = (
        f"Dossier item:\n{sanitize.wrap_untrusted(item.id, item.title + chr(10) + item.description)}\n\n"
        f"Structured draft:\n{sanitize.wrap_untrusted('draft', mock)}"
    )
    out = llm.complete_json(system, user_content, _LLMDraft)
    if out is None:
        return None
    text = sanitize.to_plain_text(out.draft, max_len=8000)
    return text if len(text) >= 20 else None


# --------------------------------------------------------------------------- main entry


def build_solution(session: Session, user: CurrentUser, body: SolutionRequest) -> SolutionView:
    item = session.get(DossierItem, body.dossier_item_id)
    if item is None:
        raise _NOT_FOUND
    client = rbac.get_client_or_404(session, item.client_id)
    rbac.require_client_write(user, client.id)

    # The saved draft lands in this client's record, which every colleague can read. Build it with the
    # author's rights narrowed to this client, so other clients only ever appear as sector + country.
    viewer = CurrentUser(user.id, user.person_id, user.email, Role.consultant, frozenset({client.id}))
    problem_text = f"{item.title}\n{item.description}"
    experts = ex.experts_for(session, viewer, client.id, item.category, problem_text)
    precedents = ex.resolved_precedents(session, viewer, client.id, problem_text, item.category)
    if experts.problem_expert:  # the problem expert's own cases first
        pid = experts.problem_expert.person.id
        precedents.sort(key=lambda p: (p.expert.id != pid, -p.similarity))

    # ---- client facts relevant to this kind of item
    keys = CATEGORY_KEYS.get(item.category.value, list(ex.KEY_LABELS))
    claims = session.exec(
        select(Claim).where(Claim.client_id == client.id, Claim.status == ClaimStatus.active, Claim.key.in_(keys))
    ).all()
    claim_conflicts = _pending_conflicts_on(session, {c.id for c in claims})
    disputed_ids = {cid for cf in claim_conflicts for cid in (cf.new_claim_id, cf.existing_claim_id) if cid}
    facts = [(c, _evidence_count(session, c.id)) for c in claims if c.id not in disputed_ids]
    facts.sort(key=lambda t: (keys.index(t[0].key), -t[1]))
    disputed = [c for c in claims if c.id in disputed_ids]

    # ---- sources the draft is built on
    built: list[tuple[Document, str, int]] = []
    seen: set[str] = set()

    def add(doc: Document | None, title: str | None = None, confirmed_by: int = 1) -> None:
        if doc is None or doc.id in seen or doc.suspicious or doc.status == DocStatus.duplicate:
            return
        seen.add(doc.id)
        built.append((doc, title or doc.title, confirmed_by))

    if experts.problem_expert:
        for td in experts.problem_expert.top_documents:
            add(session.get(Document, td.id), td.title)  # title already minimized by experts.py
    for p in precedents[:2]:
        prec_item = session.get(DossierItem, p.dossier_item_id)
        for doc_id in (prec_item.linked_document_ids if prec_item else [])[:2]:
            doc = session.get(Document, doc_id)
            if doc is not None:
                visible = doc.client_id is None or rbac.can_see_client_name(viewer, doc.client_id)
                add(doc, None if visible else ex.minimized_title(doc, p.client_label))
    record_titles: list[str] = []
    for doc in _relevant_client_docs(session, client.id, problem_text):
        if doc.id not in seen:
            record_titles.append(doc.title)
        add(doc)
    for c, n in facts:
        ev = session.exec(
            select(ClaimEvidence).where(ClaimEvidence.claim_id == c.id).order_by(ClaimEvidence.added_at)
        ).first()
        if ev:
            add(session.get(Document, ev.document_id), confirmed_by=n)
    built = built[:MAX_BUILT_ON]

    # ---- draft
    mock = _mock_draft(session, client, item, precedents, facts, disputed, experts, record_titles[:2])
    draft = _llm_draft(mock, item) or mock
    draft = sanitize.to_plain_text(draft, max_len=20000)

    # ---- consistency, part 1: duplicate check before the draft enters the record
    reasons: list[str] = []
    dup = dedup.find_duplicate_document(session, client.id, draft)
    if dup is not None:
        existing = session.get(Document, dup.matched_id)
        reasons.append(
            f'Very similar to "{existing.title if existing else dup.matched_id}" already in the record '
            f"({dup.similarity:.0%} similar). Consider updating that document instead."
        )

    record_expert_id = experts.record_expert.person.id if experts.record_expert else None
    now = ex.now_utc()
    doc = Document(
        id=_new_id("doc"),
        client_id=client.id,
        type=DocType.solution,
        title=f"Solution draft: {item.title}"[:200],
        content=draft,
        content_hash=_content_hash(draft),
        author_id=user.person_id,
        owner_id=record_expert_id or user.person_id,
        country_scope=client.country,
        created_at=now,
        updated_at=now,
        status=DocStatus.draft,
        source=Source.user,
    )
    session.add(doc)
    session.flush()

    # ---- consistency, part 2: within record (in memory; a draft must not create conflict rows)
    within_ids = [cf.id for cf in claim_conflicts]
    for c in disputed:
        reasons.append(
            f"The {ex.KEY_LABELS.get(c.key, ex.human(c.key))} this draft depends on has an open conflict in the record."
        )
    active = session.exec(select(Claim).where(Claim.client_id == client.id, Claim.status == ClaimStatus.active)).all()
    contradiction = False
    for e in capture.extract_claims(draft):
        for existing in active:
            if _contradicts(client.id, user.person_id, e.key, e.value, existing):
                contradiction = True
                reasons.append(
                    f"The draft states {ex.KEY_LABELS.get(e.key, e.key)} = {e.value}, but the record holds "
                    f"{ex.KEY_LABELS.get(existing.key, existing.key)} = {existing.value}."
                )

    # ---- consistency, part 3: across records (persisted: a real approach conflict needs a decision)
    across = vertical.check_approach(session, client.id, doc, item.category)
    for cf in across:
        reasons.append(cf.explanation[:300])

    consistency = SolutionConsistency(
        within_record="conflict" if (within_ids or contradiction) else "consistent",
        across_records="conflict" if across else "consistent",
        conflict_ids=within_ids + [cf.id for cf in across],
        reasons=reasons or ["Consistent with this client's record and with how similar cases were solved."],
    )

    sol = Solution(
        id=_new_id("sol"),
        dossier_item_id=item.id,
        document_id=doc.id,
        draft=draft,
        based_on_document_ids=[d.id for d, _, _ in built],
        record_expert_id=record_expert_id,
        problem_expert_id=experts.problem_expert.person.id if experts.problem_expert else None,
        consistency_status=consistency.model_dump(),
        created_at=now,
    )
    session.add(sol)
    item.linked_document_ids = [*(item.linked_document_ids or []), doc.id]
    session.add(item)
    audit.record(session, user_id=user.id, action="create", entity="solution", entity_id=sol.id, commit=False)
    session.commit()

    built_on = [_citation(session, d, title, i + 1, n) for i, (d, title, n) in enumerate(built)]
    return SolutionView(
        id=sol.id,
        dossier_item_id=item.id,
        document_id=doc.id,
        draft=draft,
        built_on=built_on,
        backed_by=experts,
        consistency_status=consistency,
        created_at=now,
    )
