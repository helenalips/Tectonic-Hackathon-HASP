"""Capture agent: turns a client touchpoint into a Document, a DossierItem and deduplicated Claims.

Deterministic rule extractor (mock path, always available) + optional Claude enhancement.
Cross-module calls go to Agent 2's dedup / horizontal / vertical / views modules; when one of
those is not available yet (ImportError / NotImplementedError) a minimal local fallback is used so
capture and seeding keep working. Fallbacks follow the same rules (same client only).

Document text is untrusted data: it is sanitized, checked for prompt injection, never executed,
and only sent to the LLM wrapped in <untrusted_document> tags (never for suspicious documents).
"""
from __future__ import annotations

import hashlib
import importlib
import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models import (
    Category,
    Claim,
    ClaimEvidence,
    ClaimStatus,
    Client,
    Conflict,
    DedupDecision,
    DedupLevel,
    DedupOutcome,
    DocStatus,
    Document,
    DossierItem,
    EvidenceRelation,
    ItemStatus,
    Person,
    Resolution,
    Source,
)
from app.schemas import (
    ClaimView,
    ConflictView,
    ConsistencyStatus,
    DedupDecisionView,
    DossierItemView,
    EventCreate,
    EventResult,
    EvidenceView,
    PersonRef,
    TrustScore,
)
from app.security import audit
from app.security.sanitize import detect_injection, to_plain_text, wrap_untrusted

# --------------------------------------------------------------------------- taxonomy

CLAIM_KEYS: tuple[str, ...] = (
    "discount_pct",
    "price_model",
    "headcount",
    "headcount_target",
    "go_live_date",
    "payroll_frequency",
    "payroll_country",
    "payroll_provider_count",
    "hr_system",
    "self_service_status",
    "sla_response_hours",
    "pay_gap_method",
    "contact_person",
)
ClaimKey = Literal[
    "discount_pct",
    "price_model",
    "headcount",
    "headcount_target",
    "go_live_date",
    "payroll_frequency",
    "payroll_country",
    "payroll_provider_count",
    "hr_system",
    "self_service_status",
    "sla_response_hours",
    "pay_gap_method",
    "contact_person",
]

# Fictional generated people (contracts/schema.md §7); used to resolve contact_person names.
KNOWN_PEOPLE: dict[str, str] = {
    "jan peeters": "p-jan",
    "sofie maes": "p-sofie",
    "tomasz nowak": "p-tomasz",
    "lotte de vries": "p-lotte",
    "abebe tesfaye": "p-abebe",
    "elena rossi": "p-elena",
    "marc dubois": "p-marc",
    "noor el amrani": "p-noor",
}

_NUMBER_WORDS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
    "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
    "twenty-five": 25, "thirty": 30, "forty": 40, "fifty": 50, "a single": 1, "single": 1,
}
_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6, "july": 7,
    "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "sept": 9,
    "oct": 10, "nov": 11, "dec": 12,
}
_COUNTRIES = {
    "belgium": "BE", "belgian": "BE", "poland": "PL", "polish": "PL", "ethiopia": "ET",
    "ethiopian": "ET", "netherlands": "NL", "the netherlands": "NL", "dutch": "NL", "holland": "NL",
    "france": "FR", "french": "FR", "germany": "DE", "german": "DE", "nigeria": "NG",
    "nigerian": "NG", "kenya": "KE", "kenyan": "KE", "italy": "IT", "italian": "IT", "spain": "ES",
    "spanish": "ES", "luxembourg": "LU", "austria": "AT", "ireland": "IE", "switzerland": "CH",
    "portugal": "PT", "czech republic": "CZ", "romania": "RO", "united kingdom": "GB", "uk": "GB",
}
_HR_SYSTEMS = {
    "sd worx innovahr": "sd worx innovahr",
    "innovahr": "sd worx innovahr",
    "sap successfactors": "sap successfactors",
    "successfactors": "sap successfactors",
    "workday": "workday",
    "sap hcm": "sap hcm",
    "personio": "personio",
}


@dataclass
class ExtractedClaim:
    key: str
    value: str
    unit: str | None
    confidence: float
    quote: str


# --------------------------------------------------------------------------- normalization


def _clean(raw: str) -> str:
    return re.sub(r"\s+", " ", str(raw)).strip().lower()


def _parse_number(raw: str) -> float | None:
    s = _clean(raw)
    s = re.sub(r"(€|eur\b|%|per ?cent|percent)", " ", s)
    s = re.sub(r"^(about|around|approximately|approx\.?|nearly|almost|roughly|some|circa|ca\.?)\s+", "", s.strip())
    s = s.strip()
    if s in _NUMBER_WORDS:
        return float(_NUMBER_WORDS[s])
    m = re.fullmatch(r"(\d+(?:[.,]\d+)?)\s*k", s)
    if m:
        return float(m.group(1).replace(",", ".")) * 1000
    if re.fullmatch(r"\d{1,3}(?:[.,\s]\d{3})+", s):  # 1.000 / 1,000 / 1 000 -> thousands separators
        return float(re.sub(r"[.,\s]", "", s))
    if re.fullmatch(r"\d+(?:[.,]\d+)?", s):
        return float(s.replace(",", "."))
    return None


def _fmt(n: float) -> str:
    if float(n).is_integer():
        return str(int(n))
    return f"{n:.4f}".rstrip("0").rstrip(".")


def parse_date(raw: str) -> str | None:
    """Common date forms -> ISO YYYY-MM-DD (European day-first for numeric forms)."""
    s = _clean(raw).rstrip(".,")
    s = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", s).replace(" of ", " ")
    candidates: list[tuple[int, int, int]] = []
    if m := re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", s):
        candidates.append((int(m[1]), int(m[2]), int(m[3])))
    elif m := re.fullmatch(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", s):
        candidates.append((int(m[3]), int(m[2]), int(m[1])))
    elif m := re.fullmatch(r"(\d{1,2})\s+([a-z]+)\s*,?\s+(\d{4})", s):
        if m[2] in _MONTHS:
            candidates.append((int(m[3]), _MONTHS[m[2]], int(m[1])))
    elif m := re.fullmatch(r"([a-z]+)\s+(\d{1,2}),?\s+(\d{4})", s):
        if m[1] in _MONTHS:
            candidates.append((int(m[3]), _MONTHS[m[1]], int(m[2])))
    elif m := re.fullmatch(r"([a-z]+)\s+(\d{4})", s):
        if m[1] in _MONTHS:
            candidates.append((int(m[2]), _MONTHS[m[1]], 1))
    for y, mo, d in candidates:
        try:
            return date(y, mo, d).isoformat()
        except ValueError:
            return None
    return None


def normalize_value(key: str, raw: str) -> tuple[str, str | None] | None:
    """Normalize a raw value for a taxonomy key. Returns (value, unit) or None if invalid."""
    if key not in CLAIM_KEYS or raw is None:
        return None
    s = _clean(raw)
    if not s or len(s) > 200:
        return None

    if key == "discount_pct":
        n = _parse_number(s)
        return (_fmt(n), "%") if n is not None and 0 <= n <= 100 else None

    if key == "price_model":
        if s in ("full_price", "discounted", "fixed_fee"):
            return s, None
        if re.search(r"full (list )?price|no discount|without (any )?discount|list price", s):
            return "full_price", None
        if re.search(r"fixed[- _](fee|price)", s):
            return "fixed_fee", None
        if "discount" in s:
            return "discounted", None
        return None

    if key in ("headcount", "headcount_target", "payroll_provider_count"):
        s2 = re.sub(r"\b(employees?|staff|workers|fte?s?|providers?|payroll)\b", "", s).strip()
        n = _parse_number(s2)
        limit = 1000 if key == "payroll_provider_count" else 10_000_000
        if n is None or not float(n).is_integer() or not (0 < n <= limit):
            return None
        return _fmt(n), ("providers" if key == "payroll_provider_count" else "employees")

    if key == "go_live_date":
        iso = parse_date(s)
        return (iso, None) if iso else None

    if key == "payroll_frequency":
        if re.search(r"semi[- _]?monthly|twice a month", s):
            return "semi_monthly", None
        if re.search(r"bi[- ]?weekly|fortnightly|every two weeks", s):
            return "biweekly", None
        if re.search(r"\bweekly\b", s):
            return "weekly", None
        if re.search(r"\bmonthly\b|once a month", s):
            return "monthly", None
        return None

    if key == "payroll_country":
        if s in _COUNTRIES:
            return _COUNTRIES[s], None
        if re.fullmatch(r"[a-z]{2}", s):
            return s.upper(), None
        return None

    if key == "hr_system":
        for alias, canonical in _HR_SYSTEMS.items():
            if alias in s:
                return canonical, None
        return (s, None) if re.fullmatch(r"[a-z0-9][a-z0-9 .&/+-]{1,59}", s) else None

    if key == "self_service_status":
        if s in ("live", "planned", "not_planned"):
            return s, None
        if re.search(r"not planned|no plans?|not_planned", s):
            return "not_planned", None
        if re.search(r"not (yet )?live|isn't live|is not live|planned|next year|roadmap", s):
            return "planned", None
        if re.search(r"\blive\b|available|went live|in use", s):
            return "live", None
        return None

    if key == "sla_response_hours":
        m = re.search(r"(\d+(?:[.,]\d+)?|[a-z]+)\s*(h\b|hours?|business days?|working days?|days?)?", s)
        if not m:
            return None
        n = _parse_number(m.group(1))
        if n is None:
            return None
        if m.group(2) and "day" in m.group(2):
            n *= 24
        return (_fmt(n), "hours") if float(n).is_integer() and 0 < n <= 24 * 30 else None

    if key == "pay_gap_method":
        return (s, None) if len(s) <= 80 and re.search(r"[a-z]", s) else None

    if key == "contact_person":
        if re.fullmatch(r"p-[a-z0-9-]{1,36}", s):
            return s, None
        for name, pid in KNOWN_PEOPLE.items():
            if name in s:
                return pid, None
        return None
    return None


# --------------------------------------------------------------------------- rule extractor

_NUM = r"(?:\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d+)?)"
_NUMWORD = r"(?:" + "|".join(sorted((w for w in _NUMBER_WORDS if " " not in w), key=len, reverse=True)) + r")"
_PCT = rf"(?:{_NUM}\s?(?:%|per ?cent|percent)|{_NUMWORD}\s+(?:per ?cent|percent))"
_MONTH_NAMES = r"(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)"
_DATE = (
    rf"(?:\d{{4}}-\d{{1,2}}-\d{{1,2}}|\d{{1,2}}[/.-]\d{{1,2}}[/.-]\d{{4}}"
    rf"|\d{{1,2}}(?:st|nd|rd|th)?\s+(?:of\s+)?{_MONTH_NAMES}\s*,?\s+\d{{4}}"
    rf"|{_MONTH_NAMES}\s+\d{{1,2}}(?:st|nd|rd|th)?,?\s+\d{{4}}|{_MONTH_NAMES}\s+\d{{4}})"
)
_COUNTRY_RE = "|".join(sorted((re.escape(c) for c in _COUNTRIES), key=len, reverse=True))
_PEOPLE_RE = "|".join(re.escape(n) for n in KNOWN_PEOPLE)
_FREQ = r"(semi[- ]?monthly|twice a month|bi[- ]?weekly|fortnightly|every two weeks|monthly|weekly)"
_HEAD_NOUN = r"(?:employees|staff|workers|people|ftes?)\b"
_TARGET_CTX = re.compile(r"(target|grow|growing|scale|scaling|expand|expanding|reach|ambition|up to)\W*(?:\w+\W+){0,4}$")

_RULES: list[tuple[str, re.Pattern[str], float]] = [
    ("discount_pct", re.compile(rf"({_PCT})\s+(?:commercial\s+|volume\s+|loyalty\s+)?(?:discount|reduction|rebate)"), 0.9),
    ("discount_pct", re.compile(rf"(?:discount|reduction|rebate)\s+(?:of|at|is|stays at|remains)\s+({_PCT})"), 0.9),
    ("price_model", re.compile(r"(full (?:list )?price|no discount|without (?:any )?discount|fixed[- ]fee|fixed price)"), 0.85),
    ("headcount_target", re.compile(rf"\btarget(?:\s+headcount)?\s+(?:of\s+)?(?:about\s+|around\s+)?({_NUM})(?!\s*[-/.]\d)(?:\s+{_HEAD_NOUN})?"), 0.85),
    ("headcount_target", re.compile(rf"\b(?:grow|growing|scale|scaling|expand|expanding)\s+to\s+(?:about\s+|around\s+)?({_NUM})\s+{_HEAD_NOUN}"), 0.85),
    ("headcount", re.compile(rf"\bheadcount(?:\s+in\s+scope)?\s*(?:of|is|:|=)\s*(?:about\s+|around\s+|approximately\s+|nearly\s+)?({_NUM})"), 0.9),
    ("headcount", re.compile(rf"(?<![\d.,])({_NUM})\s+{_HEAD_NOUN}"), 0.8),
    ("go_live_date", re.compile(rf"go[- ]live(?:\s+date)?(?:\s+of\s+[\w ]{{1,30}}?)?\s*(?:is|was|of|on|:|planned for|scheduled for|set for|moved to|as of)?\s*(?:on\s+)?({_DATE})"), 0.85),
    ("go_live_date", re.compile(rf"(?:went|go|goes|going) live\s+(?:on|as of|in)\s+({_DATE})"), 0.8),
    ("payroll_frequency", re.compile(rf"{_FREQ}\s+(?:payroll|pay run|pay cycle|salary|salaries|payment)"), 0.8),
    ("payroll_frequency", re.compile(rf"(?:payroll|pay run|pay cycle|salaries)\s+(?:is\s+|are\s+|runs\s+|is run\s+|is processed\s+|processed\s+|paid\s+)?{_FREQ}"), 0.8),
    ("payroll_frequency", re.compile(rf"\b(?:processed|run|paid)\s+{_FREQ}"), 0.75),
    ("payroll_country", re.compile(rf"payroll\s+(?:country\s*:?\s*|in\s+|for\s+)({_COUNTRY_RE})\b"), 0.75),
    ("payroll_country", re.compile(rf"\b({_COUNTRY_RE})\s+payroll\b"), 0.7),
    ("hr_system", re.compile(r"\b(sd worx innovahr|innovahr|sap successfactors|successfactors|workday|sap hcm|personio)\b"), 0.85),
    ("self_service_status", re.compile(r"self[- ]service(?:\s+for\s+[\w ]{1,40}?)?\s+(?:is\s+|was\s+|has\s+)?(not live yet|isn't live yet|is not live yet|not yet live|not live|planned|went live|live|not planned)"), 0.8),
    ("self_service_status", re.compile(r"((?:no plans?|not planning)\s+(?:for\s+)?)self[- ]service"), 0.8),
    ("sla_response_hours", re.compile(r"(?:sla|response time|respond within|response within|reply within)[^.\n]{0,30}?(\d+\s*(?:h\b|hours?|business days?|working days?|days?)|(?:one|two|three) (?:business |working )?days?)"), 0.85),
    ("contact_person", re.compile(rf"(?:contact person|point of contact|main contact|account owner)[^.\n]{{0,25}}?({_PEOPLE_RE})"), 0.8),
]

_INTEGRATED_RE = re.compile(r"(single|one|integrated|same)\s+(integrated\s+)?(system|platform|tool)")
_ARCH_RE = re.compile(r"competence matrix|job architecture|salary scale|job matrix|job classification")
_EXCEL_RE = re.compile(r"\b(excel|spreadsheets?)\b")
_MANUAL_RE = re.compile(r"\bmanual(ly)?\b|by hand|spreadsheet")
_PAY_CTX_RE = re.compile(r"pay gap|pay equity|salary|compensation|pay framework|remuneration")
_REPLACE_RE = re.compile(r"replac\w*|instead of|move away from|moved away from|no longer|phase out|retire")


def _sentence(low: str, m: re.Match[str]) -> str:
    start = max(low.rfind(".", 0, m.start()) + 1, 0)
    end = low.find(".", m.end())
    return low[start: end if end >= 0 else len(low)].strip()[:200]


def _pay_gap_method(low: str) -> ExtractedClaim | None:
    if not _PAY_CTX_RE.search(low):
        return None
    integrated = bool(_INTEGRATED_RE.search(low) and _ARCH_RE.search(low))
    excel = bool(_EXCEL_RE.search(low) and _MANUAL_RE.search(low))
    if integrated and (not excel or _REPLACE_RE.search(low)):
        m = _INTEGRATED_RE.search(low)
        return ExtractedClaim("pay_gap_method", "integrated system with job architecture", None, 0.75, _sentence(low, m))
    if excel:
        m = _EXCEL_RE.search(low)
        return ExtractedClaim("pay_gap_method", "manual excel calculation", None, 0.75, _sentence(low, m))
    return None


def _provider_count(low: str) -> ExtractedClaim | None:
    m = re.search(
        rf"(?:down to|reduced to|consolidat\w* (?:in)?to|to)\s+({_NUM}|one|a single)\s+(?:multinational\s+)?payroll providers?",
        low,
    )
    if not m:
        m = re.search(rf"(?:single|one)\s+(multinational\s+)?payroll provider", low)
        if m:
            return ExtractedClaim("payroll_provider_count", "1", "providers", 0.8, m.group(0))
        m = re.search(rf"({_NUM})\s+(?:separate\s+|different\s+|local\s+)?payroll providers", low)
    if not m:
        return None
    norm = normalize_value("payroll_provider_count", m.group(1))
    return ExtractedClaim("payroll_provider_count", norm[0], norm[1], 0.8, m.group(0)) if norm else None


def _rule_extract(text: str) -> list[ExtractedClaim]:
    low = re.sub(r"\s+", " ", text.lower())
    out: list[ExtractedClaim] = []
    for key, pattern, conf in _RULES:
        for m in pattern.finditer(low):
            raw = m.group(1)
            k = key
            if key == "headcount":
                before = low[max(0, m.start() - 40): m.start()]
                if _TARGET_CTX.search(before):
                    k = "headcount_target"
                elif re.search(r"\bnew\s*$|\b(daily|per day|each day|every day)\b", low[m.start(): m.end() + 20]):
                    continue
            norm = normalize_value(k, raw)
            if norm:
                quote = text_quote(text, m.group(0))
                out.append(ExtractedClaim(k, norm[0], norm[1], conf, quote))
    for extra in (_pay_gap_method(low), _provider_count(low)):
        if extra:
            out.append(extra)
    # InnovaHR is built on SuccessFactors: report the product the client actually uses.
    if any(c.key == "hr_system" and c.value == "sd worx innovahr" for c in out):
        out = [c for c in out if not (c.key == "hr_system" and c.value == "sap successfactors")]
    return _unique(out)


def text_quote(text: str, fragment: str) -> str:
    """Return the original-case fragment for a lowercase match (best effort), max 200 chars."""
    flat = re.sub(r"\s+", " ", text)
    i = flat.lower().find(fragment)
    return (flat[i: i + len(fragment)] if i >= 0 else fragment)[:200]


def _unique(claims: list[ExtractedClaim]) -> list[ExtractedClaim]:
    seen: set[tuple[str, str]] = set()
    out = []
    for c in claims:
        if (c.key, c.value) not in seen:
            seen.add((c.key, c.value))
            out.append(c)
    return out


# --------------------------------------------------------------------------- optional LLM path


class _LlmClaim(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: ClaimKey
    value: str = Field(max_length=200)
    quote: str = Field(default="", max_length=300)


class _LlmClaims(BaseModel):
    model_config = ConfigDict(extra="forbid")
    claims: list[_LlmClaim] = Field(default_factory=list, max_length=30)


_EXTRACT_SYSTEM = (
    "Extract factual claims about the client from the document. Allowed keys only: "
    + ", ".join(CLAIM_KEYS)
    + '. Return {"claims": [{"key": ..., "value": ..., "quote": ...}]} where quote is the exact source phrase. '
    "Only include facts the document states as true now; skip questions, hypotheticals and targets unless the key "
    "is headcount_target. For price_model use full_price | discounted | fixed_fee."
)


def _llm_extract(text: str) -> list[ExtractedClaim]:
    from app import llm

    if not llm.llm_enabled():
        return []
    result = llm.complete_json(_EXTRACT_SYSTEM, wrap_untrusted("event", text), _LlmClaims)
    if result is None:
        return []
    out = []
    for c in result.claims:
        norm = normalize_value(c.key, c.value)
        if norm:  # re-normalized; invalid values dropped
            out.append(ExtractedClaim(c.key, norm[0], norm[1], 0.7, c.quote[:200]))
    return out


def extract_claims(text: str, *, use_llm: bool = True) -> list[ExtractedClaim]:
    """Taxonomy-only claims with normalized values. Rules always run; the LLM may add more."""
    clean = to_plain_text(text)
    claims = _rule_extract(clean)
    if use_llm and detect_injection(clean) is None:
        have = {(c.key, c.value) for c in claims}
        rule_keys = {c.key for c in claims}
        for c in _llm_extract(clean):
            # rules win on keys they already cover (deterministic demo behaviour)
            if (c.key, c.value) not in have and c.key not in rule_keys:
                claims.append(c)
                have.add((c.key, c.value))
    return claims


# --------------------------------------------------------------------------- classification

_CATEGORY_RULES: list[tuple[Category, re.Pattern[str]]] = [
    (Category.complaint, re.compile(r"\bcomplain\w*|unacceptable|not satisfied|dissatisfied|frustrat\w*|escalat\w*|very unhappy")),
    (Category.feature_request, re.compile(r"feature request|would like|we need an?\b|they need an?\b|needs an?\b|can you add|could you add|enhancement|new report|\breport\b|\bwish\b")),
    (Category.problem, re.compile(r"\berror\w*|\bwrong\b|incorrect|\bbug\b|fail\w*|crash\w*|\bissue\b|problem|not working|broken|missing|delay\w*|discrepanc\w*")),
    (Category.commercial, re.compile(r"discount|\bprice\b|pricing|invoice\w*|\bfee\b|quote|proposal|commercial|renewal|contract value")),
    (Category.payroll_rule, re.compile(r"overtime|\bleave\b|holiday|vacation|\btax\b|social security|allowance|payroll rule|bonus|policy|statutory")),
]
_QUESTION_RE = re.compile(r"\?|^(do|does|did|can|could|should|is|are|how|what|which|when|who|why|will)\b")


def _classify(text: str) -> tuple[Category, bool]:
    """Return (category, matched_by_rule)."""
    low = re.sub(r"\s+", " ", to_plain_text(text).lower()).strip()
    if _CATEGORY_RULES[0][1].search(low):
        return Category.complaint, True
    if _QUESTION_RE.search(low) and "feature request" not in low:
        return Category.question, True
    for cat, pattern in _CATEGORY_RULES[1:]:
        if pattern.search(low):
            return cat, True
    return Category.payroll_rule, False


class _LlmCategory(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: Category


def classify_category(text: str) -> Category:
    cat, matched = _classify(text)
    if matched:
        return cat
    from app import llm

    if llm.llm_enabled() and detect_injection(text) is None:
        res = llm.complete_json(
            "Classify the client touchpoint into exactly one category: "
            + ", ".join(c.value for c in Category) + '. Return {"category": ...}.',
            wrap_untrusted("event", to_plain_text(text)),
            _LlmCategory,
        )
        if res is not None:
            return res.category
    return cat


def is_actionable(text: str) -> bool:
    """True when the touchpoint asks for something (request, problem, complaint, question)."""
    cat, matched = _classify(text)
    return matched and cat in (Category.feature_request, Category.problem, Category.complaint, Category.question)


# --------------------------------------------------------------------------- hashing / ids

_HEADER_LINE_RE = re.compile(r"^\s*>*\s*(from|sent|to|cc|bcc|date|subject)\s*:.*$", re.IGNORECASE | re.MULTILINE)
_SEPARATOR_RE = re.compile(r"^\s*-{2,}\s*(forwarded|original) message\s*-*\s*$", re.IGNORECASE | re.MULTILINE)
_SUBJECT_PREFIX_RE = re.compile(r"^\s*((re|fwd?|tr|aw|wg)\s*:\s*)+", re.IGNORECASE | re.MULTILINE)


def normalize_for_hash(text: str) -> str:
    """Lowercase, strip forward/reply prefixes, quoted header lines and quote markers, collapse whitespace."""
    t = to_plain_text(text)
    t = _SEPARATOR_RE.sub(" ", t)
    t = _HEADER_LINE_RE.sub(" ", t)
    t = _SUBJECT_PREFIX_RE.sub("", t)
    t = re.sub(r"^\s*>+ ?", "", t, flags=re.MULTILINE)
    return re.sub(r"\s+", " ", t).strip().lower()


def local_content_hash(text: str) -> str:
    return hashlib.sha256(normalize_for_hash(text).encode("utf-8")).hexdigest()


def content_hash(text: str) -> str:
    """Agent 2's dedup.content_hash when available, otherwise the local equivalent."""
    fn = _agent2("app.agents.dedup", "content_hash")
    if fn is not None:
        try:
            return fn(text)
        except NotImplementedError:
            pass
    return local_content_hash(text)


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- Agent 2 bridge + fallbacks


def _agent2(module: str, name: str):
    try:
        return getattr(importlib.import_module(module), name)
    except (ImportError, AttributeError):
        return None


def _call(module: str, name: str, fallback, *args, **kwargs):
    fn = _agent2(module, name)
    if fn is not None:
        try:
            return fn(*args, **kwargs)
        except NotImplementedError:
            pass
    return fallback(*args, **kwargs)


@dataclass
class _Match:
    matched_id: str
    similarity: float
    reason: str


@dataclass
class _Upsert:
    claim: Claim
    created: bool
    match: _Match | None


def local_find_duplicate_document(session, client_id: str, text: str):
    from sqlmodel import select

    h = content_hash(text)
    doc = session.exec(
        select(Document).where(
            Document.client_id == client_id, Document.content_hash == h, Document.status != DocStatus.duplicate
        )
    ).first()
    if doc is None:
        return None
    return _Match(doc.id, 1.0, f'Same content as "{doc.title}" (identical after removing forward/reply headers)')


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", normalize_for_hash(text)))


def local_find_open_dossier_item(session, client_id: str, category: Category, text: str):
    from sqlmodel import select

    items = session.exec(
        select(DossierItem).where(
            DossierItem.client_id == client_id,
            DossierItem.category == category,
            DossierItem.status == ItemStatus.open,
        )
    ).all()
    a = _tokens(text)
    best = None
    for item in items:
        b = _tokens(f"{item.description}")
        sim = len(a & b) / len(a | b) if a | b else 0.0
        if sim >= 0.85 and (best is None or sim > best[1]):
            best = (item, sim)
    if best is None:
        return None
    return _Match(best[0].id, round(best[1], 3), f'Same open {category.value.replace("_", " ")} as "{best[0].title}"')


def local_upsert_claim(session, client_id: str, extracted: ExtractedClaim, document: Document, valid_from: date):
    """Same client + key + normalized value among active claims -> confirmation evidence, never a copy."""
    from sqlmodel import select

    existing = session.exec(
        select(Claim).where(
            Claim.client_id == client_id,
            Claim.key == extracted.key,
            Claim.value == extracted.value,
            Claim.status == ClaimStatus.active,
        )
    ).first()
    added = document.created_at or utcnow()
    if existing is not None:
        already = session.exec(
            select(ClaimEvidence).where(ClaimEvidence.claim_id == existing.id, ClaimEvidence.document_id == document.id)
        ).first()
        if already is None:
            session.add(
                ClaimEvidence(id=new_id("ev"), claim_id=existing.id, document_id=document.id,
                              author_id=document.author_id, added_at=added, relation=EvidenceRelation.confirmation)
            )
        session.flush()
        return _Upsert(existing, False, _Match(existing.id, 1.0, f"Same fact already on record: {extracted.key} = {extracted.value}"))
    claim = Claim(
        id=new_id("clm"), client_id=client_id, key=extracted.key, value=extracted.value, unit=extracted.unit,
        valid_from=valid_from, first_author_id=document.author_id, confidence=extracted.confidence,
        status=ClaimStatus.active,
    )
    session.add(claim)
    session.flush()
    session.add(
        ClaimEvidence(id=new_id("ev"), claim_id=claim.id, document_id=document.id, author_id=document.author_id,
                      added_at=added, relation=EvidenceRelation.origin)
    )
    session.flush()
    return _Upsert(claim, True, None)


def _local_record_decision(session, *, client_id, level, new_ref, match, user_id, outcome="linked", override_reason=None):
    dec = DedupDecision(
        id=new_id("dd"), client_id=client_id, level=DedupLevel(level), new_ref=str(new_ref)[:200],
        matched_id=match.matched_id, similarity=float(match.similarity), reason=match.reason[:500],
        outcome=DedupOutcome(outcome), override_reason=override_reason, user_id=user_id,
    )
    session.add(dec)
    session.flush()
    return dec


def _empty_list(*_a, **_k) -> list:
    return []


def _neutral_trust() -> TrustScore:
    return TrustScore(score=50, label="Verify", factors=[])


def _local_person_ref(session, person_id) -> PersonRef:
    p = session.get(Person, person_id) if person_id else None
    if p is None:
        return PersonRef(id=str(person_id or "unknown"), name="Unknown", role="", team="")
    return PersonRef(id=p.id, name=p.name, role=p.role, team=p.team)


def _local_claim_view(session, claim: Claim) -> ClaimView:
    from sqlmodel import select

    evs = session.exec(select(ClaimEvidence).where(ClaimEvidence.claim_id == claim.id)).all()
    views = []
    for ev in evs:
        doc = session.get(Document, ev.document_id)
        views.append(EvidenceView(document_id=ev.document_id, title=doc.title if doc else "", author=_local_person_ref(session, ev.author_id),
                                  added_at=ev.added_at, relation=ev.relation.value))
    return ClaimView(id=claim.id, key=claim.key, value=claim.value, unit=claim.unit, status=claim.status.value,
                     valid_from=claim.valid_from, evidence_count=len(evs), evidence=views, trust=_neutral_trust())


def _local_dossier_item_view(session, item: DossierItem) -> DossierItemView:
    return DossierItemView(id=item.id, client_id=item.client_id, category=item.category, title=item.title,
                           description=item.description, status=item.status.value, resolution=item.resolution,
                           created_by=_local_person_ref(session, item.created_by), created_at=item.created_at,
                           linked_document_ids=list(item.linked_document_ids))


def _local_conflict_view(session, c: Conflict) -> ConflictView:
    return ConflictView(id=c.id, client_id=c.client_id, scope=c.scope.value, severity=c.severity, explanation=c.explanation,
                        new_claim=None, existing_claim=None, new_document=None, existing_document=None,
                        resolution=c.resolution.value, resolution_note=c.resolution_note,
                        resolved_by=_local_person_ref(session, c.resolved_by) if c.resolved_by else None, created_at=c.created_at)


def _local_consistency(session, client_id) -> ConsistencyStatus:
    from sqlmodel import select

    open_c = len(session.exec(select(Conflict.id).where(Conflict.client_id == client_id, Conflict.resolution == Resolution.pending)).all())
    dups = len(session.exec(select(Document.id).where(Document.client_id == client_id, Document.status == DocStatus.duplicate)).all())
    return ConsistencyStatus(open_conflicts=open_c, linked_duplicates=dups, consistent=open_c == 0)


def _view(name: str, fallback, *args):
    return _call("app.views", name, fallback, *args)


def _decision_view(session, dec) -> DedupDecisionView:
    title, author, when = "", None, None
    level = dec.level.value if hasattr(dec.level, "value") else str(dec.level)
    if level == "document" and (d := session.get(Document, dec.matched_id)):
        title, author, when = d.title, d.author_id, d.created_at
    elif level == "dossier_item" and (i := session.get(DossierItem, dec.matched_id)):
        title, author, when = i.title, i.created_by, i.created_at
    elif level == "claim" and (c := session.get(Claim, dec.matched_id)):
        title, author = f"{c.key} = {c.value}", c.first_author_id
        when = datetime.combine(c.valid_from, datetime.min.time(), tzinfo=timezone.utc)
    outcome = dec.outcome.value if hasattr(dec.outcome, "value") else str(dec.outcome)
    return DedupDecisionView(
        level=level, outcome=outcome, matched_id=dec.matched_id, matched_title=title,
        matched_author=_view("person_ref", _local_person_ref, session, author) if author else None,
        matched_date=when, similarity=float(dec.similarity), reason=dec.reason,
    )


# --------------------------------------------------------------------------- orchestration


def _auto_title(doc_type: str, text: str) -> str:
    first = re.split(r"[\n.?!]", text.strip(), maxsplit=1)[0].strip()
    label = doc_type.capitalize()
    return (f"{label}: {first}" if first else label)[:120]


def capture_event(session, user, body: EventCreate) -> EventResult:
    """sanitize -> injection check -> doc dedup -> store Document -> dossier item -> claims
    -> horizontal check -> vertical precedents + approach check -> audit -> EventResult."""
    client = session.get(Client, body.client_id)
    if client is None:
        raise ValueError("unknown client")
    text = to_plain_text(body.text)
    if len(text) < 3:
        raise ValueError("empty text")
    reason = detect_injection(text)
    suspicious = reason is not None
    now = utcnow()
    title = to_plain_text(body.title or "", max_len=200) or _auto_title(body.type.value, text)
    D = "app.agents.dedup"

    # 1. document-level dedup (same client only)
    dup = _call(D, "find_duplicate_document", local_find_duplicate_document, session, client.id, text)
    doc = Document(
        id=new_id("doc"), client_id=client.id, type=body.type, title=title, content=text,
        content_hash=content_hash(text), author_id=user.person_id, owner_id=user.person_id,
        country_scope=body.country_scope or client.country, created_at=now, updated_at=now,
        status=DocStatus.duplicate if dup else DocStatus.active, duplicate_of=dup.matched_id if dup else None,
        suspicious=suspicious, suspicious_reason=reason, source=Source.user,
    )
    session.add(doc)
    session.flush()
    decisions = []
    if dup:
        decisions.append(_call(D, "record_decision", _local_record_decision, session, client_id=client.id,
                               level="document", new_ref=doc.id, match=dup, user_id=user.id))

    # 2. dossier item: link to an open one (same client + category) or create a new one
    category = classify_category(text)
    item, item_created = None, False
    if dup:
        from sqlmodel import select

        for it in session.exec(select(DossierItem).where(DossierItem.client_id == client.id)).all():
            if dup.matched_id in (it.linked_document_ids or []):
                it.linked_document_ids = [*it.linked_document_ids, doc.id]
                session.add(it)
                item = item or it
    elif is_actionable(text) and not suspicious:
        m = _call(D, "find_open_dossier_item", local_find_open_dossier_item, session, client.id, category, text)
        if m is not None and (existing := session.get(DossierItem, m.matched_id)) and existing.client_id == client.id:
            existing.linked_document_ids = [*existing.linked_document_ids, doc.id]
            session.add(existing)
            item = existing
            decisions.append(_call(D, "record_decision", _local_record_decision, session, client_id=client.id,
                                   level="dossier_item", new_ref=doc.id, match=m, user_id=user.id))
        else:
            item = DossierItem(id=new_id("di"), client_id=client.id, category=category, title=title,
                               description=text[:4000], created_by=user.person_id, created_at=now,
                               linked_document_ids=[doc.id])
            session.add(item)
            item_created = True
    session.flush()

    # 3. claims: same fact = extra confirmation. Suspicious text never feeds the record.
    new_claims, confirmed, within = [], [], []
    if not suspicious:
        for ex in extract_claims(text):
            up = _call(D, "upsert_claim", local_upsert_claim, session, client.id, ex, doc, now.date())
            if up.created:
                new_claims.append(up.claim)
                within.extend(_call("app.agents.horizontal", "check_claim", _empty_list, session, up.claim, doc) or [])
            else:
                confirmed.append(up.claim)
                if up.match is not None:
                    decisions.append(_call(D, "record_decision", _local_record_decision, session, client_id=client.id,
                                           level="claim", new_ref=f"{ex.key}={ex.value}"[:200], match=up.match,
                                           user_id=user.id))

    # 4. vertical: precedents at other clients + approach consistency
    precedents, across = [], []
    if not dup:
        from app.config import get_settings

        if item is not None:  # precedents only for actionable items (request, problem, question, complaint)
            precedents = _call("app.agents.vertical", "find_precedents", _empty_list, session, user, client.id, text,
                               category, get_settings().precedent_top_k) or []
        if not suspicious:
            across = _call("app.agents.vertical", "check_approach", _empty_list, session, client.id, doc, category) or []

    # 5. audit (detail is short and contains no document text)
    audit.record(session, user_id=user.id, action="create", entity="document", entity_id=doc.id,
                 detail=f"type={body.type.value} status={doc.status.value} suspicious={suspicious}", commit=False)
    if dup or (item is not None and not item_created):
        audit.record(session, user_id=user.id, action="link_duplicate", entity="document", entity_id=doc.id,
                     detail=f"linked_to={dup.matched_id if dup else item.id}", commit=False)
    if item_created:
        audit.record(session, user_id=user.id, action="create", entity="dossier_item", entity_id=item.id, commit=False)
    session.commit()

    return EventResult(
        document_id=doc.id,
        document_status="duplicate" if dup else "active",
        dossier_item=_view("dossier_item_view", _local_dossier_item_view, session, item) if item else None,
        dossier_item_created=item_created,
        new_claims=[_view("claim_view", _local_claim_view, session, c) for c in new_claims],
        confirmed_claims=[_view("claim_view", _local_claim_view, session, c) for c in confirmed],
        dedup=[_decision_view(session, d) for d in decisions],
        conflicts_within_record=[_view("conflict_view", _local_conflict_view, session, c) for c in within],
        conflicts_across_records=[_view("conflict_view", _local_conflict_view, session, c) for c in across],
        precedents=list(precedents),
        suspicious=suspicious,
        suspicious_reason=reason,
        consistency=_view("consistency_status", _local_consistency, session, client.id),
    )
