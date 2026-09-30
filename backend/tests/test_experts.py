from sqlmodel import Session

from app.agents import experts
from app.models import Category, Role
from app.security.auth import CurrentUser
from tests.test_experts_support import fallbacks, world  # noqa: F401  (fixtures)

SOFIE = CurrentUser("u-sofie", "p-sofie", "sofie@example.com", Role.consultant, frozenset({"cl-kaneka"}))
LOTTE = CurrentUser("u-lotte", "p-lotte", "lotte@example.com", Role.lead, frozenset())


def test_record_expert_is_chosen_by_hours_and_recency(world):
    with Session(world) as s:
        e = experts.record_expert(s, "cl-kaneka")
    assert e is not None and e.kind == "record_expert"
    assert e.person.id == "p-jan"  # 164 h, 12 days ago beats 40 h, 200 days ago
    assert e.hours_on_client == 164
    assert e.reason.startswith("Worked 164 h on this client since Jan 2024, most recently 12 days ago")
    assert e.contact == "jan@example.com"
    assert 1 <= len(e.top_documents) <= 3
    # Suspicious and duplicate documents are never someone's "best work".
    assert {d.id for d in e.top_documents} <= {"doc-k-email", "doc-k-meeting"}


def test_record_expert_none_without_contributions(world):
    with Session(world) as s:
        assert experts.record_expert(s, "cl-skhitech") is None


def test_problem_expert_from_other_client_is_anonymized_for_unassigned_consultant(world):
    with Session(world) as s:
        e = experts.problem_expert(
            s, SOFIE, "cl-kaneka", Category.feature_request, "Adjusted and unadjusted pay gap report"
        )
    assert e is not None and e.kind == "problem_expert"
    assert e.person.id == "p-sofie"
    assert e.solved_count == 1
    assert "Solved 1 similar pay transparency case at other clients" in e.reason
    # Sofie is not assigned to CityD-WES: no client name anywhere in the expert card.
    blob = e.model_dump_json()
    assert "CityD" not in blob
    assert "Consulting" in e.reason
    assert [d.id for d in e.top_documents] == ["doc-c-sol"]


def test_problem_expert_shows_name_to_lead(world):
    with Session(world) as s:
        e = experts.problem_expert(
            s, LOTTE, "cl-kaneka", Category.feature_request, "Adjusted and unadjusted pay gap report"
        )
    assert e is not None
    assert e.top_documents[0].title == "CityD-WES pay gap report solution"


def test_experts_for_uses_open_item_as_context(world):
    with Session(world) as s:
        ex = experts.experts_for(s, SOFIE, "cl-kaneka")
    assert ex.record_expert.person.id == "p-jan"
    assert ex.problem_expert is not None and ex.problem_expert.person.id == "p-sofie"
