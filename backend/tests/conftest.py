import os

# Test-only values, set before the app reads settings. Not real secrets.
os.environ.setdefault("JWT_SECRET", "test-secret-" + "x" * 40)
os.environ.setdefault("DEMO_PASSWORD", "test-demo-password")
os.environ.setdefault("LLM_MODE", "mock")
os.environ.setdefault("EMBEDDINGS_BACKEND", "hash")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, SQLModel, create_engine  # noqa: E402

from app import db  # noqa: E402
from app.models import Client, ClientAssignment, Person, Role, Segment, User  # noqa: E402
from app.security import auth as _auth  # noqa: E402
from app.security.auth import hash_password  # noqa: E402

_auth._pwd.update(bcrypt__rounds=4)  # tests only: production keeps the default cost
from app.security.web import limiter  # noqa: E402

PASSWORD = os.environ["DEMO_PASSWORD"]


@pytest.fixture()
def engine():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(eng)
    db.set_engine(eng)
    with Session(eng) as s:
        s.add_all(
            [
                Person(id="p-sofie", name="Sofie Maes", role="Payroll consultant", team="BE Payroll",
                       email="sofie@example.com", domains=["pay_transparency"], countries=["BE"]),
                Person(id="p-lotte", name="Lotte de Vries", role="Team lead", team="Multi-country",
                       email="lotte@example.com", domains=["multi_country_payroll"], countries=["NL"]),
                Client(id="cl-kaneka", name="Kaneka Belgium", country="BE", sector="Chemicals", segment=Segment.mid_market),
                Client(id="cl-skhitech", name="SK hi-tech", country="PL", sector="Manufacturing", segment=Segment.enterprise),
            ]
        )
        s.commit()
        s.add_all(
            [
                User(id="u-sofie", person_id="p-sofie", email="sofie@example.com",
                     password_hash=hash_password(PASSWORD), role=Role.consultant),
                User(id="u-lotte", person_id="p-lotte", email="lotte@example.com",
                     password_hash=hash_password(PASSWORD), role=Role.lead),
            ]
        )
        s.commit()
        s.add(ClientAssignment(user_id="u-sofie", client_id="cl-kaneka"))
        s.commit()
    yield eng
    db.set_engine(None)


@pytest.fixture()
def client(engine):
    from app.main import app

    limiter.reset()
    with TestClient(app) as c:
        yield c


def login(c: TestClient, email: str = "sofie@example.com") -> None:
    r = c.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
