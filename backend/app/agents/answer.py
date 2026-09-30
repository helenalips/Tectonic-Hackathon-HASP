"""Backed answers: the answer, why it deserves confidence, where uncertainty remains, and who can help.

Retrieval: active, non-suspicious documents and active claims of ONE client, ranked by relevance x trust.
Mock mode composes a deterministic answer from the best claims and document excerpts.
LLM mode sends the same sources (wrapped as untrusted data) and validates every returned reference.
Suspicious documents are never cited; they only show up as a counted uncertainty.
"""
from __future__ import annotations

import re

import numpy as np
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, func, select

from app.agents import experts as ex
from app.agents import trust
from app.models import (
    Category,
    Claim,
    ClaimEvidence,
    ClaimStatus,
    EvidenceRelation,
    Conflict,
    DocStatus,
    Document,
    Resolution,
)
from app.schemas import Answer, AskRequest, Citation, TrustScore
from app.security import rbac, sanitize
from app.security.auth import CurrentUser

MAX_CLAIMS = 3
MAX_DOCS = 3
MAX_UNCERTAINTIES = 6
LOW_TRUST = 50
RELATIVE_MIN = 0.5  # keep sources at least half as relevant as the best one

# Phrases in a question that point at a claim key. Deterministic, so the mock path is predictable.
KEY_TRIGGERS: dict[str, tuple[str, ...]] = {
    "discount_pct": ("discount", "rebate", "reduction", "% off"),
    "price_model": ("price", "pricing", "invoice", "fee"),
    "headcount": ("headcount", "how many employees", "number of employees", "how many people", "fte", "staff size"),
    "headcount_target": ("headcount", "target", "growth", "grow to"),
    "go_live_date": ("go live", "go-live", "golive", "launch", "start date"),
    "payroll_frequency": ("frequency", "monthly", "weekly", "how often", "pay run", "payroll run"),
    "payroll_country": ("country", "countries"),
    "payroll_provider_count": ("provider", "vendor"),
    "hr_system": ("hr system", "hris", "software", "platform", "successfactors", "which system", "what system"),
    "self_service_status": ("self-service", "self service", "portal"),
    "sla_response_hours": ("sla", "response time", "respond"),
    "pay_gap_method": ("pay gap", "gap method", "calculation method", "calculate the gap"),
    "contact_person": ("contact", "who is responsible", "who owns", "account manager"),
}

_STOP = set(
    "a an the is are was were be been of to in on for and or with what which who whom when where why how "
    "do does did we our they their this that these those it its at by from as about there any can could "
    "should would will please tell me client have has had".split()
)
_WORD = re.compile(r"[a-z0-9]+")
_REF = re.compile(r"\[(\d{1,2})\]")


def tokens(text: str) -> set[str]:
    return {w for w in _WORD.findall(text.lower()) if w not in _STOP and len(w) > 1}


def overlap(q: set[str], text: str) -> float:
    if not q:
        return 0.0
    return len(q & tokens(text)) / len(q)


def similarities(question: str, texts: list[str]) -> list[float]:
    if not texts:
        return []
    from app import embeddings  # Agent 2 module; imported lazily

    vecs = np.asarray(embeddings.embed([question] + texts))
    sims = vecs[1:] @ vecs[0]
    return [max(0.0, float(s)) for s in sims]


def _doc_text(doc: Document) -> str:
    return f"{doc.title}\n{doc.content[:3000]}"


def _claim_text(claim: Claim) -> str:
    return f"{ex.KEY_LABELS.get(claim.key, claim.key)} {claim.value}"


def _trigger_hits(question_lower: str, key: str) -> int:
    return sum(1 for t in KEY_TRIGGERS.get(key, ()) if t in question_lower)


def _best_sentence(content: str, q: set[str]) -> str:
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", content) if len(s.strip()) > 15]
    if not sentences:
        return content.strip()[:200]
    best = max(sentences, key=lambda s: (overlap(q, s), -len(s)))
    return best[:200] + ("..." if len(best) > 200 else "")


class _Ranked:
    def __init__(self, obj, relevance: float, score: TrustScore):
        self.obj = obj
        self.relevance = relevance
        self.trust = score

    @property
    def rank(self) -> float:
        return self.relevance * (0.3 + 0.7 * self.trust.score / 100)


def _keep_best(ranked: list[_Ranked]) -> list[_Ranked]:
    """Sort by relevance x trust and drop sources far less relevant than the best one."""
    if not ranked:
        return []
    top = max(r.relevance for r in ranked)
    return sorted((r for r in ranked if r.relevance >= RELATIVE_MIN * top), key=lambda r: -r.rank)


class _LLMAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answer: str = Field(max_length=3000)
    used_refs: list[int] = Field(default_factory=list, max_length=20)
    uncertainties: list[str] = Field(default_factory=list, max_length=10)


class _Sources:
    """Citations numbered in order of first use."""

    def __init__(self, session: Session):
        self.session = session
        self.citations: list[Citation] = []
        self.docs: dict[int, Document] = {}
        self._by_doc: dict[str, int] = {}

    def cite(self, doc: Document, score: TrustScore, confirmed_by: int) -> int:
        if doc.id in self._by_doc:
            ref = self._by_doc[doc.id]
            c = self.citations[ref - 1]
            c.confirmed_by = max(c.confirmed_by, confirmed_by)
            return ref
        ref = len(self.citations) + 1
        self._by_doc[doc.id] = ref
        self.docs[ref] = doc
        self.citations.append(
            Citation(
                ref=ref,
                document_id=doc.id,
                title=doc.title,
                author=ex.person_ref(self.session, doc.author_id),
                date=doc.updated_at,
                trust=score,
                confirmed_by=confirmed_by,
            )
        )
        return ref


def _evidence_count(session: Session, claim_id: str) -> int:
    return session.exec(select(func.count()).select_from(ClaimEvidence).where(ClaimEvidence.claim_id == claim_id)).one()


def _duplicate_count(session: Session, doc_id: str) -> int:
    return session.exec(
        select(func.count()).select_from(Document).where(Document.duplicate_of == doc_id)
    ).one()


def _claim_source_doc(session: Session, claim: Claim, usable: dict[str, Document]) -> Document | None:
    """Best evidence document for a claim: an active, non-suspicious one, origin first."""
    rows = session.exec(select(ClaimEvidence).where(ClaimEvidence.claim_id == claim.id)).all()
    rows = sorted(rows, key=lambda e: (e.relation.value != "origin", e.added_at))
    for e in rows:
        if e.document_id in usable:
            return usable[e.document_id]
    return None


def _pending_conflicts(session: Session, client_id: str) -> list[Conflict]:
    return session.exec(
        select(Conflict)
        .where(Conflict.client_id == client_id, Conflict.resolution == Resolution.pending)
        .order_by(Conflict.created_at.desc())
    ).all()


def _weak_factors(score: TrustScore) -> str:
    weak = sorted((f for f in score.factors if f.value < 0.5), key=lambda f: f.value * f.weight)
    return "; ".join(f.reason for f in weak[:2]) or "several weak trust signals"


def _classify(question: str) -> Category | None:
    try:
        from app.agents import capture

        return capture.classify_category(question)
    except Exception:  # capture not available or failed: the problem expert then uses record context
        return None


def answer_question(session: Session, user: CurrentUser, body: AskRequest) -> Answer:
    client = rbac.get_client_or_404(session, body.client_id)
    question = sanitize.to_plain_text(body.question, max_len=1000)
    q = tokens(question)

    all_docs = session.exec(
        select(Document).where(Document.client_id == client.id, Document.status == DocStatus.active)
    ).all()
    suspicious = [d for d in all_docs if d.suspicious]
    # Documents whose every stated fact was overruled in a conflict resolution no longer back an answer.
    origin_status: dict[str, set[ClaimStatus]] = {}
    for doc_id, st in session.exec(
        select(ClaimEvidence.document_id, Claim.status)
        .join(Claim, Claim.id == ClaimEvidence.claim_id)
        .where(Claim.client_id == client.id, ClaimEvidence.relation == EvidenceRelation.origin)
    ).all():
        origin_status.setdefault(doc_id, set()).add(st)
    overruled = {d for d, sts in origin_status.items() if sts == {ClaimStatus.superseded}}
    usable = {d.id: d for d in all_docs if not d.suspicious and d.id not in overruled}

    claims = session.exec(
        select(Claim).where(Claim.client_id == client.id, Claim.status == ClaimStatus.active)
    ).all()

    # ---- rank claims and documents: relevance x trust
    claim_sims = similarities(question, [_claim_text(c) for c in claims])
    ranked_claims = []
    for c, sim in zip(claims, claim_sims):
        hits = _trigger_hits(question.lower(), c.key)
        if hits == 0 and sim < 0.6:
            continue
        ranked_claims.append(_Ranked(c, hits + 0.5 * sim, trust.claim_trust(session, c)))
    ranked_claims = _keep_best(ranked_claims)[:MAX_CLAIMS]

    docs = list(usable.values())
    doc_sims = similarities(question, [_doc_text(d) for d in docs])
    ranked_docs = []
    for d, sim in zip(docs, doc_sims):
        kw = overlap(q, _doc_text(d))
        if kw == 0 and sim < 0.35:
            continue
        ranked_docs.append(_Ranked(d, 0.6 * sim + 0.4 * kw, trust.document_trust(session, d)))
    ranked_docs = _keep_best(ranked_docs)

    # ---- cite: claim evidence first, then the best supporting documents
    sources = _Sources(session)
    doc_trust = {r.obj.id: r.trust for r in ranked_docs}
    sentences: list[str] = []
    conflicts = _pending_conflicts(session, client.id)
    conflicted_claims = {cid for cf in conflicts for cid in (cf.new_claim_id, cf.existing_claim_id) if cid}

    evidence_docs: set[str] = set()
    for r in ranked_claims:
        c = r.obj
        evidence_docs.update(
            session.exec(select(ClaimEvidence.document_id).where(ClaimEvidence.claim_id == c.id)).all()
        )
        doc = _claim_source_doc(session, c, usable)
        if doc is None:
            continue
        n = _evidence_count(session, c.id)
        ref = sources.cite(doc, doc_trust.get(doc.id) or trust.document_trust(session, doc), n)
        label = ex.KEY_LABELS.get(c.key, ex.human(c.key))
        value = ex.format_value(session, c.key, c.value, c.unit)
        s = f"The {label} is {value} [{ref}], confirmed by {n} document{'s' if n != 1 else ''}."
        if c.id in conflicted_claims:
            s += " This fact is disputed by another source; see the uncertainties below."
        sentences.append(s)

    doc_sentences = 0
    for r in ranked_docs:
        d = r.obj
        if doc_sentences >= MAX_DOCS:
            break
        if d.id in sources._by_doc or d.id in evidence_docs:  # already counted in "confirmed by N"
            continue
        doc_sentences += 1
        ref = sources.cite(d, r.trust, 1 + _duplicate_count(session, d.id))
        author = ex.person_ref(session, d.author_id)
        when = ex.as_aware(d.updated_at).strftime("%d %b %Y")
        sentences.append(f'"{d.title}" ({author.name}, {when}) notes: "{_best_sentence(d.content, q)}" [{ref}].')

    # ---- uncertainties
    uncertainties: list[str] = []
    for cf in conflicts[:3]:
        uncertainties.append(f"Open {cf.severity.value} conflict: {cf.explanation[:220]}")
    for c in sources.citations:
        doc = sources.docs[c.ref]
        wrong_country = doc.country_scope not in (client.country, "MULTI") and client.country != "MULTI"
        low = c.trust.score < LOW_TRUST
        if wrong_country:
            line = f'Source [{c.ref}] "{c.title}" applies to {doc.country_scope}, not {client.country}.'
            line += (
                f" Trust {c.trust.score}/100 ({c.trust.label}): {_weak_factors(c.trust)}."
                if low
                else " Check before relying on it."
            )
            uncertainties.append(line)
        elif low:
            uncertainties.append(
                f'Source [{c.ref}] "{c.title}" is {c.trust.label} ({c.trust.score}/100): {_weak_factors(c.trust)}.'
            )
    if suspicious:
        n = len(suspicious)
        uncertainties.append(
            f"{n} document{' was' if n == 1 else 's were'} excluded because {'it contains' if n == 1 else 'they contain'} "
            "instruction-like text."
        )
    if not sources.citations:
        uncertainties.append("No document in this record answers the question directly. Ask the record expert.")

    mock_answer = (
        " ".join(sentences)
        if sentences
        else f"I could not find a reliable answer to this question in the record of {client.name}."
    )

    experts = ex.experts_for(session, user, client.id, _classify(question), question)

    # ---- LLM mode (optional): same sources, validated output, mock fallback
    llm_result = _llm_answer(question, client.name, sources, ranked_claims, session) if sources.citations else None
    if llm_result is not None:
        answer_text, used, extra = llm_result
        citations = [c for c in sources.citations if c.ref in used] or sources.citations
        return Answer(
            answer=answer_text,
            citations=citations,
            uncertainties=(uncertainties + extra)[:MAX_UNCERTAINTIES],
            experts=experts,
            mode="llm",
        )

    return Answer(
        answer=mock_answer,
        citations=sources.citations,
        uncertainties=uncertainties[:MAX_UNCERTAINTIES],
        experts=experts,
        mode="mock",
    )


def _llm_answer(question: str, client_name: str, sources: _Sources, ranked_claims, session: Session):
    try:
        from app import llm
    except ImportError:
        return None
    if not llm.llm_enabled():
        return None

    facts = "\n".join(
        f"- {ex.KEY_LABELS.get(r.obj.key, r.obj.key)}: {ex.format_value(session, r.obj.key, r.obj.value, r.obj.unit)} "
        f"(trust {r.trust.score}/100)"
        for r in ranked_claims
    )
    blocks = []
    for c in sources.citations:
        doc = sources.docs[c.ref]
        blocks.append(
            f"[{c.ref}] {c.title} | author {c.author.name} | trust {c.trust.score}/100 {c.trust.label} | "
            f"confirmed by {c.confirmed_by}\n{sanitize.wrap_untrusted(doc.id, doc.content[:3000])}"
        )
    system = (
        sanitize.LLM_SYSTEM_GUARD
        + " Task: answer the consultant's question about one client using ONLY the numbered sources. "
        "Cite every statement inline as [n] with the source number. Plain text only, no markdown, no HTML. "
        "Prefer high-trust sources and say so when sources disagree. Output JSON: "
        '{"answer": str, "used_refs": [int], "uncertainties": [str]}.'
    )
    user_content = (
        f"Client: {client_name}\nQuestion:\n{sanitize.wrap_untrusted('question', question)}\n\n"
        f"Known facts from the client record:\n{facts or '- none'}\n\nSources:\n" + "\n\n".join(blocks)
    )
    out = llm.complete_json(system, user_content, _LLMAnswer)
    if out is None:
        return None

    valid = set(sources.docs)
    used = {r for r in out.used_refs if r in valid}
    text = sanitize.to_plain_text(out.answer, max_len=3000)
    # Drop inline references to sources that do not exist.
    text = _REF.sub(lambda m: m.group(0) if int(m.group(1)) in valid else "", text)
    used |= {int(m) for m in _REF.findall(text) if int(m) in valid}
    if not text.strip() or not used:
        return None
    extra = [sanitize.to_plain_text(u, max_len=300) for u in out.uncertainties if u.strip()][:3]
    return text, used, extra
