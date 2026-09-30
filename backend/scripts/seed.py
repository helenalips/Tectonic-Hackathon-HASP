"""Drop and rebuild the SQLite demo database from data/seed/*.json.

Run from backend/ (after scripts.parse_mock_data):  python -m scripts.seed

- Demo users get bcrypt(settings.demo_password); no password is stored in JSON or code.
- Every document gets a content_hash (dedup.content_hash when Agent 2's module is ready, else the
  identical local normalization) and a prompt-injection check (sanitize.detect_injection).
- Claims come from the deterministic extractor (no LLM during seeding) and are deduplicated with the
  runtime rules: same client + key + normalized value -> one Claim with origin + confirmation evidence.
- Claims are never taken from suspicious documents.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path

from sqlmodel import Session, SQLModel, select

from app import db
from app.agents.capture import content_hash, extract_claims, local_upsert_claim
from app.config import get_settings
from app.models import (
    Category,
    Client,
    ClientAssignment,
    Contribution,
    DocStatus,
    DocType,
    Document,
    DossierItem,
    ItemStatus,
    Person,
    Role,
    Segment,
    Source,
    User,
)
from app.security.auth import hash_password
from app.security.sanitize import detect_injection, to_plain_text


def _load(seed_dir: Path, name: str):
    return json.loads((seed_dir / name).read_text(encoding="utf-8"))


def _dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _reset_database(engine) -> None:
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)


def seed(session: Session, seed_dir: Path, demo_password: str) -> dict[str, int]:
    """Load all seed JSON into an empty schema. Returns counts per entity."""
    for p in _load(seed_dir, "people.json"):
        session.add(Person(**{**p, "source": Source(p.get("source", "generated"))}))
    for c in _load(seed_dir, "clients.json"):
        session.add(Client(**{**c, "segment": Segment(c["segment"]), "source": Source(c["source"])}))
    session.commit()

    pw_hash = hash_password(demo_password)  # hashed once; same demo password for every demo user
    for u in _load(seed_dir, "users.json"):
        session.add(User(id=u["id"], person_id=u["person_id"], email=u["email"].lower(),
                         password_hash=pw_hash, role=Role(u["role"])))
    session.commit()
    for a in _load(seed_dir, "assignments.json"):
        session.add(ClientAssignment(**a))
    session.commit()

    counts = {"documents": 0, "duplicates": 0, "suspicious": 0, "claims_new": 0, "claims_confirmed": 0}
    docs = sorted(_load(seed_dir, "documents.json"), key=lambda d: d["created_at"])
    for d in docs:
        content = to_plain_text(d["content"])
        h = content_hash(content)
        reason = detect_injection(content)
        original = None
        if d.get("client_id"):
            original = session.exec(
                select(Document).where(
                    Document.client_id == d["client_id"], Document.content_hash == h,
                    Document.status != DocStatus.duplicate,
                )
            ).first()
        doc = Document(
            id=d["id"], client_id=d.get("client_id"), type=DocType(d["type"]), title=to_plain_text(d["title"], max_len=200),
            content=content, content_hash=h, author_id=d["author_id"], owner_id=d.get("owner_id"),
            country_scope=d["country_scope"], created_at=_dt(d["created_at"]), updated_at=_dt(d["updated_at"]),
            status=DocStatus.duplicate if original else DocStatus(d.get("status", "active")),
            duplicate_of=original.id if original else None,
            suspicious=reason is not None, suspicious_reason=reason, source=Source(d.get("source", "generated")),
        )
        session.add(doc)
        session.flush()
        counts["documents"] += 1
        counts["duplicates"] += bool(original)
        counts["suspicious"] += reason is not None
        if doc.client_id and reason is None:
            for ex in extract_claims(content, use_llm=False):
                up = local_upsert_claim(session, doc.client_id, ex, doc, doc.created_at.date())
                counts["claims_new" if up.created else "claims_confirmed"] += 1
        session.commit()

    for item in _load(seed_dir, "dossier_items.json"):
        item = {k: v for k, v in item.items() if k != "source"}
        item["created_at"] = _dt(item["created_at"])
        item["category"] = Category(item["category"])
        item["status"] = ItemStatus(item["status"])
        session.add(DossierItem(**item))
    for c in _load(seed_dir, "contributions.json"):
        session.add(Contribution(
            person_id=c["person_id"], client_id=c["client_id"], hours=float(c["hours"]),
            first_date=date.fromisoformat(c["first_date"]), last_date=date.fromisoformat(c["last_date"])))
    session.commit()
    counts["dossier_items"] = len(session.exec(select(DossierItem.id)).all())
    return counts


def main() -> None:
    s = get_settings()
    engine = db.get_engine()
    _reset_database(engine)
    with Session(engine) as session:
        counts = seed(session, Path(s.seed_dir), s.demo_password.get_secret_value())
    print("Seeded TrustGrid demo database: " + ", ".join(f"{k}={v}" for k, v in counts.items()))


if __name__ == "__main__":
    main()
