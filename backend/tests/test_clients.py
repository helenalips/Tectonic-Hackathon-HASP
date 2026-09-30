from sqlmodel import Session, select

from app.models import AuditLog
from tests.conftest import login
from tests.test_experts_support import fallbacks, world  # noqa: F401  (fixtures)


def test_list_clients_marks_editable_and_demo_data(client, world):
    login(client)
    r = client.get("/clients")
    assert r.status_code == 200
    rows = {c["id"]: c for c in r.json()}
    assert rows["cl-kaneka"]["can_edit"] is True
    assert rows["cl-skhitech"]["can_edit"] is False  # readable, not writable
    assert all(c["demo_data"] is True for c in rows.values())
    assert r.json()[0]["id"] == "cl-kaneka"  # own clients first


def test_client_record_and_view_audit(client, world):
    login(client)
    r = client.get("/clients/cl-kaneka")
    assert r.status_code == 200, r.text
    rec = r.json()
    ids = [t["document_id"] for t in rec["timeline"]]
    assert "doc-k-fwd" not in ids  # duplicates are linked, not listed
    email = next(t for t in rec["timeline"] if t["document_id"] == "doc-k-email")
    assert email["linked_duplicate_count"] == 1
    dates = [t["date"] for t in rec["timeline"]]
    assert dates == sorted(dates, reverse=True)
    assert rec["claims"][0]["evidence_count"] == 3
    assert rec["people"][0]["person"]["id"] == "p-jan"
    assert rec["experts"]["record_expert"]["person"]["id"] == "p-jan"
    assert "di-kaneka-paygap" in {d["id"] for d in rec["dossier_items"]}

    with Session(world) as s:
        row = s.exec(select(AuditLog).where(AuditLog.action == "view", AuditLog.entity_id == "cl-kaneka")).first()
        assert row is not None and row.user_id == "u-sofie"


def test_client_record_validation(client, world):
    assert client.get("/clients/cl-kaneka").status_code == 401
    login(client)
    assert client.get("/clients/cl-unknown").status_code == 404
    assert client.get("/clients/DROP TABLE").status_code in (404, 422)
    assert client.get("/clients/cl-kaneka/experts", params={"category": "feature_request"}).status_code == 200
    assert client.get("/clients/cl-kaneka/experts", params={"category": "bogus"}).status_code == 422


def test_person_profile(client, world):
    login(client)
    r = client.get("/people/p-sofie")
    assert r.status_code == 200
    body = r.json()
    assert body["person"]["name"] == "Sofie Maes"
    assert {c["hours"] for c in body["contributions"]} == {40, 120}
    assert client.get("/people/p-nobody").status_code == 404
