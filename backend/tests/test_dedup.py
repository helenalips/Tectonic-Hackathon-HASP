"""Dedup: documents, claims, dossier items, embeddings. Same-client scoping is a security property."""
from datetime import datetime, timezone

from sqlmodel import Session, select

from app import embeddings
from app.agents import dedup
from app.models import Category, Claim, ClaimEvidence, DedupDecision, DocType, DossierItem, EvidenceRelation
from tests.test_scenarios import JAN_EMAIL, add_doc, fact, world


def test_embeddings_hash_backend_properties():
    a = "Can we get an adjusted and unadjusted pay gap report?"
    assert embeddings.similarity(a, a) > 0.999
    assert embeddings.similarity(a, a + " Thanks!") >= 0.95
    assert embeddings.similarity(a, "Is it possible to get a report with the adjusted and unadjusted pay gap?") >= 0.85
    assert embeddings.similarity(a, "When does the Polish payroll go live?") < 0.5
    rows = embeddings.embed([a, "other"])
    assert rows.shape[0] == 2
    assert abs(float((rows[0] ** 2).sum()) - 1.0) < 1e-5


def test_content_hash_normalization():
    base = "Hello team,\nThe discount is 10%.\n"
    assert dedup.content_hash(base) == dedup.content_hash("  hello   TEAM,  the discount is 10%. ")
    fwd = "Fwd: Discount\n-----Original Message-----\nFrom: Jan\nSent: Monday\nTo: Sofie\nSubject: Re: x\n> Hello team,\n> The discount is 10%."
    assert dedup.content_hash(fwd) == dedup.content_hash(base) or embeddings.similarity(
        dedup.normalize_text(fwd), dedup.normalize_text(base)
    ) >= 0.95


def test_forwarded_email_is_duplicate(engine):
    with Session(engine) as s:
        world(s)
        original = add_doc(s, "cl-kaneka", "Discount agreement pay equity audit", JAN_EMAIL, author="p-jan",
                           type=DocType.email, created=datetime(2025, 3, 14, tzinfo=timezone.utc))
        fwd = "FW: Discount agreement\nFrom: Jan Peeters\nSent: 14 March 2025\nTo: Sofie\n\n" + "\n".join(
            ">" + line for line in JAN_EMAIL.splitlines()
        )
        m = dedup.find_duplicate_document(s, "cl-kaneka", fwd)
        assert m is not None and m.matched_id == original.id and m.similarity >= 0.95
        assert m.reason == (
            "Same content as 'Discount agreement pay equity audit' by Jan Peeters on 14 Mar 2025 (forwarded copy)"
        )


def test_near_identical_document_matches_but_different_does_not(engine):
    with Session(engine) as s:
        world(s)
        add_doc(s, "cl-kaneka", "Minutes", JAN_EMAIL)
        assert dedup.find_duplicate_document(s, "cl-kaneka", JAN_EMAIL + "\nSent from my phone") is not None
        assert dedup.find_duplicate_document(s, "cl-kaneka", "Headcount for Poland is 650 employees.") is None


def test_dedup_never_matches_another_clients_identical_document(engine):
    """Security: an identical document at another client must never be linked or revealed."""
    with Session(engine) as s:
        world(s)
        add_doc(s, "cl-skhitech", "Discount email", JAN_EMAIL, country="PL")
        assert dedup.find_duplicate_document(s, "cl-kaneka", JAN_EMAIL) is None
        s.add(DossierItem(id="di-sk", client_id="cl-skhitech", category=Category.question,
                          title="Pay gap report", description="Can we get a pay gap report?", created_by="p-sofie"))
        s.commit()
        assert dedup.find_open_dossier_item(s, "cl-kaneka", Category.question, "Pay gap report. Can we get a pay gap report?") is None
        assert dedup.find_open_dossier_item(s, "cl-skhitech", Category.question, "Pay gap report. Can we get a pay gap report?") is not None


def test_superseded_or_duplicate_documents_are_not_matched(engine):
    from app.models import DocStatus

    with Session(engine) as s:
        world(s)
        add_doc(s, "cl-kaneka", "Old", JAN_EMAIL, status=DocStatus.superseded)
        assert dedup.find_duplicate_document(s, "cl-kaneka", JAN_EMAIL) is None


def test_same_claim_three_times_is_one_claim(engine):
    with Session(engine) as s:
        world(s)
        docs = [add_doc(s, "cl-kaneka", f"Doc {i}", f"Discount {i}") for i in range(3)]
        results = [dedup.upsert_claim(s, "cl-kaneka", fact("discount_pct", " 10 "), d, d.created_at.date()) for d in docs]
        assert [r.created for r in results] == [True, False, False]
        assert results[1].match is not None and "confirmed by 2 documents" in results[1].match.reason
        assert "confirmed by 3 documents" in results[2].match.reason
        # Same document again adds no extra evidence.
        dedup.upsert_claim(s, "cl-kaneka", fact("discount_pct", "10"), docs[2], docs[2].created_at.date())
        s.commit()
        claims = s.exec(select(Claim)).all()
        assert len(claims) == 1 and claims[0].value == "10"
        ev = s.exec(select(ClaimEvidence)).all()
        assert len(ev) == 3
        assert sum(e.relation == EvidenceRelation.origin for e in ev) == 1


def test_same_claim_other_client_is_separate(engine):
    with Session(engine) as s:
        world(s)
        d1 = add_doc(s, "cl-kaneka", "A", "a")
        d2 = add_doc(s, "cl-skhitech", "B", "b", country="PL")
        assert dedup.upsert_claim(s, "cl-kaneka", fact("discount_pct", "10"), d1, d1.created_at.date()).created
        assert dedup.upsert_claim(s, "cl-skhitech", fact("discount_pct", "10"), d2, d2.created_at.date()).created


def test_record_decision_and_override_requires_reason(engine):
    import pytest

    with Session(engine) as s:
        world(s)
        m = dedup.DedupMatch("di-1", 0.9, "Same question")
        d = dedup.record_decision(s, client_id="cl-kaneka", level="dossier_item", new_ref="doc-1", match=m, user_id="u-sofie")
        assert d.outcome.value == "linked"
        with pytest.raises(ValueError):
            dedup.record_decision(s, client_id="cl-kaneka", level="dossier_item", new_ref="doc-1", match=m,
                                  user_id="u-sofie", outcome="created_anyway")
        s.commit()
        assert len(s.exec(select(DedupDecision)).all()) == 1


def test_create_anyway_endpoint(engine, client):
    from tests.conftest import login

    with Session(engine) as s:
        world(s)
        doc = add_doc(s, "cl-kaneka", "Second pay gap question", "Can we split the pay gap report by site?")
        s.add(DossierItem(id="di-open", client_id="cl-kaneka", category=Category.question, title="Pay gap report",
                          description="Pay gap report question", created_by="p-sofie", linked_document_ids=[doc.id]))
        s.add(DossierItem(id="di-sk", client_id="cl-skhitech", category=Category.question, title="x",
                          description="y", created_by="p-sofie"))
        s.commit()
        doc_id = doc.id
    login(client)
    r = client.post("/dossier-items/di-open/create-anyway", json={"document_id": doc_id, "reason": "short"})
    assert r.status_code == 422
    r = client.post("/dossier-items/di-open/create-anyway",
                    json={"document_id": doc_id, "reason": "Different site, separate question", "extra": 1})
    assert r.status_code == 422
    r = client.post("/dossier-items/di-sk/create-anyway",
                    json={"document_id": doc_id, "reason": "Different site, separate question"})
    assert r.status_code == 403  # not assigned to SK hi-tech
    r = client.post("/dossier-items/di-open/create-anyway",
                    json={"document_id": doc_id, "reason": "Different site, separate question"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["linked_document_ids"] == [doc_id] and body["id"] != "di-open"
    r = client.post("/dossier-items/di-open/create-anyway",
                    json={"document_id": doc_id, "reason": "Different site, separate question"})
    assert r.status_code == 409
    with Session(engine) as s:
        dec = s.exec(select(DedupDecision)).one()
        assert dec.outcome.value == "created_anyway" and dec.override_reason
        assert doc_id not in s.get(DossierItem, "di-open").linked_document_ids
        from app.models import AuditLog

        assert s.exec(select(AuditLog).where(AuditLog.action == "create_anyway")).first() is not None
