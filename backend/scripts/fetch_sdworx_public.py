"""Fetch a few official public SD Worx pages and store short company facts in data/sdworx_public.json.

Run from backend/:  python -m scripts.fetch_sdworx_public

- Network access ONLY through app.security.fetch.fetch_sdworx_text (HTTPS, sdworx.com allowlist,
  size + timeout limits, plain-text output).
- Public company facts only. Never used for client data.
- Facts already documented in problem.md / branding/README.md are
  always added (and are all that is written when the network is down), with their sdworx.com source URL and "retrieved_from": "repo notes".
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from app.config import REPO_ROOT
from app.security.fetch import fetch_sdworx_text

PAGES = [
    "https://www.sdworx.com/en-en/about-sd-worx/press/2026-06-25-new-look-sd-worx-introducing-brand-makes-work-work",
    "https://www.sdworx.com/en-en/about-sd-worx",
    "https://www.sdworx.com/en-en/about-sd-worx/press",
]
OUT = REPO_ROOT / "data" / "sdworx_public.json"
MAX_FACTS_PER_PAGE = 4

_FACT_RE = re.compile(
    r"(\d[\d.,]*\s*\+?\s*(?:years|countries|employees|customers|clients|payslips|million)"
    r"|makes work work|HR,? Pay (?:&|and) Time|backbone of work)",
    re.IGNORECASE,
)

REPO_FACTS = [
    ("SD Worx is a European provider of HR, payroll and workforce operations.", PAGES[1]),
    ("SD Worx has more than 80 years of history.", PAGES[1]),
    ("SD Worx has 10,000+ employees, 100,000+ customers and handles 6M+ payslips.", PAGES[1]),
    ("SD Worx operates across Europe with payroll reach in 100+ countries.", PAGES[1]),
    ('The SD Worx brand idea is "SD Worx makes work work".', PAGES[0]),
    ('SD Worx positions itself as "Europe\'s backbone of work" and now covers HR, Pay & Time.', PAGES[0]),
]


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def extract_facts(text: str, limit: int = MAX_FACTS_PER_PAGE) -> list[str]:
    """Short sentences that state a company fact (numbers, brand idea, scope)."""
    sentences = re.split(r"(?<=[.!?])\s+|\n+", text)
    facts: list[str] = []
    for s in sentences:
        s = re.sub(r"\s+", " ", s).strip()
        if any(ch in s for ch in "{}<>|"):
            continue  # leftover CSS / markup / page-title separators, not a fact
        if 20 <= len(s) <= 220 and _FACT_RE.search(s) and s not in facts:
            facts.append(s)
        if len(facts) >= limit:
            break
    return facts


def collect() -> list[dict]:
    facts: list[dict] = []
    seen: set[str] = set()
    for url in PAGES:
        try:
            text = fetch_sdworx_text(url)
        except Exception as exc:  # noqa: BLE001 - network is optional; fall back to repo notes
            print(f"Skipped {url}: {type(exc).__name__}")
            continue
        for fact in extract_facts(text):
            if fact not in seen:
                seen.add(fact)
                facts.append({"fact": fact, "source_url": url, "retrieved_at": _now(), "retrieved_from": "live"})
    # Facts from the challenge brief / branding notes: always included, clearly labelled.
    facts += [
        {"fact": f, "source_url": u, "retrieved_at": _now(), "retrieved_from": "repo notes"} for f, u in REPO_FACTS
    ]
    return facts


def main() -> None:
    facts = collect()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(facts, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(facts)} facts to {OUT}")


if __name__ == "__main__":
    main()
