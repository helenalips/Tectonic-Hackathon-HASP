"""Horizontal (within-record) checks and conflict resolution."""
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from sqlmodel import Session, select

from app.agents import horizontal
from app.models import AuditLog, Claim, ClaimStatus, Conflict, DocType, Resolution, Severity
from app.schemas import ConflictResolve
from tests.conftest import login
from tests.test_scenarios import JAN_EMAIL, LOTTE, SOFIE, add_doc, fact, ingest, world


def _discount_vs_full_price(s):
    email = add_doc(s, "cl-kaneka", "Pay equity audit – discount confirmation", JAN_EMAIL, author="p-jan",
                    type=DocType.email, created=datetime(2025, 3, 14, tzinfo=timezone.utc))
    ingest(s, email, [fact("discount_pct", "10", "%")])
    invoice = add_doc(s, "cl-kaneka", "Invoice", "Full price.")
    _, conflicts = ingest(s, invoice, [fact("price_model", "full_price")])
    return conflicts[0]


def test_same_key_different_value_conflicts(engine):
    with Session(engine) as s:
        world(s)
        d1 = add_doc(s, "cl-kaneka", "A", "go live 1 Jan")
        ingest(s, d1, [fact("go_live_date", "2026-01-01")])
        d2 = add_doc(s, "cl-kaneka", "B", "go live 1 Mar")
        _, conflicts = ingest(s, d2, [fact("go_live_date", "2026-03-01")])
        assert len(conflicts) == 1 and conflicts[0].severity == Severity.medium
        assert "1 Mar 2026" in conflicts[0].explanation and "1 Jan 2026" in conflicts[0].explanation


def test_other_key_low_severity_and_same_value_no_conflict(engine):
    with Session(engine) as s:
        world(s)
        d1 = add_doc(s, "cl-kaneka", "A", "a")
        ingest(s, d1, [fact("hr_system", "sap successfactors")])
        d2 = add_doc(s, "cl-kaneka", "B", "b")
        _, none = ingest(s, d2, [fact("hr_system", "sap successfactors")])
        assert none == []
        d3 = add_doc(s, "cl-kaneka", "C", "c")
        _, conflicts = ingest(s, d3, [fact("hr_system", "workday")])
        assert conflicts[0].severity == Severity.low


def test_headcount_and_target_are_not_a_conflict(engine):
    with Session(engine) as s:
        world(s)
        d1 = add_doc(s, "cl-skhitech", "A", "a", country="PL")
        _, c = ingest(s, d1, [fact("headcount", "500", "employees"), fact("headcount_target", "2000", "employees")])
        assert c == []


def test_discounted_price_model_is_consistent_with_discount(engine):
    with Session(engine) as s:
        world(s)
        d1 = add_doc(s, "cl-kaneka", "A", "a")
        _, c = ingest(s, d1, [fact("discount_pct", "10"), fact("price_model", "discounted")])
        assert c == []


def test_no_duplicate_pending_conflicts_for_same_pair(engine):
    with Session(engine) as s:
        world(s)
        conflict = _discount_vs_full_price(s)
        new_claim = s.get(Claim, conflict.new_claim_id)
        doc = s.get(__import__("app.models", fromlist=["Document"]).Document, conflict.new_document_id)
        assert horizontal.check_claim(s, new_claim, doc) == []
        assert len(s.exec(select(Conflict)).all()) == 1


def test_resolve_updated_record_supersedes_never_deletes(engine):
    with Session(engine) as s:
        world(s)
        c = _discount_vs_full_price(s)
        resolved = horizontal.resolve_conflict(s, SOFIE, c.id, ConflictResolve(resolution="updated_record"))
        assert resolved.resolution == Resolution.updated_record and resolved.resolved_by == "p-sofie"
        old, new = s.get(Claim, c.existing_claim_id), s.get(Claim, c.new_claim_id)
        assert old is not None and old.status == ClaimStatus.superseded and old.valid_to is not None
        assert new.status == ClaimStatus.active
        assert len(s.exec(select(Claim)).all()) == 2
        assert s.exec(select(AuditLog).where(AuditLog.action == "resolve")).first() is not None
        with pytest.raises(HTTPException) as e:
            horizontal.resolve_conflict(s, SOFIE, c.id, ConflictResolve(resolution="updated_record"))
        assert e.value.status_code == 409


def test_resolve_updated_new_info_supersedes_new_claim(engine):
    with Session(engine) as s:
        world(s)
        c = _discount_vs_full_price(s)
        horizontal.resolve_conflict(s, LOTTE, c.id, ConflictResolve(resolution="updated_new_info"))
        assert s.get(Claim, c.new_claim_id).status == ClaimStatus.superseded
        assert s.get(Claim, c.existing_claim_id).status == ClaimStatus.active


def test_both_valid_requires_note(engine):
    with Session(engine) as s:
        world(s)
        c = _discount_vs_full_price(s)
        with pytest.raises(HTTPException) as e:
            horizontal.resolve_conflict(s, SOFIE, c.id, ConflictResolve(resolution="both_valid", note="  "))
        assert e.value.status_code == 422
        r = horizontal.resolve_conflict(s, SOFIE, c.id, ConflictResolve(resolution="both_valid", note="Discount only on phase 1"))
        assert r.resolution_note == "Discount only on phase 1"
        assert all(cl.status == ClaimStatus.active for cl in s.exec(select(Claim)).all())


def test_conflicts_api_scoping_and_rbac(engine, client):
    with Session(engine) as s:
        world(s)
        kaneka = _discount_vs_full_price(s)
        d1 = add_doc(s, "cl-skhitech", "Contract", "500", country="PL")
        ingest(s, d1, [fact("headcount", "500")])
        d2 = add_doc(s, "cl-skhitech", "Onboarding", "650", country="PL")
        _, sk = ingest(s, d2, [fact("headcount", "650")])
        kaneka_id, sk_id = kaneka.id, sk[0].id

    login(client)  # Sofie, consultant on Kaneka only
    ids = {c["id"] for c in client.get("/conflicts").json()}
    assert ids == {kaneka_id}
    assert client.get("/conflicts", params={"client_id": "cl-skhitech"}).json() == []
    assert client.get("/conflicts", params={"status": "bogus"}).status_code == 422
    r = client.post(f"/conflicts/{sk_id}/resolve", json={"resolution": "updated_record"})
    assert r.status_code == 403
    r = client.post(f"/conflicts/{kaneka_id}/resolve", json={"resolution": "both_valid"})
    assert r.status_code == 422
    r = client.post(f"/conflicts/{kaneka_id}/resolve", json={"resolution": "updated_record", "admin": True})
    assert r.status_code == 422
    r = client.post(f"/conflicts/{kaneka_id}/resolve", json={"resolution": "updated_record"})
    assert r.status_code == 200 and r.json()["resolution"] == "updated_record"
    assert r.json()["existing_claim"]["status"] == "superseded"
    assert client.get("/conflicts", params={"status": "pending"}).json() == []
    assert client.post("/conflicts/cf-nope/resolve", json={"resolution": "updated_record"}).status_code == 404

    client.post("/auth/logout")
    login(client, "lotte@example.com")  # lead: sees and resolves everything
    assert {c["id"] for c in client.get("/conflicts").json()} == {kaneka_id, sk_id}
    r = client.post(f"/conflicts/{sk_id}/resolve", json={"resolution": "updated_new_info"})
    assert r.status_code == 200


def test_conflicts_requires_auth(client):
    assert client.get("/conflicts").status_code == 401
