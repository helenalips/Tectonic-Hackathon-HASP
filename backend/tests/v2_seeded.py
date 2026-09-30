"""Shared fixture for v2 tests: the full generated seed in an in-memory database (hash embeddings, mock LLM).

Import the fixtures into a test module with:  from tests.v2_seeded import seeded_engine, seeded_client  # noqa: F401
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app import db
from app.config import get_settings
from scripts import parse_mock_data as pmd
from scripts.seed import seed
from tests.conftest import PASSWORD


@pytest.fixture(scope="module")
def seeded_engine(tmp_path_factory):
    out = tmp_path_factory.mktemp("seed_v2")
    settings = get_settings()
    pmd.write_all(out, settings.mock_data_path.read_text(encoding="utf-8"))
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(eng)
    with Session(eng) as s:
        seed(s, out, PASSWORD)
    old_seed_dir = settings.seed_dir
    settings.seed_dir = out  # profiles.json from this seed
    db.set_engine(eng)
    yield eng
    db.set_engine(None)
    settings.seed_dir = old_seed_dir


@pytest.fixture()
def seeded_client(seeded_engine):
    from app.main import app
    from app.security.web import limiter

    limiter.reset()
    db.set_engine(seeded_engine)
    with TestClient(app) as c:
        yield c


def login_as(c: TestClient, email: str) -> None:
    from app.security.web import limiter

    limiter.reset()  # these tests log in many times on purpose; login rate limits are tested in tests/security
    c.cookies.clear()
    r = c.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
