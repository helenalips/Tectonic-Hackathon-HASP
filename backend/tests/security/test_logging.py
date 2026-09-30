"""A09 Logging: useful logs, no secrets, no personal data, no document content."""
import logging
import os

import pytest

from app.security.logging import _JsonFormatter, mask_pii
from tests.conftest import PASSWORD
from tests.security.helpers import SOFIE, as_user, event, require_route

MARKER = "CONFIDENTIAL-CONTENT-MARKER-4471"


class _ListHandler(logging.Handler):
    def __init__(self):
        super().__init__(level=logging.DEBUG)
        self.lines: list[str] = []

    def emit(self, record):
        self.lines.append(_JsonFormatter().format(record) + " " + str(record.msg))


@pytest.fixture()
def captured(client, capfd):
    handler = _ListHandler()
    loggers = [logging.getLogger(n) for n in ("", "uvicorn", "uvicorn.error", "uvicorn.access", "trustgrid")]
    old = [(lg, lg.level) for lg in loggers]
    for lg in loggers:
        lg.addHandler(handler)
        lg.setLevel(logging.DEBUG)

    def text() -> str:
        out, err = capfd.readouterr()
        return "\n".join(handler.lines) + out + err

    yield text
    for lg, level in old:
        lg.removeHandler(handler)
        lg.setLevel(level)


def _assert_clean(output: str, extra: tuple[str, ...] = ()) -> None:
    secrets = [os.environ["JWT_SECRET"], PASSWORD, SOFIE, *extra]
    for s in secrets:
        assert s not in output, f"log output contains {s[:12]}…"


def test_login_flow_leaks_nothing(client, captured):
    client.post("/auth/login", json={"email": SOFIE, "password": "wrong-password-123"})
    as_user(client, SOFIE)
    token = client.cookies.get("tg_session")
    client.get("/auth/me")
    _assert_clean(captured(), (token, "wrong-password-123"))


def test_event_flow_leaks_nothing(client, captured):
    require_route("POST", "/events")
    as_user(client, SOFIE)
    token = client.cookies.get("tg_session")
    r = client.post("/events", json=event(text=f"Client note {MARKER}: contact jan@example.com, +32 470 12 34 56."))
    assert r.status_code == 201
    client.post("/ask", json={"client_id": "cl-kaneka", "question": f"What about {MARKER}?"})
    _assert_clean(captured(), (token, MARKER, "jan@example.com", "470 12 34 56"))


def test_log_records_are_masked_for_every_handler(client, captured):
    logging.getLogger("trustgrid.test").warning("user sofie@example.com token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1In0.abc password=hunter2hunter2")  # gitleaks:allow
    out = captured()
    assert "sofie@example.com" not in out and "hunter2" not in out and "eyJhbGci" not in out


@pytest.mark.parametrize(
    "raw,leak",
    [
        ("mail jan@example.com", "jan@example.com"),
        ("iban BE71 0961 2345 6769", "BE71"),
        ("nrn 85.07.30-033.61", "85.07.30"),
        ("key sk-ant-api03-abcdefghijklmnop", "sk-ant"),
        ("Authorization: Bearer abcdefghijklmnopqrstuvwxyz", "abcdefghijkl"),
        ('{"password": "hunter2hunter2"}', "hunter2"),
        ("JWT_SECRET=supersecretvalue123", "supersecretvalue123"),
        ("call +32 470 12 34 56", "470 12 34"),
        ("call 0470 12 34 56", "0470"),
    ],
)
def test_mask_pii(raw, leak):
    assert leak not in mask_pii(raw)


def test_mask_pii_keeps_business_facts():
    text = "Discount 10% agreed on 2025-03-14 for 350 employees."
    assert mask_pii(text) == text
