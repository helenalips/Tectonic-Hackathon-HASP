"""End-to-end consistency scenarios (contracts/schema.md §7: a, b, c, d, e, g) on small own fixture data.

Also exposes small helpers (world(), add_doc(), fact(), ingest(), NOW) reused by the other
consistency-engine test modules.
"""
import re
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from sqlmodel import Session, select

from app.agents import dedup, horizontal, trust, vertical
from app.models import (
    Claim,
    Client,
    Conflict,
    ConflictScope,
    DocStatus,
    DocType,
    Document,
    DossierItem,
    ItemStatus,
    Category,
    Person,
    Segment,
    Severity,
)
from app.models import Role
from app.security.auth import CurrentUser
from app.views import claim_view, consistency_status

NOW = datetime(2026, 9, 30, 12, 0, tzinfo=timezone.utc)

SOFIE = CurrentUser("u-sofie", "p-sofie", "sofie@example.com", Role.consultant, frozenset({"cl-kaneka"}))
LOTTE = CurrentUser("u-lotte", "p-lotte", "lotte@example.com", Role.lead, frozenset())

_counter = {"n": 0}


def world(session: Session) -> None:
    """Extra people and clients on top of conftest (which has p-sofie, p-lotte, cl-kaneka, cl-skhitech)."""
    session.add_all(
        [
            Person(id="p-jan", name="Jan Peeters", role="Account manager", team="Commercial BE",
                   email="jan@example.com", domains=["commercial"], countries=["BE"]),
            Person(id="p-tomasz", name="Tomasz Nowak", role="Implementation consultant", team="PL",
                   email="tomasz@example.com", domains=["hr_system_implementation"], countries=["PL"]),
            Person(id="p-abebe", name="Abebe Tesfaye", role="Payroll consultant", team="ET",
                   email="abebe@example.com", domains=["payroll"], countries=["ET"]),
            Client(id="cl-cityd", name="CityD-WES group", country="BE", sector="Consulting", segment=Segment.mid_market),
            Client(id="cl-afriflora", name="Afriflora", country="ET", sector="Horticulture", segment=Segment.enterprise),
        ]
    )
    session.commit()


def add_doc(
    session: Session,
    client_id: str | None,
    title: str,
    content: str,
    *,
    author: str = "p-sofie",
    type: DocType = DocType.note,
    created: datetime | None = None,
    owner: str | None = "p-sofie",
    country: str = "BE",
    status: DocStatus = DocStatus.active,
    duplicate_of: str | None = None,
    suspicious: bool = False,
) -> Document:
    _counter["n"] += 1
    created = created or NOW - timedelta(days=5)
    doc = Document(
        id=f"doc-t{_counter['n']}",
        client_id=client_id,
        type=type,
        title=title,
        content=content,
        content_hash=dedup.content_hash(content),
        author_id=author,
        owner_id=owner,
        country_scope=country,
        created_at=created,
        updated_at=created,
        status=status,
        duplicate_of=duplicate_of,
        suspicious=suspicious,
    )
    session.add(doc)
    session.flush()
    return doc


def fact(key: str, value: str, unit: str | None = None):
    return SimpleNamespace(key=key, value=value, unit=unit, confidence=0.9, quote="")


def ingest(session: Session, doc: Document, facts) -> tuple[list, list[Conflict]]:
    """Mini capture pipeline: upsert every fact, then run the horizontal check on it."""
    ups, conflicts = [], []
    for f in facts:
        up = dedup.upsert_claim(session, doc.client_id, f, doc, doc.created_at.date())
        ups.append(up)
        conflicts += horizontal.check_claim(session, up.claim, doc)
    session.commit()
    return ups, conflicts


JAN_EMAIL = (
    "Hi Sofie,\n\nAs agreed with Kaneka we grant a 10% discount on the pay equity audit.\n"
    "The discount applies to the full audit scope.\n\nKind regards,\nJan Peeters"
)


def cityd_precedent(session: Session) -> DossierItem:
    sol = add_doc(
        session, "cl-cityd", "Pay framework after merger - solution",
        "Built a competence matrix and a salary scale with 12 grades on top of it, in one integrated system.",
        type=DocType.solution, created=datetime(2026, 4, 13, tzinfo=timezone.utc),
    )
    item = DossierItem(
        id="di-cityd-payframe",
        client_id="cl-cityd",
        category=Category.feature_request,
        title="Pay gap report after the CityD-WES merger",
        description="Consultants had pay discrepancies after the merger; the client needed pay gap insight.",
        status=ItemStatus.resolved,
        resolution=(
            "CityD-WES built a competence matrix and a salary scale with 12 grades on top of it, "
            "moved 1,250 salary records into one integrated system with automated calculations "
            "(4.5% budget), replacing manual Excel forecasting. Live since 2020."
        ),
        created_by="p-lotte",
        created_at=datetime(2026, 4, 13, tzinfo=timezone.utc),
        linked_document_ids=[sol.id],
    )
    session.add(item)
    session.commit()
    return item


# ---------------------------------------------------------------------------- scenarios


def test_scenario_a_full_price_vs_promised_discount(engine):
    with Session(engine) as s:
        world(s)
        email = add_doc(s, "cl-kaneka", "Pay equity audit – discount confirmation", JAN_EMAIL,
                        author="p-jan", type=DocType.email, created=datetime(2025, 3, 14, 9, tzinfo=timezone.utc))
        ingest(s, email, [fact("discount_pct", "10", "%")])
        invoice = add_doc(s, "cl-kaneka", "Invoice note pay equity audit",
                          "Invoice the pay equity audit at full price.", type=DocType.note)
        _, conflicts = ingest(s, invoice, [fact("price_model", "full_price")])

        assert len(conflicts) == 1
        c = conflicts[0]
        assert c.scope == ConflictScope.within_record
        assert c.severity == Severity.high
        assert c.explanation == (
            "You're invoicing full price, but Jan Peeters promised a 10% discount in writing on 14 Mar 2025 "
            "('Pay equity audit – discount confirmation')."
        )
        assert c.existing_document_id == email.id and c.new_document_id == invoice.id
        assert consistency_status(s, "cl-kaneka").consistent is False


def test_scenario_b_headcount_contract_vs_onboarding(engine):
    with Session(engine) as s:
        world(s)
        contract = add_doc(s, "cl-skhitech", "Service contract", "Contract covers 500 employees.",
                           author="p-tomasz", type=DocType.contract, country="PL",
                           created=datetime(2025, 2, 2, tzinfo=timezone.utc))
        ingest(s, contract, [fact("headcount", "500", "employees"), fact("headcount_target", "2000", "employees")])
        onboarding = add_doc(s, "cl-skhitech", "Onboarding kick-off", "We onboard 650 employees.",
                             type=DocType.onboarding, country="PL")
        _, conflicts = ingest(s, onboarding, [fact("headcount", "650", "employees")])

        assert len(conflicts) == 1  # headcount_target 2000 is NOT a conflict with headcount 650
        c = conflicts[0]
        assert c.severity == Severity.medium
        assert "650 employees" in c.explanation and "500 employees" in c.explanation
        assert "Tomasz Nowak" in c.explanation and "2 Feb 2025" in c.explanation


SCENARIO_C = (
    "Feature request: Kaneka asks for an adjusted and unadjusted pay gap report for the EU Pay "
    "Transparency Directive. Several data sources have to work together."
)
SCENARIO_D = (
    "Proposal: calculate the adjusted and unadjusted pay gap manually in Excel spreadsheets, "
    "one sheet per department, and send the totals to HR."
)


def test_scenario_c_precedent_found_without_conflict(engine):
    with Session(engine) as s:
        world(s)
        item = cityd_precedent(s)
        doc = add_doc(s, "cl-kaneka", "Pay gap report request", SCENARIO_C)
        precedents = vertical.find_precedents(s, SOFIE, "cl-kaneka", SCENARIO_C, Category.feature_request)
        assert precedents and precedents[0].dossier_item_id == item.id
        p = precedents[0]
        assert p.client_label == "Consulting client, BE"  # Sofie is not assigned to CityD-WES
        assert "CityD" not in p.title + p.resolution_summary
        assert p.expert.name == "Sofie Maes"  # author of the linked solution document
        # A request without an approach proposal is not an across-records conflict.
        assert vertical.check_approach(s, "cl-kaneka", doc, Category.feature_request) == []


def test_scenario_d_manual_excel_vs_proven_integrated_system(engine):
    with Session(engine) as s:
        world(s)
        cityd_precedent(s)
        doc = add_doc(s, "cl-kaneka", "Pay gap calculation approach", SCENARIO_D)
        conflicts = vertical.check_approach(s, "cl-kaneka", doc, Category.feature_request)
        assert len(conflicts) == 1
        c = conflicts[0]
        assert c.scope == ConflictScope.across_records and c.severity == Severity.medium
        assert c.client_id == "cl-kaneka" and c.existing_document_id is None
        assert c.explanation.startswith("At a Consulting client in BE, Sofie Maes solved this with one integrated system")
        assert "This proposal uses manual Excel calculations." in c.explanation
        assert "CityD" not in c.explanation and "1,250" not in c.explanation and "12 grades" not in c.explanation
        # Idempotent for the same document.
        assert vertical.check_approach(s, "cl-kaneka", doc, Category.feature_request) == []


def test_scenario_e_unowned_note_and_foreign_policy_low_trust(engine):
    with Session(engine) as s:
        world(s)
        note = add_doc(s, "cl-afriflora", "Payroll note", "Payroll cut-off moved, check the leave balances.",
                       author="p-lotte", owner=None, country="ET", created=NOW - timedelta(days=900))
        policy = add_doc(s, "cl-afriflora", "Leave policy", "Statutory leave policy: 25 days per year.",
                         author="p-lotte", owner=None, type=DocType.policy, country="NL",
                         created=NOW - timedelta(days=800))
        s.commit()
        t_note = trust.document_trust(s, note, now=NOW)
        t_policy = trust.document_trust(s, policy, now=NOW)
        assert t_note.label in ("Verify", "Uncertain") and t_note.score < 75
        assert t_policy.label == "Uncertain"
        reasons = {f.name: f.reason for f in t_policy.factors}
        assert reasons["ownership"] == "No owner assigned"
        assert reasons["country_relevance"] == "Policy applies to NL, client is in ET"


def test_scenario_g_repetition_is_confirmation(engine):
    with Session(engine) as s:
        world(s)
        email = add_doc(s, "cl-kaneka", "Pay equity audit – discount confirmation", JAN_EMAIL,
                        author="p-jan", type=DocType.email, created=datetime(2025, 3, 14, tzinfo=timezone.utc))
        ingest(s, email, [fact("discount_pct", "10", "%")])
        claim = s.exec(select(Claim).where(Claim.client_id == "cl-kaneka")).one()
        trust_1 = trust.claim_trust(s, claim, now=NOW).score

        # Forwarded copy of Jan's email -> linked as duplicate, not a new document.
        forwarded = (
            "Fwd: Pay equity audit – discount confirmation\n\n---------- Forwarded message ---------\n"
            "From: Jan Peeters <jan@example.com>\nDate: Fri, 14 Mar 2025\nSubject: Pay equity audit\n"
            "To: Sofie Maes <sofie@example.com>\n\n" + "\n".join("> " + line for line in JAN_EMAIL.splitlines())
        )
        match = dedup.find_duplicate_document(s, "cl-kaneka", forwarded)
        assert match is not None and match.matched_id == email.id
        assert "forwarded copy" in match.reason and "Jan Peeters" in match.reason
        dup = add_doc(s, "cl-kaneka", "Fwd: discount", forwarded, status=DocStatus.duplicate, duplicate_of=email.id)

        meeting = add_doc(s, "cl-kaneka", "Steering meeting", "Jan confirmed the 10 % discount on the audit.",
                          type=DocType.meeting)
        ups, conflicts = ingest(s, meeting, [fact("discount_pct", "10", "%")])
        assert ups[0].created is False and conflicts == []
        visit = add_doc(s, "cl-kaneka", "Visit report", "Discount of 10% on the audit was repeated.",
                        type=DocType.visit)
        ingest(s, visit, [fact("discount_pct", "10", "%")])

        claims = s.exec(select(Claim).where(Claim.client_id == "cl-kaneka")).all()
        assert len(claims) == 1
        view = claim_view(s, claims[0])
        assert view.evidence_count == 3
        trust_3 = trust.claim_trust(s, claims[0], now=NOW)
        assert trust_3.score > trust_1
        assert any(f.reason == "Confirmed by 3 documents" for f in trust_3.factors)

        # Same open question twice -> linked to the open dossier item.
        q1 = DossierItem(id="di-q1", client_id="cl-kaneka", category=Category.question,
                         title="Adjusted and unadjusted pay gap",
                         description="Can we get an adjusted and unadjusted pay gap report?",
                         created_by="p-sofie")
        s.add(q1)
        s.commit()
        m = dedup.find_open_dossier_item(s, "cl-kaneka", Category.question,
                                         "Is it possible to get a report with the adjusted and unadjusted pay gap?")
        assert m is not None and m.matched_id == "di-q1"
        dedup.record_decision(s, client_id="cl-kaneka", level="dossier_item", new_ref="doc-x", match=m,
                              user_id="u-sofie")
        s.commit()

        status = consistency_status(s, "cl-kaneka")
        assert status.consistent is True and status.open_duplicates == 0
        # 1 duplicate document + 2 claim confirmations + 1 linked question
        assert status.linked_duplicates == 4
        assert dup.status == DocStatus.duplicate


def test_precedent_contains_no_source_figures(engine):
    with Session(engine) as s:
        world(s)
        cityd_precedent(s)
        precedents = vertical.find_precedents(s, SOFIE, "cl-kaneka", SCENARIO_C, None)
        assert precedents
        for p in precedents:
            text = " ".join([p.title, p.resolution_summary, p.client_label])
            assert set(re.findall(r"\d+", text)) <= {"2020"}, text


def test_privileged_user_sees_client_name(engine):
    with Session(engine) as s:
        world(s)
        cityd_precedent(s)
        p = vertical.find_precedents(s, LOTTE, "cl-kaneka", SCENARIO_C, None)[0]
        assert p.client_label == "CityD-WES group"
        assert "12" not in p.resolution_summary  # figures are masked for everyone


@pytest.mark.parametrize("valid_from", [date(2025, 1, 1)])
def test_claim_valid_from_kept(engine, valid_from):
    with Session(engine) as s:
        world(s)
        d = add_doc(s, "cl-kaneka", "x", "Headcount is 350")
        up = dedup.upsert_claim(s, "cl-kaneka", fact("headcount", "350", "employees"), d, valid_from)
        assert up.created and up.claim.valid_from == valid_from
