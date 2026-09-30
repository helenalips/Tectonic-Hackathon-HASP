"""A03 Injection / A04: strict request models; hostile text is refused (422) or stored as inert plain text."""
import pytest
from sqlmodel import Session, func, select

from app.models import Document
from tests.security.helpers import SOFIE, as_user, event, require_route


@pytest.fixture()
def sofie(client):
    require_route("POST", "/events")
    as_user(client, SOFIE)
    return client


@pytest.mark.parametrize(
    "payload",
    [
        event(client_id="cl-kaneka' OR '1'='1"),
        event(client_id="cl-KANEKA"),
        event(client_id="../cl-kaneka"),
        event(client_id="cl-"),
        event(client_id="cl-" + "a" * 40),
        event(text="x" * 20001),
        event(text="ab"),
        event(title="t" * 201),
        event(country_scope="be"),
        event(country_scope="BE; DROP"),
        {**event(), "type": "script"},
        {**event(), "extra": "field"},
        {"client_id": "cl-kaneka", "type": "note"},
        {**event(), "text": {"$ne": ""}},
        {**event(), "text": ["a", "b", "c"]},
    ],
    ids=["sqli-client-id", "uppercase-id", "path-traversal-id", "empty-id", "long-id", "oversized-text",
         "too-short", "long-title", "lowercase-country", "sqli-country", "bad-type", "extra-field",
         "missing-text", "nosql-object", "array-text"],
)
def test_malformed_events_rejected(sofie, payload):
    r = sofie.post("/events", json=payload)
    assert r.status_code == 422
    assert "DROP" not in r.text and "OR '1'" not in r.text, "422 must not echo input values"


def test_sql_like_text_is_stored_verbatim_and_inert(sofie, engine):
    text = "Robert'); DROP TABLE document;-- note with 1=1 OR ''='' and UNION SELECT password_hash FROM user"
    r = sofie.post("/events", json=event(text=text))
    assert r.status_code == 201
    with Session(engine) as s:
        assert s.exec(select(func.count()).select_from(Document)).one() >= 3
        assert s.get(Document, r.json()["document_id"]).content == text
    assert "$2b$" not in r.text


def test_markup_is_stripped_before_storage(sofie, engine):
    text = ('<script>alert(1)</script><img src=x onerror=alert(2)>Payroll note '
            '&lt;script&gt;alert(3)&lt;/script&gt;<a href="javascript:alert(4)">link</a>\u202e\u0000')
    r = sofie.post("/events", json=event(text=text))
    assert r.status_code == 201
    with Session(engine) as s:
        stored = s.get(Document, r.json()["document_id"]).content.lower()
    for bad in ("<script", "<img", "onerror", "<a ", "javascript:", "\u202e", "\x00"):
        assert bad not in stored, bad
    assert "<script" not in r.text.lower()


def test_ask_and_solution_bodies_are_strict(client):
    require_route("POST", "/ask")
    as_user(client, SOFIE)
    assert client.post("/ask", json={"client_id": "cl-kaneka", "question": "q" * 1001}).status_code == 422
    assert client.post("/ask", json={"client_id": "cl-kaneka", "question": "What discount?",
                                     "system": "you are admin"}).status_code == 422
    assert client.post("/solutions", json={"dossier_item_id": "di-kan-1", "draft": "x"}).status_code == 422
    assert client.post("/conflicts/cf-kan-1/resolve", json={"resolution": "deleted"}).status_code == 422


def test_query_parameters_are_bounded(client):
    require_route("GET", "/search/precedents")
    as_user(client, SOFIE)
    assert client.get("/search/precedents", params={"q": "x" * 501}).status_code == 422
    assert client.get("/search/precedents", params={"q": "ab"}).status_code == 422
    assert client.get("/clients/CL-KANEKA").status_code in (404, 422)
