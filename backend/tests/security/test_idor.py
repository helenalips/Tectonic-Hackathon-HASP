"""A01 Broken access control: consultants write only to assigned clients; the server decides, not the UI."""
from sqlmodel import Session, select

from app.models import AuditLog, Conflict, Document, DossierItem, Resolution
from tests.security.helpers import LOTTE, SOFIE, TOMASZ, as_user, event, require_route


def _docs(engine, client_id: str) -> int:
    with Session(engine) as s:
        return len(s.exec(select(Document).where(Document.client_id == client_id)).all())


def test_consultant_cannot_capture_event_for_unassigned_client(client, engine):
    require_route("POST", "/events")
    as_user(client, SOFIE)
    before = _docs(engine, "cl-skhitech")
    r = client.post("/events", json=event("cl-skhitech", "Onboarding note: headcount is now 900 employees."))
    assert r.status_code == 403
    assert _docs(engine, "cl-skhitech") == before, "a refused write must not leave a document behind"


def test_other_consultant_is_refused_the_other_way_round(client):
    require_route("POST", "/events")
    as_user(client, TOMASZ)
    assert client.post("/events", json=event("cl-kaneka")).status_code == 403


def test_assigned_consultant_and_lead_may_write(client):
    """Control: the 403s above are policy, not a blanket failure."""
    require_route("POST", "/events")
    as_user(client, SOFIE)
    assert client.post("/events", json=event("cl-kaneka")).status_code == 201
    as_user(client, LOTTE)
    assert client.post("/events", json=event("cl-skhitech", "Lead note on the SK hi-tech onboarding plan.")).status_code == 201


def test_consultant_cannot_build_solution_for_unassigned_client(client):
    require_route("POST", "/solutions")
    as_user(client, SOFIE)
    assert client.post("/solutions", json={"dossier_item_id": "di-sk-2"}).status_code == 403


def test_consultant_cannot_resolve_conflict_of_unassigned_client(client, engine):
    require_route("POST", "/conflicts/cf-sk-1/resolve")
    as_user(client, SOFIE)
    r = client.post("/conflicts/cf-sk-1/resolve", json={"resolution": "updated_record"})
    assert r.status_code == 403
    with Session(engine) as s:
        assert s.get(Conflict, "cf-sk-1").resolution == Resolution.pending
        assert not s.exec(select(AuditLog).where(AuditLog.action == "resolve")).all()


def test_consultant_cannot_override_dedup_for_unassigned_client(client, engine):
    require_route("POST", "/dossier-items/di-sk-2/create-anyway")
    as_user(client, SOFIE)
    r = client.post("/dossier-items/di-sk-2/create-anyway",
                    json={"document_id": "doc-sk-1", "reason": "Different question, keep it separate."})
    assert r.status_code == 403
    with Session(engine) as s:
        assert len(s.exec(select(DossierItem).where(DossierItem.client_id == "cl-skhitech")).all()) == 2


def test_author_is_the_session_user_not_the_request(client, engine):
    """Mass assignment: author, status and suspicious can't be set by the caller."""
    require_route("POST", "/events")
    as_user(client, SOFIE)
    for extra in ({"author_id": "p-lotte"}, {"status": "active"}, {"suspicious": False}, {"source": "mock"}):
        assert client.post("/events", json=event(**extra)).status_code == 422
    r = client.post("/events", json=event(text="Meeting note from Sofie about payroll cut-off."))
    assert r.status_code == 201
    with Session(engine) as s:
        assert s.get(Document, r.json()["document_id"]).author_id == "p-sofie"


def test_client_record_read_is_allowed_but_not_editable(client):
    """Policy: everyone may read (knowledge sharing); can_edit tells the UI the truth."""
    require_route("GET", "/clients/cl-skhitech")
    as_user(client, SOFIE)
    r = client.get("/clients/cl-skhitech")
    assert r.status_code == 200
    assert r.json()["client"]["can_edit"] is False
    listed = {c["id"]: c["can_edit"] for c in client.get("/clients").json()}
    assert listed.get("cl-kaneka") is True and listed.get("cl-skhitech") is False
