"""Live draft check (v2): TrustGrid as an assistant while you type an email or a chat message.

Two dimensions, one call (POST /check):
- HORIZONTAL: every fact in the draft is compared with THIS client's active claims. Same value ->
  "confirmed"; contradicting value (horizontal.is_conflict, or a proposal of a module the client
  declined) -> "conflict" with sources and a consistent rewrite of the sentence; unknown -> "new_fact".
  A draft that is near-identical to an existing document -> "duplicate_document".
- VERTICAL: the same problem at OTHER clients (vertical.find_precedents), with everyone who solved it,
  data-minimized exactly like precedents (client label, masked figures, neutral titles).

READ-ONLY by design: nothing here adds Documents, Claims, Conflicts or DedupDecisions. The draft is
untrusted text: sanitized, checked for prompt injection, never logged, never executed. A suspicious
draft gets no findings, only the warning.
"""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date

from sqlmodel import Session, select

from app import llm, views
from app.agents import capture, dedup, experts, horizontal, trust, vertical
from app.agents.dedup import KEY_LABELS, describe_value, fmt_date, ordinal, person_name
from app.models import (
    Category,
    Claim,
    ClaimEvidence,
    ClaimStatus,
    Client,
    DocStatus,
    DocType,
    Document,
    DossierItem,
    EvidenceRelation,
    ItemStatus,
    Person,
    Severity,
)
from app.schemas import (
    ApproachWarning,
    CheckRequest,
    CheckResult,
    ClientSummary,
    DimensionStatus,
    Expert,
    Experts,
    HorizontalFinding,
    Precedent,
    SimilarCase,
    SourceDoc,
    TopDocument,
    TrustScore,
)
from app.security import rbac
from app.security.auth import CurrentUser
from app.security.sanitize import detect_injection, to_plain_text

MAX_SIMILAR_CASES = 5
MAX_SOURCES = 5
_MIN_CASE_SIMILARITY = 0.55  # without a shared topic
_MIN_TOPIC_CASE_SIMILARITY = 0.45  # with a shared topic (the topic floor lifts these to 0.7 anyway)
_ACTIONABLE = {Category.problem, Category.feature_request, Category.question, Category.complaint}

TOPIC_LABELS = {
    "pay_transparency": "Pay gap reporting (EU Pay Transparency)",
    "payroll_consolidation": "Moving to one payroll provider",
    "hr_system": "HR system and self-service",
    "onboarding": "Onboarding",
    "overtime_premium": "Overtime premium missing on payslips",
    "no_smartphone_self_service": "Self-service for workers without smartphones",
    "retro_corrections": "Retroactive salary corrections",
    "payroll_cutoff": "Mid-month payroll cut-off disputes",
    "leave_balance_migration": "Leave balances after migration",
    "time_registration": "Time registration and works council approval",
}

# How a declined module is kept consistent in a rewrite.
_DECLINED_REWRITE = {
    "digital time registration": "we keep the current paper time registration and will not propose a digital clocking system",
    "shift planning": "you keep your own shift planning tool and we will not propose the shift planning module",
    "employee self-service app": "we will not propose the employee self-service app",
}


# --------------------------------------------------------------------------- per-request memo


@dataclass
class _Ctx:
    session: Session
    user: CurrentUser
    client: Client
    trust_memo: dict[str, TrustScore] = field(default_factory=dict)

    def doc_trust(self, doc: Document) -> TrustScore:
        if doc.id not in self.trust_memo:
            self.trust_memo[doc.id] = trust.document_trust(self.session, doc)
        return self.trust_memo[doc.id]


# --------------------------------------------------------------------------- locating quotes in the ORIGINAL draft


_BOUNDARY_RE = re.compile(r"(?<=[.!?])\s+|\n+")


def sentence_spans(text: str) -> list[tuple[int, int]]:
    """(start, end) of every sentence/line in `text`, whitespace-trimmed. Offsets refer to `text` itself."""
    spans: list[tuple[int, int]] = []

    def add(a: int, b: int) -> None:
        while a < b and text[a].isspace():
            a += 1
        while b > a and text[b - 1].isspace():
            b -= 1
        if b > a:
            spans.append((a, b))

    pos = 0
    for m in _BOUNDARY_RE.finditer(text):
        add(pos, m.start())
        pos = m.end()
    add(pos, len(text))
    return spans


def _words(s: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", s.lower())


def locate(original: str, fragment: str) -> tuple[int, int] | None:
    """Span of `fragment` inside `original`, tolerant of case and whitespace differences."""
    tokens = [t for t in re.split(r"\s+", fragment.strip()) if t]
    if not tokens:
        return None
    pattern = r"\s+".join(re.escape(t) for t in tokens)
    m = re.search(pattern, original, re.IGNORECASE)
    return (m.start(), m.end()) if m else None


def sentence_for(original: str, fragment: str) -> tuple[int, int]:
    """The sentence of `original` that holds most of `fragment` (best word overlap as a fallback)."""
    spans = sentence_spans(original) or [(0, len(original))]
    hit = locate(original, fragment)
    if hit:
        best = max(spans, key=lambda sp: (min(sp[1], hit[1]) - max(sp[0], hit[0]), sp[0]))
        if min(best[1], hit[1]) > max(best[0], hit[0]):
            return best
    want = set(_words(fragment))
    return max(spans, key=lambda sp: (len(want & set(_words(original[sp[0]:sp[1]]))), -sp[0]))


# --------------------------------------------------------------------------- rewrites (deterministic)


def _record_phrase(session: Session, key: str, value: str, unit: str | None) -> str:
    if key == "contact_person":
        return person_name(session, value)
    if key == "go_live_date":
        try:
            d = date.fromisoformat(value)
            return f"{d.day} {d.strftime('%B %Y')}"
        except ValueError:
            return value
    if key == "hr_system":
        return " ".join(w.upper() if w in ("sap", "hcm", "sd") else w.capitalize() for w in value.split()).replace(
            "Innovahr", "InnovaHR").replace("Successfactors", "SuccessFactors")
    if key == "payroll_frequency":
        return value.replace("_", "-")
    return describe_value(key, value, unit)


_NUM_TOKEN = r"(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d+)?|[a-z]+(?:-[a-z]+)?)"


def _replace_number(sentence: str, key: str, draft_value: str, record_value: str) -> str | None:
    """Replace the number in `sentence` that normalizes to draft_value (for `key`) with record_value."""
    if key == "payroll_cutoff_day":
        for m in re.finditer(r"\b(\d{1,2})(st|nd|rd|th)?\b", sentence):
            if m.group(1) == draft_value:
                rep = ordinal(int(record_value)) if m.group(2) else record_value
                return sentence[: m.start()] + rep + sentence[m.end():]
        return None
    if key == "sla_response_hours":
        m = re.search(r"\b(\d+|[a-z]+)\s*(h\b|hours?|business days?|working days?|days?)", sentence, re.IGNORECASE)
        if m and capture.normalize_value(key, m.group(0)) and capture.normalize_value(key, m.group(0))[0] == draft_value:
            return sentence[: m.start()] + f"{record_value} hours" + sentence[m.end():]
        return None
    for m in re.finditer(_NUM_TOKEN, sentence, re.IGNORECASE):
        norm = capture.normalize_value(key, m.group(1))
        if norm and norm[0] == draft_value:
            n = int(record_value) if record_value.isdigit() else None
            rep = f"{n:,}" if n is not None and n >= 10000 else record_value
            return sentence[: m.start()] + rep + sentence[m.end():]
    return None


_PRICE_FIXES = [
    (r"\bat (?:the )?full (?:list )?price\b", "with the agreed {pct}% discount"),
    (r"\bfull (?:list )?price\b", "the price with the agreed {pct}% discount"),
    (r"\bwithout (?:any )?discount\b", "with the agreed {pct}% discount"),
    (r"\bno discount (?:applies|will apply)\b", "the agreed {pct}% discount applies"),
    (r"\bno discount\b", "the agreed {pct}% discount"),
    (r"\bat (?:a )?list price\b", "with the agreed {pct}% discount"),
]


def _rewrite_value(ctx: _Ctx, sentence: str, draft: capture.ExtractedClaim, record: Claim) -> str | None:
    """`sentence` with the draft's value replaced by the record's value, or None when no clean edit exists."""
    s = ctx.session
    if {draft.key, record.key} == {"price_model", "discount_pct"}:
        if draft.key == "price_model" and draft.value == "full_price":
            for pattern, template in _PRICE_FIXES:
                if re.search(pattern, sentence, re.IGNORECASE):
                    return re.sub(pattern, template.format(pct=record.value), sentence, count=1, flags=re.IGNORECASE)
        if draft.key == "discount_pct" and record.value == "full_price":
            return re.sub(rf"\b{re.escape(draft.value)}\s?(?:%|percent|per cent)\s+(?:\w+\s+)?discount", "no discount",
                          sentence, count=1, flags=re.IGNORECASE)
        return None
    if draft.key != record.key:
        return None
    key = draft.key
    if key in ("discount_pct",):
        out = re.sub(rf"\b{re.escape(draft.value)}\s?(%|percent|per cent)", f"{record.value}%", sentence, count=1,
                     flags=re.IGNORECASE)
        return out if out != sentence else None
    if key in ("headcount", "headcount_target", "payroll_provider_count", "invoice_terms_days", "payroll_cutoff_day",
               "sla_response_hours"):
        return _replace_number(sentence, key, draft.value, record.value)
    if key == "go_live_date":
        for m in re.finditer(capture._DATE, sentence, re.IGNORECASE):
            if capture.parse_date(m.group(0)) == draft.value:
                return sentence[: m.start()] + _record_phrase(s, key, record.value, None) + sentence[m.end():]
        return None
    if key == "payroll_frequency":
        m = re.search(capture._FREQ, sentence, re.IGNORECASE)
        if m:
            return sentence[: m.start()] + _record_phrase(s, key, record.value, None) + sentence[m.end():]
        return None
    if key == "contact_person":
        for name, pid in capture.KNOWN_PEOPLE.items():
            if pid == draft.value and (hit := locate(sentence, name)):
                return sentence[: hit[0]] + person_name(s, record.value) + sentence[hit[1]:]
        return None
    if key == "hr_system":
        for alias, canonical in capture._HR_SYSTEMS.items():
            if canonical == draft.value and (hit := locate(sentence, alias)):
                return sentence[: hit[0]] + _record_phrase(s, key, record.value, None) + sentence[hit[1]:]
        return None
    if key == "payroll_country":
        for word, code in capture._COUNTRIES.items():
            if code == draft.value and (hit := re.search(rf"\b{re.escape(word)}\b", sentence, re.IGNORECASE)):
                target = next((w for w, c in capture._COUNTRIES.items() if c == record.value), record.value)
                return sentence[: hit.start()] + target.title() + sentence[hit.end():]
        return None
    if key == "pay_gap_method" and record.value.startswith("integrated"):
        return _integrated_rewrite(sentence)
    return None


def _integrated_rewrite(sentence: str) -> str | None:
    out = sentence
    for pattern, rep in (
        (r"\bmanually in (?:excel|a spreadsheet|spreadsheets)\b", "automatically in one integrated system"),
        (r"\bby hand in (?:excel|a spreadsheet|spreadsheets)\b", "automatically in one integrated system"),
        (r"\bin (?:excel|a spreadsheet|spreadsheets)\b", "in one integrated system"),
        (r"\bmanually\b", "automatically"),
        (r"\bmanual\b", "automated"),
        (r"\b(?:excel|spreadsheets?)\b", "one integrated system"),
    ):
        out = re.sub(pattern, rep, out, flags=re.IGNORECASE)
    return out if out != sentence else None


def _cap(s: str) -> str:
    return s[:1].upper() + s[1:]


def _budget_hint(doc: Document | None) -> str:
    m = re.search(r"before the (\d{4}) budget", (doc.content if doc else "") or "", re.IGNORECASE)
    return f" before the {m.group(1)} budget round" if m else " for now"


def _declined_rewrite(sentence: str, module: str, record: Claim, origin: Document | None) -> str:
    when = fmt_date(origin.created_at if origin else record.valid_from)
    body = _DECLINED_REWRITE.get(module, f"we will not propose {module}")
    return f"As agreed on {when}, {body}{_budget_hint(origin)}."


# --------------------------------------------------------------------------- sources and explanations


def _evidence_docs(session: Session, claim: Claim) -> list[tuple[Document, str]]:
    rows = session.exec(select(ClaimEvidence).where(ClaimEvidence.claim_id == claim.id)).all()
    rows = sorted(rows, key=lambda e: (e.relation != EvidenceRelation.origin, e.added_at, e.id))
    out = []
    for e in rows:
        doc = session.get(Document, e.document_id)
        if doc is not None:
            out.append((doc, e.relation.value))
    return out


def _source(ctx: _Ctx, doc: Document, client_label: str | None = None, excerpt: str | None = None,
            title: str | None = None) -> SourceDoc:
    return SourceDoc(
        document_id=doc.id,
        title=title or doc.title,
        type=doc.type,
        author=views.person_ref(ctx.session, doc.author_id),
        date=doc.created_at,
        trust=ctx.doc_trust(doc),
        excerpt=views.excerpt(excerpt if excerpt is not None else doc.content, 400),
        client_label=client_label,
    )


def _origin(session: Session, claim: Claim) -> Document | None:
    return horizontal.evidence_document(session, claim)


def _in_writing(doc: Document | None) -> str:
    return " in writing" if doc is not None and doc.type in (DocType.email, DocType.contract) else ""


def _confirmed_by(n: int) -> str:
    return f"confirmed by {n} document{'s' if n != 1 else ''}"


def _explain_conflict(ctx: _Ctx, draft: capture.ExtractedClaim | None, record: Claim, evidence_n: int,
                      proposed_module: str | None = None) -> str:
    s = ctx.session
    doc = _origin(s, record)
    who = person_name(s, doc.author_id if doc else record.first_author_id)
    when = fmt_date(doc.created_at if doc else record.valid_from)
    title = f" ('{doc.title}')" if doc else ""
    extra = f" Still valid: {_confirmed_by(evidence_n)}." if evidence_n > 1 else ""
    if proposed_module is not None:
        return (f"You propose {proposed_module}, but on {when} the client explicitly declined it{title}. "
                f"Recorded by {who}.{extra}")
    assert draft is not None
    if {draft.key, record.key} == {"discount_pct", "price_model"}:
        if draft.key == "price_model" and draft.value == "full_price":
            return f"You write full price, but {who} promised a {record.value}% discount{_in_writing(doc)} on {when}{title}.{extra}"
        if draft.key == "discount_pct":
            return (f"You write a {draft.value}% discount, but {who} recorded "
                    f"{describe_value(record.key, record.value)} on {when}{title}.{extra}")
        return (f"You write {describe_value(draft.key, draft.value)}, but {who} recorded a {record.value}% discount "
                f"on {when}{title}.{extra}")
    label = KEY_LABELS.get(draft.key, draft.key.replace("_", " "))
    return (f"You write {describe_value(draft.key, draft.value, draft.unit)} as the {label}, but {who} agreed "
            f"{describe_value(record.key, record.value, record.unit)}{_in_writing(doc)} on {when}{title}.{extra}")


# --------------------------------------------------------------------------- horizontal


@dataclass
class _Pending:
    kind: str
    key: str | None
    draft_value: str | None
    span: tuple[int, int]
    record: Claim | None = None
    severity: Severity | None = None
    explanation: str = ""
    fixes: list = field(default_factory=list)  # (draft ExtractedClaim | module str, record Claim)
    sources: list[SourceDoc] = field(default_factory=list)


def _active_claims(session: Session, client_id: str) -> list[Claim]:
    return list(session.exec(
        select(Claim).where(Claim.client_id == client_id, Claim.status == ClaimStatus.active)
    ).all())


def _horizontal(ctx: _Ctx, original: str, clean: str) -> list[HorizontalFinding]:
    s = ctx.session
    use_llm = llm.llm_enabled()
    extracted = capture.extract_claims(clean, use_llm=use_llm)
    record = _active_claims(s, ctx.client.id)
    evidence_count = {c.id: len(s.exec(select(ClaimEvidence.id).where(ClaimEvidence.claim_id == c.id)).all())
                      for c in record}
    pending: list[_Pending] = []

    for ex in extracted:
        span = sentence_for(original, ex.quote)
        related = [c for c in record if c.key in horizontal.related_keys(ex.key)]
        conflicts = [c for c in related if horizontal.is_conflict(ex, c)]  # type: ignore[arg-type]
        same = [c for c in related if c.key == ex.key and c.value == ex.value]
        if conflicts:
            best = max(conflicts, key=lambda c: (evidence_count.get(c.id, 0), c.valid_from))
            keys = {ex.key, best.key}
            sev = Severity.high if keys & horizontal._HIGH else horizontal.severity_for(ex.key)
            pending.append(_Pending("conflict", ex.key, ex.value, span, best, sev,
                                    _explain_conflict(ctx, ex, best, evidence_count.get(best.id, 0)), [(ex, best)]))
        elif same:
            c = same[0]
            n = evidence_count.get(c.id, 0)
            doc = _origin(s, c)
            latest = f" (first recorded by {person_name(s, doc.author_id)} on {fmt_date(doc.created_at)})" if doc else ""
            pending.append(_Pending("confirmed", ex.key, ex.value, span, c, None,
                                    f"Matches the record: {_confirmed_by(n)}{latest}."))
        else:
            label = KEY_LABELS.get(ex.key, ex.key.replace("_", " "))
            pending.append(_Pending(
                "new_fact", ex.key, ex.value, span, None, None,
                f"Not in the record of {ctx.client.name} yet: {label} = "
                f"{describe_value(ex.key, ex.value, ex.unit)}. Update the record if this is a new agreement."))

    # A draft that PROPOSES a module the client declined contradicts the declined_scope claim.
    declined = [c for c in record if c.key == "declined_scope"]
    for module, sentence in capture.extract_proposals(clean):
        hits = [c for c in declined if horizontal.proposal_conflicts(c, module)]
        if not hits:
            continue
        rec = hits[0]
        pending.append(_Pending(
            "conflict", "declined_scope", module, sentence_for(original, sentence), rec, Severity.high,
            _explain_conflict(ctx, None, rec, evidence_count.get(rec.id, 0), proposed_module=module), [(module, rec)]))

    # Rewrites: all conflict fixes that fall in the same sentence are applied together, so accepting any
    # suggestion yields a sentence that is consistent with the whole record.
    fixes_by_span: dict[tuple[int, int], list] = defaultdict(list)
    for p in pending:
        if p.kind == "conflict":
            fixes_by_span[p.span].extend(p.fixes)
    rewrites: dict[tuple[int, int], str | None] = {}
    for span, fixes in fixes_by_span.items():
        sentence = original[span[0]:span[1]]
        out: str | None = sentence
        for draft, rec in fixes:
            if isinstance(draft, str):  # declined module: the whole sentence changes
                out = _declined_rewrite(sentence, draft, rec, _origin(s, rec))
                break
            new = _rewrite_value(ctx, out, draft, rec)
            if new is None:
                label = KEY_LABELS.get(rec.key, rec.key.replace("_", " "))
                new = f"{out.rstrip('.')} (as agreed earlier, the {label} is {_record_phrase(s, rec.key, rec.value, rec.unit)})."
            out = new
        out = to_plain_text(out) if out is not None else None  # a rewrite never carries markup
        rewrites[span] = out if out and out != sentence else None

    # Duplicate of an existing document of this client (same content, forwarded copy, ...)
    if len(clean) >= 40:
        match = dedup.find_duplicate_document(s, ctx.client.id, clean)
        if match is not None and (doc := s.get(Document, match.matched_id)) is not None:
            stripped = original.strip()
            a = original.find(stripped)
            pending.append(_Pending("duplicate_document", None, None, (a, a + len(stripped)), None, Severity.low,
                                    match.reason + ". Link to it instead of sending the same content again.",
                                    sources=[_source(ctx, doc)]))

    claim_views: dict[str, object] = {}
    findings: list[HorizontalFinding] = []
    order = {"conflict": 0, "duplicate_document": 1, "confirmed": 2, "new_fact": 3}
    seen: set[tuple] = set()
    for p in sorted(pending, key=lambda p: (order[p.kind], p.span[0])):
        sig = (p.kind, p.key, p.draft_value, p.span)
        if sig in seen:
            continue
        seen.add(sig)
        record_view = None
        sources = p.sources
        if p.record is not None:
            if p.record.id not in claim_views:
                claim_views[p.record.id] = views.claim_view(s, p.record)
            record_view = claim_views[p.record.id]
            sources = [_source(ctx, d) for d, _ in _evidence_docs(s, p.record)[:MAX_SOURCES]]
        label = "Duplicate document" if p.kind == "duplicate_document" else _cap(
            KEY_LABELS.get(p.key or "", (p.key or "").replace("_", " ")))
        findings.append(HorizontalFinding(
            kind=p.kind,
            key=p.key,
            key_label=label,
            draft_value=p.draft_value,
            draft_quote=original[p.span[0]:p.span[1]],
            record_value=p.record.value if p.record is not None else None,
            record_claim=record_view,
            sources=sources,
            severity=p.severity,
            explanation=p.explanation[:2000],
            suggested_rewrite=rewrites.get(p.span) if p.kind == "conflict" else None,
        ))
    return findings


# --------------------------------------------------------------------------- vertical


def _linked_docs(session: Session, item: DossierItem) -> list[Document]:
    ids = list(item.linked_document_ids or [])
    if not ids:
        return []
    docs = session.exec(select(Document).where(Document.id.in_(ids))).all()  # type: ignore[attr-defined]
    return [d for d in docs if not d.suspicious and d.status != DocStatus.duplicate]


def solvers_of(session: Session, item: DossierItem) -> list[str]:
    """Everyone who solved a resolved item: authors of its solution documents (oldest first), else the expert."""
    if item.status != ItemStatus.resolved:
        return []
    out: list[str] = []
    for d in sorted(_linked_docs(session, item), key=lambda d: d.created_at):
        if d.type == DocType.solution and d.author_id not in out:
            out.append(d.author_id)
    return out or [vertical.item_expert_id(session, item)]


def _approach_label(item: DossierItem, client: Client | None, show_name: bool) -> str | None:
    kind = vertical.approach_of(vertical._item_text(item))
    if kind:
        return vertical._APPROACH_PHRASE[kind]
    if item.status == ItemStatus.resolved and item.resolution:
        first = re.split(r"(?<=[.;])\s", item.resolution.strip())[0].rstrip(".;")
        return vertical._minimize(first, client, show_name, 140)
    return None


@dataclass
class _Case:
    view: SimilarCase
    item: DossierItem
    precedent: Precedent
    solver_ids: list[str]


def _similar_cases(ctx: _Ctx, text: str, category: Category | None) -> list[_Case]:
    s = ctx.session
    draft_topics = vertical._topics(text)
    cases: list[_Case] = []
    for p in vertical.find_precedents(s, ctx.user, ctx.client.id, text, category, k=MAX_SIMILAR_CASES * 2):
        item = s.get(DossierItem, p.dossier_item_id)
        if item is None or item.client_id == ctx.client.id:
            continue
        shared = bool(draft_topics & vertical._topics(vertical._item_text(item)))
        if p.similarity < (_MIN_TOPIC_CASE_SIMILARITY if shared else _MIN_CASE_SIMILARITY):
            continue
        if draft_topics and not shared and p.similarity < 0.65:
            continue  # the draft is clearly about something else
        client = s.get(Client, item.client_id)
        show_name = rbac.can_see_client_name(ctx.user, item.client_id)
        solver_ids = solvers_of(s, item)
        docs = sorted(_linked_docs(s, item), key=lambda d: (d.type != DocType.solution, -ctx.doc_trust(d).score))
        sources = [
            _source(ctx, d, client_label=p.client_label,
                    excerpt=vertical._minimize(d.content, client, show_name, 400),
                    title=d.title if show_name else experts.minimized_title(d, p.client_label))
            for d in docs[:3]
        ]
        cases.append(_Case(
            view=SimilarCase(
                dossier_item_id=item.id,
                client_label=p.client_label,
                category=item.category,
                title=p.title,
                resolution_summary=p.resolution_summary,
                approach=_approach_label(item, client, show_name),
                date=p.date,
                similarity=p.similarity,
                status=item.status.value,
                solvers=[views.person_ref(s, pid) for pid in solver_ids],
                sources=sources,
            ),
            item=item, precedent=p, solver_ids=solver_ids,
        ))
        if len(cases) >= MAX_SIMILAR_CASES:
            break
    # Resolved cases first (they carry a proven solution), then by similarity.
    cases.sort(key=lambda c: (c.view.status != "resolved", -c.view.similarity))
    return cases


def _problem_experts(ctx: _Ctx, cases: list[_Case]) -> list[Expert]:
    s = ctx.session
    solved: dict[str, list[_Case]] = defaultdict(list)
    for c in cases:
        for pid in c.solver_ids:
            solved[pid].append(c)
    if not solved:
        return []
    pool = {pid: cs for pid, cs in solved.items() if pid != ctx.user.person_id} or solved
    out: list[tuple[tuple, Expert]] = []
    for pid, cs in pool.items():
        person = s.get(Person, pid)
        if person is None:
            continue
        rel = trust.person_reliability(s, pid)
        labels = sorted({c.view.client_label for c in cs})
        latest = max(c.view.date for c in cs)
        n = len(cs)
        top: list[tuple[int, TopDocument]] = []
        for c in cs:
            show_name = rbac.can_see_client_name(ctx.user, c.item.client_id)
            for d in _linked_docs(s, c.item):
                if pid not in (d.author_id, d.owner_id):
                    continue
                ts = ctx.doc_trust(d)
                title = d.title if show_name else experts.minimized_title(d, c.view.client_label)
                top.append((0 if d.type == DocType.solution else 1, TopDocument(id=d.id, title=title, trust=ts)))
        top.sort(key=lambda t: (t[0], -t[1].trust.score))
        reason = (f"Solved {n} similar case{'s' if n != 1 else ''} at other clients ({'; '.join(labels)}), "
                  f"most recently in {latest.strftime('%b %Y')}")
        expert = Expert(
            person=views.person_ref(s, pid),
            kind="problem_expert",
            reason=reason,
            reliability=rel,
            solved_count=n,
            top_documents=[t for _, t in top[:3]],
            contact=person.email,
        )
        out.append(((-n, -max(c.view.similarity for c in cs), -rel.score, pid), expert))
    out.sort(key=lambda t: t[0])
    return [e for _, e in out]


def _approach_warning(ctx: _Ctx, original: str, clean: str, cases: list[_Case]) -> ApproachWarning | None:
    draft = vertical.approach_of(clean)
    if draft is None:
        return None
    for c in cases:
        if c.item.status != ItemStatus.resolved or c.view.similarity < vertical.APPROACH_SIMILARITY:
            continue
        proven = vertical.approach_of(vertical._item_text(c.item))
        if proven is None or proven == draft:
            continue
        who = person_name(ctx.session, c.solver_ids[0]) if c.solver_ids else "a colleague"
        keywords = vertical._MANUAL if draft == "manual" else vertical._INTEGRATED
        quote = None
        for a, b in sentence_spans(original):
            if any(k in original[a:b].lower() for k in keywords):
                quote = original[a:b]
                break
        rewrite = _integrated_rewrite(quote) if (quote and proven == "integrated") else None
        return ApproachWarning(
            explanation=(
                f"At {c.view.client_label}, {who} solved this with {vertical._APPROACH_PHRASE[proven]} "
                f"({fmt_date(c.item.created_at)}). Your draft uses {vertical._APPROACH_PHRASE[draft]}. "
                f"Check with {who} whether the proven approach applies before you send this."
            ),
            draft_approach=vertical._APPROACH_PHRASE[draft],
            proven_approach=vertical._APPROACH_PHRASE[proven],
            draft_quote=quote,
            suggested_rewrite=rewrite,
        )
    return None


# --------------------------------------------------------------------------- headlines


def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def _horizontal_status(client: Client, findings: list[HorizontalFinding]) -> DimensionStatus:
    conflicts = sum(f.kind == "conflict" for f in findings)
    confirmed = sum(f.kind == "confirmed" for f in findings)
    new = sum(f.kind == "new_fact" for f in findings)
    dup = any(f.kind == "duplicate_document" for f in findings)
    if conflicts:
        return DimensionStatus(status="conflict",
                               headline=f"{_plural(conflicts, 'inconsistency', 'inconsistencies')} with earlier promises to {client.name}")
    if confirmed:
        tail = f" · {new} new" if new else ""
        return DimensionStatus(status="consistent",
                               headline=f"Consistent with {_plural(confirmed, 'fact', 'facts')} in this record{tail}")
    if dup:
        return DimensionStatus(status="info", headline="Looks like a copy of an existing document")
    if new:
        return DimensionStatus(status="info", headline=f"{_plural(new, 'new fact', 'new facts')}, not in this record yet")
    return DimensionStatus(status="empty", headline="Nothing in this draft contradicts the record")


def _vertical_status(cases: list[_Case], experts_n: int, warning: ApproachWarning | None) -> DimensionStatus:
    if not cases:
        return DimensionStatus(status="empty", headline="No similar cases at other clients")
    solved_clients = len({c.item.client_id for c in cases if c.item.status == ItemStatus.resolved})
    open_clients = len({c.item.client_id for c in cases if c.item.status != ItemStatus.resolved})
    if solved_clients:
        head = (f"{_plural(solved_clients, 'client', 'clients')} solved this before · "
                f"{_plural(experts_n, 'person', 'people')} can help")
    else:
        head = f"{_plural(open_clients, 'other client has', 'other clients have')} the same open problem"
    if warning is not None:
        return DimensionStatus(status="conflict", headline=f"Different approach than the proven one · {head}")
    return DimensionStatus(status="info", headline=head)


# --------------------------------------------------------------------------- entry point


def _summary(session: Session, user: CurrentUser, client: Client) -> ClientSummary:
    from app.api.clients import _summary as client_summary  # single source for ClientSummary

    return client_summary(session, user, client)


def check_draft(session: Session, user: CurrentUser, body: CheckRequest) -> CheckResult:
    """Check a draft against this client's record (horizontal) and other clients (vertical). Read-only."""
    client = rbac.get_client_or_404(session, body.client_id)
    ctx = _Ctx(session, user, client)
    original = body.text
    clean = to_plain_text(original)
    subject = to_plain_text(body.subject or "", max_len=200)
    reason = detect_injection(f"{subject}\n{clean}")
    mode = "llm" if llm.llm_enabled() else "mock"
    summary = _summary(session, user, client)

    if reason is not None:
        blocked = DimensionStatus(status="info", headline="Not checked: the draft contains instruction-like text")
        return CheckResult(
            client=summary, detected_category=None, topic=None,
            horizontal=blocked, horizontal_findings=[], vertical=blocked, similar_cases=[],
            approach_warning=None,
            experts=Experts(record_expert=experts.record_expert(session, client.id, exclude_person_id=user.person_id),
                            problem_expert=None),
            problem_experts=[], suspicious=True, suspicious_reason=reason, mode=mode,
        )

    findings = _horizontal(ctx, original, clean) if clean else []

    about = f"{subject}. {clean}" if subject else clean
    category = capture.classify_category(about) if clean else None
    matched = capture._classify(about)[1] if clean else False
    topics = vertical._topics(about)
    run_vertical = bool(clean) and category != Category.commercial and (
        (matched and category in _ACTIONABLE) or bool(topics))
    cases = _similar_cases(ctx, about, category) if run_vertical else []
    warning = _approach_warning(ctx, original, clean, cases) if cases else None
    problem_experts = _problem_experts(ctx, cases)

    topic = next((TOPIC_LABELS[t] for t in sorted(topics) if t in TOPIC_LABELS), None) if run_vertical else None
    if topic is None and cases:
        topic = cases[0].view.title

    return CheckResult(
        client=summary,
        detected_category=category if (matched or cases) else None,
        topic=topic,
        horizontal=_horizontal_status(client, findings),
        horizontal_findings=findings,
        vertical=_vertical_status(cases, len(problem_experts), warning),
        similar_cases=[c.view for c in cases],
        approach_warning=warning,
        experts=Experts(
            record_expert=experts.record_expert(session, client.id, exclude_person_id=user.person_id),
            problem_expert=problem_experts[0] if problem_experts else None,
        ),
        problem_experts=problem_experts,
        suspicious=False,
        suspicious_reason=None,
        mode=mode,
    )

