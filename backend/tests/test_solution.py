from sqlmodel import Session, select

from app.models import AuditLog, DocStatus, DocType, Document, DossierItem, Solution
from tests.conftest import login
from tests.test_experts_support import disputed_price, fallbacks, world  # noqa: F401  (fixtures)


def test_solution_is_saved_as_draft_document_with_consistency(client, world):
    login(client)
    r = client.post("/solutions", json={"dossier_item_id": "di-kaneka-paygap"})
    assert r.status_code == 201, r.text
    body = r.json()

    draft = body["draft"]
    for section in ("Situation", "Proven approach", "Tailored for Kaneka Belgium", "Next steps", "Contacts"):
        assert section in draft
    assert "CityD" not in draft  # Sofie is not assigned to CityD-WES: anonymized label only
    assert "Sofie Maes" in draft and "Jan Peeters" in draft

    cs = body["consistency_status"]
    assert cs["within_record"] in ("consistent", "conflict")
    assert cs["across_records"] == "consistent"  # reuses the proven integrated approach
    assert cs["reasons"]
    assert body["backed_by"]["record_expert"]["person"]["id"] == "p-jan"
    assert body["backed_by"]["problem_expert"]["person"]["id"] == "p-sofie"
    assert "doc-c-sol" in {c["document_id"] for c in body["built_on"]}
    assert all("CityD" not in c["title"] for c in body["built_on"])

    with Session(world) as s:
        doc = s.get(Document, body["document_id"])
        assert doc.type == DocType.solution and doc.status == DocStatus.draft
        assert doc.author_id == "p-sofie" and doc.owner_id == "p-jan" and doc.source.value == "user"
        sol = s.get(Solution, body["id"])
        assert sol.consistency_status["across_records"] == "consistent"
        assert "doc-c-sol" in sol.based_on_document_ids
        assert doc.id in s.get(DossierItem, "di-kaneka-paygap").linked_document_ids
        assert s.exec(select(AuditLog).where(AuditLog.entity == "solution", AuditLog.action == "create")).first()


def test_consultant_cannot_create_solution_for_unassigned_client(client, world):
    login(client)  # Sofie: assigned to Kaneka only
    r = client.post("/solutions", json={"dossier_item_id": "di-sk-headcount"})
    assert r.status_code == 403
    with Session(world) as s:
        assert s.exec(select(Solution)).first() is None


def test_solution_unknown_item_is_404(client, world):
    login(client)
    assert client.post("/solutions", json={"dossier_item_id": "di-missing"}).status_code == 404


def test_solution_on_disputed_facts_reports_within_record_conflict(client, disputed_price):
    login(client)
    r = client.post("/solutions", json={"dossier_item_id": "di-kaneka-invoice"})
    assert r.status_code == 201, r.text
    cs = r.json()["consistency_status"]
    assert cs["within_record"] == "conflict"
    assert "cf-price" in cs["conflict_ids"]
    assert "Check first" in r.json()["draft"]


def test_saved_draft_never_names_other_clients_even_for_a_lead(client, world):
    login(client, "lotte@example.com")  # a lead may see CityD-WES by name, but the draft is read by everyone
    r = client.post("/solutions", json={"dossier_item_id": "di-kaneka-paygap"})
    assert r.status_code == 201, r.text
    assert "CityD" not in r.text
