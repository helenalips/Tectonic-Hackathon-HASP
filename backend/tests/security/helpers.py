"""Helpers for the security contract tests."""
import pytest
from fastapi.testclient import TestClient
from starlette.routing import Match

from tests.conftest import PASSWORD

SK_RESOLUTION = (
    "Built the adjusted and unadjusted pay gap report in one integrated system for 500 employees, "
    "with a 12% discount and a EUR 40,000 fixed fee."
)
PAY_GAP_TEXT = "Client asks for an adjusted and unadjusted pay gap report built on the competence matrix and salary scale."


def route_exists(method: str, path: str) -> bool:
    from app.main import app

    scope = {"type": "http", "method": method.upper(), "path": path, "root_path": "", "query_string": b"",
             "headers": []}
    return any(route.matches(scope)[0] == Match.FULL for route in app.routes)


def require_route(method: str, path: str) -> None:
    if not route_exists(method, path):
        pytest.xfail("endpoint not implemented yet")


def as_user(c: TestClient, email: str) -> None:
    c.cookies.clear()
    r = c.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text


SOFIE = "sofie@example.com"    # consultant, assigned cl-kaneka only
TOMASZ = "tomasz@example.com"  # consultant, assigned cl-skhitech only
LOTTE = "lotte@example.com"    # lead, may write anywhere


def event(client_id: str = "cl-kaneka", text: str = "Short meeting note about payroll timing.", **extra) -> dict:
    return {"client_id": client_id, "type": "note", "title": "Security test note", "text": text, **extra}

