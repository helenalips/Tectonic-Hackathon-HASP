"""Seed data: mock parsing, scenario coverage and a full seed into an in-memory database."""
import json
from collections import Counter

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.agents.capture import extract_claims
from app.config import get_settings
from app.models import Claim, ClaimEvidence, Document, DossierItem, EvidenceRelation, User
from app.security.auth import verify_password
from scripts import parse_mock_data as pmd
from scripts.seed import seed

EXPECTED_NAMES = {
    "cl-cityd": "CityD-WES group",
    "cl-kaneka": "Kaneka Belgium",
    "cl-afriflora": "Afriflora",
    "cl-globalpaint": "Global Paint company",
    "cl-skhitech": "SK hi-tech battery materials Poland",
}
# v2: clearly fictional extra clients (source "generated")
FICTIONAL_NAMES = {
    "cl-nordvik": "Nordvik Logistics",
    "cl-helio": "Helio Retail Group",
    "cl-maas": "Maas & Partners Care",
    "cl-alpenwerk": "Alpenwerk Tools",
}


@pytest.fixture(scope="module")
def seed_dir(tmp_path_factory):
    out = tmp_path_factory.mktemp("seed")
    pmd.write_all(out, get_settings().mock_data_path.read_text(encoding="utf-8"))
    return out


def _load(seed_dir, name):
    return json.loads((seed_dir / name).read_text(encoding="utf-8"))


def _docs(seed_dir):
    return {d["id"]: d for d in _load(seed_dir, "documents.json")}


def test_parse_mock_data_five_clients(seed_dir):
    clients = _load(seed_dir, "clients.json")
    assert {c["id"]: c["name"] for c in clients} == {**EXPECTED_NAMES, **FICTIONAL_NAMES}
    by_id = {c["id"]: c for c in clients}
    assert by_id["cl-globalpaint"]["country"] == "MULTI" and by_id["cl-globalpaint"]["segment"] == "global"
    assert by_id["cl-afriflora"]["country"] == "ET"
    for c in clients:
        assert c["source"] == ("mock" if c["id"] in EXPECTED_NAMES else "generated")
        assert c["summary"].startswith("Situation:") and "Outcome:" in c["summary"]
        assert "<" not in c["summary"] and "**" not in c["summary"]


def test_parse_mock_rejects_missing_client():
    with pytest.raises(ValueError):
        pmd.parse_mock_cases("## 1. Someone else: a case\n- **Situation:** x\n")


def test_users_have_no_passwords_and_example_emails(seed_dir):
    users = _load(seed_dir, "users.json")
    assert {u["email"]: u["role"] for u in users} == {
        "sofie@example.com": "consultant", "tomasz@example.com": "consultant",
        "lotte@example.com": "lead", "admin@example.com": "admin",
    }
    for u in users:
        assert not any("pass" in k for k in u)
    for p in _load(seed_dir, "people.json"):
        assert p["email"].endswith("@example.com") and p["source"] == "generated"
    assert {(a["user_id"], a["client_id"]) for a in _load(seed_dir, "assignments.json")} == {
        ("u-sofie", "cl-kaneka"), ("u-sofie", "cl-cityd"), ("u-tomasz", "cl-skhitech")}


def test_documents_cover_scenarios(seed_dir):
    docs = _docs(seed_dir)
    years = {d["created_at"][:4] for d in docs.values()}
    assert {"2024", "2025", "2026"} <= years
    # a / g: Jan's discount email of 2025-03-14
    jan = docs["doc-kaneka-discount-email"]
    assert jan["author_id"] == "p-jan" and jan["created_at"].startswith("2025-03-14")
    assert ("discount_pct", "10") in {(c.key, c.value) for c in extract_claims(jan["content"])}
    # b: SK hi-tech contract headcount 500
    sk = {(c.key, c.value) for c in extract_claims(docs["doc-sk-contract"]["content"])}
    assert ("headcount", "500") in sk
    # e: unowned note + NL policy on an Ethiopian client
    assert docs["doc-afriflora-payroll-note"]["owner_id"] is None
    assert docs["doc-afriflora-nl-leave-policy"]["country_scope"] == "NL"
    assert docs["doc-afriflora-nl-leave-policy"]["client_id"] == "cl-afriflora"
    # f: injection ticket
    assert "IGNORE PREVIOUS INSTRUCTIONS" in docs["doc-gp-ticket-injection"]["content"]
    for d in docs.values():
        assert d["source"] == "generated"


def test_dossier_precedents(seed_dir):
    items = {i["id"]: i for i in _load(seed_dir, "dossier_items.json")}
    cityd = items["di-cityd-pay-gap-report"]
    assert cityd["status"] == "resolved" and cityd["created_by"] == "p-marc" and cityd["category"] == "feature_request"
    resolved_clients = {i["client_id"] for i in items.values() if i["status"] == "resolved"}
    assert resolved_clients == set(EXPECTED_NAMES) | set(FICTIONAL_NAMES)
    assert items["di-kaneka-open-question"]["status"] == "open"


def test_demo_inputs(seed_dir):
    demo = _load(seed_dir, "demo_inputs.json")
    assert {"a", "b", "c", "d", "g"} <= set(demo)
    for key in ("a", "b", "c", "d"):
        assert demo[key]["client_id"] in EXPECTED_NAMES and len(demo[key]["text"]) >= 3
    assert len(demo["g"]) == 4
    assert demo["g"][1]["title"].startswith("Fwd:")
    assert "Sent:" in demo["g"][1]["text"] and "From:" in demo["g"][1]["text"]
    assert demo["g"][2]["text"] == demo["g"][3]["text"] == pmd.KANEKA_OPEN_QUESTION


def test_seed_database(seed_dir):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        counts = seed(s, seed_dir, "a-demo-password-for-tests")
        assert counts["documents"] == len(pmd.DOCUMENTS)
        assert counts["suspicious"] == 1

        users = s.exec(select(User)).all()
        assert all(verify_password("a-demo-password-for-tests", u.password_hash) for u in users)

        # invariant: one active claim per client + key + value
        claims = s.exec(select(Claim)).all()
        triples = Counter((c.client_id, c.key, c.value) for c in claims if c.status == "active")
        assert max(triples.values()) == 1

        # every claim has exactly one origin evidence row
        for c in claims:
            evs = s.exec(select(ClaimEvidence).where(ClaimEvidence.claim_id == c.id)).all()
            assert sum(e.relation == EvidenceRelation.origin for e in evs) == 1

        # Kaneka headcount 350 is confirmed by the contract and Jan's email (1 claim, 2 evidence)
        hc = s.exec(select(Claim).where(Claim.client_id == "cl-kaneka", Claim.key == "headcount")).all()
        assert [c.value for c in hc] == ["350"]
        assert len(s.exec(select(ClaimEvidence).where(ClaimEvidence.claim_id == hc[0].id)).all()) == 2

        # suspicious ticket stored as data, flagged, and never feeds the record
        ticket = s.get(Document, "doc-gp-ticket-injection")
        assert ticket.suspicious and ticket.suspicious_reason
        assert not s.exec(select(ClaimEvidence).where(ClaimEvidence.document_id == ticket.id)).all()
        assert not s.exec(select(Claim).where(Claim.client_id == "cl-globalpaint", Claim.key == "discount_pct")).all()

        # scenario originals
        sk = s.exec(select(Claim).where(Claim.client_id == "cl-skhitech", Claim.key == "headcount")).all()
        assert [c.value for c in sk] == ["500"]
        disc = s.exec(select(Claim).where(Claim.client_id == "cl-kaneka", Claim.key == "discount_pct")).one()
        assert disc.value == "10" and disc.first_author_id == "p-jan"
        assert s.get(DossierItem, "di-cityd-pay-gap-report").status == "resolved"
