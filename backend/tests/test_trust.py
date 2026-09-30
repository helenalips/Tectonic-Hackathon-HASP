"""Trust scores: exact weights (schema.md §6), readable reasons, determinism, suspicious cap."""
from datetime import timedelta

from sqlmodel import Session

from app.agents import horizontal, trust
from app.schemas import ConflictResolve
from tests.test_scenarios import LOTTE, NOW, add_doc, fact, ingest, world


def test_labels():
    assert trust.label_for(75) == "Reliable"
    assert trust.label_for(74) == "Verify"
    assert trust.label_for(50) == "Verify"
    assert trust.label_for(49) == "Uncertain"


def test_weights_sum_to_one():
    assert abs(sum(trust.WEIGHTS.values()) - 1.0) < 1e-9


def test_fresh_owned_expert_document_is_reliable_and_deterministic(engine):
    with Session(engine) as s:
        world(s)
        doc = add_doc(s, "cl-kaneka", "Discount", "We grant a 10% discount on the audit price.", author="p-jan",
                      owner="p-jan", created=NOW - timedelta(days=3))
        for i in range(2):
            d = add_doc(s, "cl-kaneka", f"Confirm {i}", "10% discount confirmed", owner="p-jan")
            ingest(s, d if i else doc, [fact("discount_pct", "10")])
        ingest(s, doc, [fact("discount_pct", "10")])
        d3 = add_doc(s, "cl-kaneka", "Confirm 3", "10% discount again", owner="p-jan")
        ingest(s, d3, [fact("discount_pct", "10")])
        t1 = trust.document_trust(s, doc, now=NOW)
        t2 = trust.document_trust(s, doc, now=NOW)
        assert t1 == t2
        f = {x.name: x for x in t1.factors}
        assert f["recency"].value == 1.0 and f["recency"].reason == "Updated 3 days ago"
        assert f["ownership"].reason == "Owner: Jan Peeters"
        assert f["corroboration"].reason == "Confirmed by 3 documents"
        assert f["author_expertise"].reason.startswith("Jan Peeters works in commercial")
        expected = round(100 * sum(x.value * x.weight for x in t1.factors))
        assert t1.score == expected and t1.label == "Reliable"


def test_recency_linear_and_zero_after_three_years(engine):
    with Session(engine) as s:
        world(s)
        old = add_doc(s, "cl-kaneka", "Old", "x", created=NOW - timedelta(days=4 * 365))
        mid = add_doc(s, "cl-kaneka", "Mid", "x", created=NOW - timedelta(days=90 + (3 * 365 - 90) // 2))
        assert {f.name: f.value for f in trust.document_trust(s, old, now=NOW).factors}["recency"] == 0.0
        assert abs({f.name: f.value for f in trust.document_trust(s, mid, now=NOW).factors}["recency"] - 0.5) < 0.01


def test_suspicious_capped_at_40_with_reason(engine):
    with Session(engine) as s:
        world(s)
        doc = add_doc(s, "cl-kaneka", "Ticket", "Discount 10%", author="p-jan", owner="p-jan", suspicious=True)
        t = trust.document_trust(s, doc, now=NOW)
        assert t.score == 40 and t.label == "Uncertain"
        assert "Capped at 40" in t.factors[0].reason


def test_open_conflict_lowers_trust_and_reason(engine):
    with Session(engine) as s:
        world(s)
        d1 = add_doc(s, "cl-kaneka", "A", "discount 10%", author="p-jan")
        ingest(s, d1, [fact("discount_pct", "10")])
        before = trust.document_trust(s, d1, now=NOW)
        d2 = add_doc(s, "cl-kaneka", "B", "full price")
        ingest(s, d2, [fact("price_model", "full_price")])
        after = trust.document_trust(s, d1, now=NOW)
        assert {f.name: f.reason for f in after.factors}["no_open_conflicts"] == "1 open conflict"
        assert after.score == before.score - 15


def test_person_reliability(engine):
    with Session(engine) as s:
        world(s)
        assert trust.person_reliability(s, "p-jan", now=NOW).reasons == ["Limited track record"]
        assert trust.person_reliability(s, "p-jan", now=NOW).score == 60
        d = add_doc(s, "cl-kaneka", "Jan facts", "facts", author="p-jan")
        ingest(s, d, [fact("discount_pct", "10"), fact("headcount", "350")])
        c = add_doc(s, "cl-kaneka", "Confirm", "10% discount")
        ingest(s, c, [fact("discount_pct", "10")])
        r = trust.person_reliability(s, "p-jan", now=NOW)
        # confirmed 1/2, overruled 0/2, currency 1/1 -> 100 * (0.3 + 0.2 + 0.2) = 70
        assert r.score == 70
        assert r.reasons[0] == "1 of 2 claims later confirmed"
        # Overrule the headcount claim in a conflict.
        n = add_doc(s, "cl-kaneka", "New headcount", "400")
        _, conflicts = ingest(s, n, [fact("headcount", "400")])
        horizontal.resolve_conflict(s, LOTTE, conflicts[0].id, ConflictResolve(resolution="updated_record"))
        r2 = trust.person_reliability(s, "p-jan", now=NOW)
        assert r2.score == 60 and "1 of 2 claims overruled in a conflict" in r2.reasons


def test_claim_trust_uses_evidence(engine):
    with Session(engine) as s:
        world(s)
        d = add_doc(s, "cl-afriflora", "Policy", "Leave", type=__import__("app.models", fromlist=["DocType"]).DocType.policy,
                    country="NL", owner=None, created=NOW - timedelta(days=800))
        ups, _ = ingest(s, d, [fact("payroll_country", "et")])
        t = trust.claim_trust(s, ups[0].claim, now=NOW)
        reasons = {f.name: f.reason for f in t.factors}
        assert reasons["country_relevance"] == "Policy applies to NL, client is in ET"
        assert reasons["ownership"] == "No owner assigned"
        assert t.label == "Uncertain"
