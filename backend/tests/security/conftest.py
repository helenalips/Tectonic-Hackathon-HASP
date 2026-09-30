"""Shared data and helpers for the security contract tests.

Contract tests call the real HTTP API. When an endpoint does not exist yet, the test is marked
xfail at runtime ("endpoint not implemented yet"). As soon as the route exists the test runs for
real, so a security regression can never hide behind an xfail marker.
"""
import pytest
from sqlmodel import Session

from app.models import (
    Category,
    Client,
    ClientAssignment,
    ConflictScope,
    DocType,
    Document,
    DossierItem,
    ItemStatus,
    Person,
    Role,
    Segment,
    Severity,
    Source,
    User,
)
from app.models import Conflict as ConflictRow
from app.security.auth import hash_password
from tests.conftest import PASSWORD
from tests.security.helpers import PAY_GAP_TEXT, SK_RESOLUTION

_HASH = hash_password(PASSWORD)

@pytest.fixture(autouse=True)
def security_data(request):
    """Extra actors and records on top of tests/conftest.py (sofie: consultant on cl-kaneka; lotte: lead).
    Loaded only for tests that use the app or the database; pure unit tests stay fast."""
    if not {"client", "engine"} & set(request.fixturenames):
        yield
        return
    engine = request.getfixturevalue("engine")
    with Session(engine) as s:
        s.add_all(
            [
                Person(id="p-tomasz", name="Tomasz Nowak", role="Implementation consultant", team="PL Delivery",
                       email="tomasz@example.com", domains=["hr_system_implementation"], countries=["PL"]),
                Person(id="p-jan", name="Jan Peeters", role="Account manager", team="BE Commercial",
                       email="jan@example.com", domains=["commercial"], countries=["BE"]),
                Client(id="cl-cityd", name="CityD-WES group", country="BE", sector="Consulting",
                       segment=Segment.mid_market),
            ]
        )
        s.commit()
        s.add(User(id="u-tomasz", person_id="p-tomasz", email="tomasz@example.com", password_hash=_HASH,
                   role=Role.consultant))
        s.commit()
        s.add(ClientAssignment(user_id="u-tomasz", client_id="cl-skhitech"))
        s.add_all(
            [
                Document(id="doc-sk-1", client_id="cl-skhitech", type=DocType.contract, title="Contract SK hi-tech",
                         content="Contract headcount 500 employees.", content_hash="0" * 64, author_id="p-tomasz",
                         owner_id="p-tomasz", country_scope="PL", source=Source.generated),
                Document(id="doc-kan-1", client_id="cl-kaneka", type=DocType.email, title="Discount email",
                         content="Jan confirms a 10% discount on the pay equity audit.", content_hash="1" * 64,
                         author_id="p-jan", owner_id="p-jan", country_scope="BE", source=Source.generated),
            ]
        )
        s.commit()
        s.add_all(
            [
                DossierItem(id="di-sk-1", client_id="cl-skhitech", category=Category.feature_request,
                            title="Adjusted and unadjusted pay gap report", description=PAY_GAP_TEXT,
                            status=ItemStatus.resolved, resolution=SK_RESOLUTION, created_by="p-tomasz",
                            linked_document_ids=["doc-sk-1"]),
                DossierItem(id="di-sk-2", client_id="cl-skhitech", category=Category.question,
                            title="Headcount question", description="Is the headcount 500 or 650?",
                            created_by="p-tomasz", linked_document_ids=["doc-sk-1"]),
                DossierItem(id="di-kan-1", client_id="cl-kaneka", category=Category.commercial,
                            title="Pay equity audit pricing", description="Discount on the pay equity audit.",
                            created_by="p-jan", linked_document_ids=["doc-kan-1"]),
                ConflictRow(id="cf-sk-1", client_id="cl-skhitech", scope=ConflictScope.within_record,
                            new_document_id="doc-sk-1", existing_document_id="doc-sk-1", severity=Severity.medium,
                            explanation="Contract says 500 employees; onboarding note says 650."),
                ConflictRow(id="cf-kan-1", client_id="cl-kaneka", scope=ConflictScope.within_record,
                            new_document_id="doc-kan-1", existing_document_id="doc-kan-1", severity=Severity.high,
                            explanation="Discount email says 10%; invoice note says full price."),
            ]
        )
        s.commit()
    yield
