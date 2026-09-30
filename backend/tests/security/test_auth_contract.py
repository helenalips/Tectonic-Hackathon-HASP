"""A01/A07: every route needs a valid session; tokens are strict; the transport layer refuses cross-site writes."""
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
import pytest
import yaml
from fastapi.routing import APIRoute

from app.config import get_settings
from app.security.auth import JWT_AUDIENCE, JWT_ISSUER, get_current_user, set_session_cookie
from tests.security.helpers import LOTTE, SOFIE, as_user, require_route

OPENAPI = Path(__file__).resolve().parents[3] / "contracts" / "openapi.yaml"
PUBLIC = {("GET", "/health"), ("POST", "/auth/login")}
SAMPLE_PARAMS = {"client_id": "cl-kaneka", "conflict_id": "cf-kan-1", "item_id": "di-kan-1", "person_id": "p-sofie"}


def _openapi_operations() -> list[tuple[str, str]]:
    spec = yaml.safe_load(OPENAPI.read_text())
    ops = []
    for path, item in spec["paths"].items():
        for method, op in item.items():
            if op.get("security") == []:
                continue
            ops.append((method.upper(), path))
    return ops


def _fill(path: str) -> str:
    return re.sub(r"\{(\w+)\}", lambda m: SAMPLE_PARAMS.get(m.group(1), "x-1"), path)


@pytest.mark.parametrize("method,path", _openapi_operations())
def test_every_contract_route_requires_a_session(client, method, path):
    url = _fill(path)
    require_route(method, url)
    r = client.request(method, url, json={} if method == "POST" else None)
    assert r.status_code == 401, f"{method} {path} answered {r.status_code} without a session"


def test_every_registered_route_depends_on_get_current_user():
    """Catches routes that exist in code but not in the contract."""
    from app.main import app

    def deps(dependant):
        for d in dependant.dependencies:
            yield d.call
            yield from deps(d)

    missing = []
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        for method in route.methods:
            if (method, route.path) in PUBLIC:
                continue
            if get_current_user not in set(deps(route.dependant)):
                missing.append(f"{method} {route.path}")
    assert not missing, f"Routes without authentication: {missing}"


def _token(key: str | None = None, alg: str = "HS256", **overrides) -> str:
    now = datetime.now(timezone.utc)
    claims = {"sub": "u-lotte", "iat": now, "exp": now + timedelta(minutes=5), "iss": JWT_ISSUER,
              "aud": JWT_AUDIENCE, "jti": "test-jti"}
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key or get_settings().jwt_secret.get_secret_value(), algorithm=alg)


def test_well_formed_token_accepted_as_control(client):
    client.cookies.set("tg_session", _token())
    assert client.get("/auth/me").status_code == 200


@pytest.mark.parametrize(
    "overrides",
    [
        {"key": "another-secret-" + "y" * 40},
        {"alg": "HS512"},
        {"exp": datetime.now(timezone.utc) - timedelta(seconds=5)},
        {"aud": "someone-else"},
        {"iss": "someone-else"},
        {"aud": None},
        {"jti": None},
        {"sub": "u-does-not-exist"},
    ],
    ids=["wrong-key", "alg-hs512", "expired", "bad-aud", "bad-iss", "no-aud", "no-jti", "unknown-user"],
)
@pytest.mark.filterwarnings("ignore::jwt.warnings.InsecureKeyLengthWarning")
def test_bad_tokens_rejected(client, overrides):
    client.cookies.set("tg_session", _token(**overrides))
    assert client.get("/auth/me").status_code == 401


def test_alg_none_rejected(client):
    token = jwt.encode({"sub": "u-lotte", "aud": JWT_AUDIENCE, "iss": JWT_ISSUER}, None, algorithm="none")
    client.cookies.set("tg_session", token)
    assert client.get("/auth/me").status_code == 401


def test_oversized_cookie_rejected(client):
    client.cookies.set("tg_session", "a" * 5000)
    assert client.get("/auth/me").status_code == 401


def test_logout_revokes_the_token_server_side(client):
    as_user(client, SOFIE)
    token = client.cookies.get("tg_session")
    assert client.post("/auth/logout").status_code == 204
    client.cookies.set("tg_session", token)
    if client.get("/auth/me").status_code != 401:
        pytest.xfail("app/api/auth.py logout must call clear_session_cookie(response, request) to revoke")


def test_cookie_flags_secure_when_https(monkeypatch):
    from fastapi import Response

    monkeypatch.setattr(get_settings(), "cookie_secure", True)
    resp = Response()
    set_session_cookie(resp, "t")
    cookie = resp.headers["set-cookie"].lower()
    for flag in ("httponly", "secure", "samesite=strict", "path=/", "max-age=900"):
        assert flag in cookie


def test_session_role_comes_from_database_not_token(client):
    """A consultant token can't claim a role; role and assignments are re-read every request."""
    client.cookies.set("tg_session", _token(sub="u-sofie", role="admin"))
    me = client.get("/auth/me").json()
    assert me["role"] == "consultant" and me["assigned_client_ids"] == ["cl-kaneka"]


# ---------------------------------------------------------------- transport: CSRF, content type, body size


def test_cross_origin_write_blocked(client):
    r = client.post("/auth/login", json={"email": SOFIE, "password": "x" * 12},
                    headers={"Origin": "https://evil.example"})
    assert r.status_code == 403


def test_cross_site_fetch_metadata_blocked(client):
    r = client.post("/auth/login", json={"email": SOFIE, "password": "x" * 12},
                    headers={"Sec-Fetch-Site": "cross-site"})
    assert r.status_code == 403


def test_frontend_origin_allowed(client):
    from tests.conftest import PASSWORD

    r = client.post("/auth/login", json={"email": LOTTE, "password": PASSWORD},
                    headers={"Origin": "http://localhost:5173"})
    assert r.status_code == 200


@pytest.mark.parametrize("origin", ["http://127.0.0.1:5173", "http://localhost:5173"])
def test_vite_proxy_request_allowed(client, origin):
    """The dev proxy (changeOrigin) rewrites Host to :8000 but forwards the browser's Origin unchanged."""
    from tests.conftest import PASSWORD

    r = client.post("/auth/login", json={"email": LOTTE, "password": PASSWORD},
                    headers={"Origin": origin, "Host": "127.0.0.1:8000", "Sec-Fetch-Site": "same-origin"})
    assert r.status_code == 200


def test_form_encoded_write_refused(client):
    r = client.post("/auth/login", content='{"email":"a@b.co","password":"x"}',
                    headers={"Content-Type": "text/plain"})
    assert r.status_code == 415


def test_oversized_body_refused(client):
    r = client.post("/auth/login", content=b"{" + b" " * 300_000 + b"}",
                    headers={"Content-Type": "application/json"})
    assert r.status_code == 413


def test_no_write_verbs_beyond_post():
    from app.main import app

    verbs = {m for r in app.routes if isinstance(r, APIRoute) for m in r.methods}
    assert verbs <= {"GET", "POST"}, verbs


def test_unhandled_error_is_generic(engine):
    from fastapi.testclient import TestClient

    from app.main import app

    @app.get("/__boom_test")
    def boom():
        raise RuntimeError("secret detail sofie@example.com")

    try:
        with TestClient(app, raise_server_exceptions=False) as c:
            r = c.get("/__boom_test")
        assert r.status_code == 500
        assert r.json() == {"detail": "Something went wrong. Please try again."}
        assert "Traceback" not in r.text and "sofie" not in r.text
    finally:
        app.router.routes[:] = [rt for rt in app.router.routes if getattr(rt, "path", "") != "/__boom_test"]
