"""A09: the audit trail is append-only and records views, writes, resolutions and logins."""
import pytest
from fastapi.routing import APIRoute
from sqlmodel import Session, select

from app.models import AuditLog
from app.security import audit
from tests.security.helpers import SOFIE, as_user, event, require_route


def _actions(engine, **where) -> list[AuditLog]:
    with Session(engine) as s:
        rows = s.exec(select(AuditLog)).all()
    return [r for r in rows if all(getattr(r, k) == v for k, v in where.items())]


def test_no_route_can_read_change_or_delete_the_audit_log():
    from app.main import app

    for route in app.routes:
        if isinstance(route, APIRoute):
            assert "audit" not in route.path.lower(), route.path
            assert not route.methods & {"PUT", "PATCH", "DELETE"}, route.path


def test_audit_module_has_no_update_or_delete_path():
    import inspect

    src = inspect.getsource(audit)
    assert "session.delete" not in src and ".update(" not in src and "execute(" not in src


def test_login_and_failed_login_recorded(client, engine):
    client.post("/auth/login", json={"email": SOFIE, "password": "wrong-password-1"})
    as_user(client, SOFIE)
    assert _actions(engine, action="login_failed")
    assert _actions(engine, action="login", user_id="u-sofie")
    assert all("wrong-password" not in (r.detail or "") for r in _actions(engine))


def test_client_view_recorded(client, engine):
    require_route("GET", "/clients/cl-kaneka")
    as_user(client, SOFIE)
    assert client.get("/clients/cl-kaneka").status_code == 200
    assert _actions(engine, action="view", user_id="u-sofie", entity_id="cl-kaneka")


def test_event_create_recorded(client, engine):
    require_route("POST", "/events")
    as_user(client, SOFIE)
    r = client.post("/events", json=event(text="Audit trail note about payroll timing."))
    assert r.status_code == 201
    assert _actions(engine, action="create", user_id="u-sofie")


def test_conflict_resolution_recorded(client, engine):
    require_route("POST", "/conflicts/cf-kan-1/resolve")
    as_user(client, SOFIE)
    assert client.post("/conflicts/cf-kan-1/resolve", json={"resolution": "both_valid"}).status_code in (400, 422), \
        "both_valid needs a note"
    r = client.post("/conflicts/cf-kan-1/resolve", json={"resolution": "updated_record"})
    assert r.status_code == 200, r.text
    assert _actions(engine, action="resolve", user_id="u-sofie", entity_id="cf-kan-1")


def test_audit_rejects_unknown_actions_and_masks_detail(engine):
    with Session(engine) as s:
        with pytest.raises(ValueError):
            audit.record(s, user_id="u-sofie", action="delete_everything", entity="audit")
        audit.record(s, user_id="u-sofie", action="view", entity="client", entity_id="cl-kaneka",
                     detail="viewed by sofie@example.com " + "x" * 400)
        row = s.exec(select(AuditLog).where(AuditLog.action == "view")).first()
    assert "sofie@example.com" not in row.detail and len(row.detail) <= 300
