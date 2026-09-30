"""LLM02 / A01: client data stays with its client. Dedup never crosses clients; precedents carry no figures."""
import re

from sqlmodel import Session, select

from app.models import Client, DedupDecision, Document
from app.security.auth import CurrentUser
from app.models import Role
from app.security.rbac import client_label
from app.security.sanitize import mask_figures
from tests.security.helpers import LOTTE, PAY_GAP_TEXT, SOFIE, as_user, event, require_route

PRECEDENT_FIELDS = {"dossier_item_id", "client_label", "category", "title", "resolution_summary", "date", "expert",
                    "similarity"}
FIGURES = ("500", "12%", "12 %", "40,000", "40.000", "EUR 40")


def test_identical_text_on_two_clients_is_never_a_duplicate(client, engine):
    require_route("POST", "/events")
    as_user(client, LOTTE)
    text = "Monthly payroll cut-off moves to the 20th; confirmed in the steering meeting."
    a = client.post("/events", json=event("cl-kaneka", text))
    b = client.post("/events", json=event("cl-skhitech", text))
    assert a.status_code == b.status_code == 201
    assert a.json()["document_status"] == "active"
    assert b.json()["document_status"] == "active", "dedup matched across clients"
    with Session(engine) as s:
        for d in s.exec(select(DedupDecision)).all():
            matched = s.get(Document, d.matched_id)
            if matched is not None:
                assert matched.client_id == d.client_id, "dedup decision links two clients"


def test_identical_text_on_same_client_is_linked(client):
    """Control for the test above: same client, same text -> linked duplicate."""
    require_route("POST", "/events")
    as_user(client, LOTTE)
    text = "Payroll cut-off moves to the 22nd; confirmed by the client in writing."
    first = client.post("/events", json=event("cl-kaneka", text))
    second = client.post("/events", json=event("cl-kaneka", text))
    assert first.json()["document_status"] == "active"
    assert second.json()["document_status"] == "duplicate"


def _check_precedents(precedents: list[dict], *, anonymized: bool) -> None:
    for p in precedents:
        assert set(p) <= PRECEDENT_FIELDS, set(p) - PRECEDENT_FIELDS
        for fig in FIGURES:
            assert fig not in p["resolution_summary"], p["resolution_summary"]
        if anonymized:
            assert "SK hi-tech" not in p["client_label"] and "SK hi-tech" not in p["resolution_summary"]


def test_precedents_are_anonymized_for_unassigned_consultant(client):
    require_route("GET", "/search/precedents")
    as_user(client, SOFIE)
    r = client.get("/search/precedents", params={"q": PAY_GAP_TEXT, "exclude_client_id": "cl-kaneka"})
    assert r.status_code == 200, r.text
    results = r.json()
    assert any(p["dossier_item_id"] == "di-sk-1" for p in results), "seeded precedent not found"
    _check_precedents(results, anonymized=True)
    sk = next(p for p in results if p["dossier_item_id"] == "di-sk-1")
    assert "Manufacturing" in sk["client_label"] or "PL" in sk["client_label"]


def test_precedents_in_event_result_are_anonymized(client):
    require_route("POST", "/events")
    as_user(client, SOFIE)
    r = client.post("/events", json=event("cl-kaneka", PAY_GAP_TEXT))
    assert r.status_code == 201
    _check_precedents(r.json()["precedents"], anonymized=True)


def test_precedents_for_lead_still_carry_no_figures(client):
    require_route("GET", "/search/precedents")
    as_user(client, LOTTE)
    r = client.get("/search/precedents", params={"q": PAY_GAP_TEXT, "exclude_client_id": "cl-kaneka"})
    _check_precedents(r.json(), anonymized=False)


def test_password_hashes_never_leave_the_api(client):
    as_user(client, SOFIE)
    for path in ("/auth/me", "/people/p-sofie", "/clients/cl-kaneka", "/clients"):
        r = client.get(path)
        if r.status_code == 404:
            continue
        assert "$2b$" not in r.text and "password" not in r.text.lower(), path


def test_client_label_helper():
    c = Client(id="cl-skhitech", name="SK hi-tech", country="PL", sector="Manufacturing", segment="enterprise")
    sofie = CurrentUser("u-sofie", "p-sofie", "e", Role.consultant, frozenset({"cl-kaneka"}))
    lead = CurrentUser("u-lotte", "p-lotte", "e", Role.lead, frozenset())
    assert client_label(sofie, c) == "Manufacturing client · PL"
    assert client_label(lead, c) == "SK hi-tech"


def test_mask_figures():
    masked = mask_figures("Built for 500 employees with a 12% discount, EUR 40,000 fee, since 2025-03-14.")
    assert not re.search(r"\d", masked), masked
    assert "employees" in masked and "discount" in masked
