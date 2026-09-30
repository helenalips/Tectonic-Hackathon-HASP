"""Vertical check: precedents at other clients, data minimization, approach conflicts."""
from sqlmodel import Session

from app.agents import vertical
from app.models import Category, DossierItem, ItemStatus
from tests.conftest import login
from tests.test_scenarios import SCENARIO_C, SCENARIO_D, SOFIE, add_doc, cityd_precedent, world


def test_mask_figures_masks_everything_including_year_like_counts():
    out = vertical.mask_figures("10% on 1.250 staff, €3,000 and a 2000 employee target")
    assert not any(ch.isdigit() for ch in out)
    assert "€" not in out and "%" not in out


def test_approach_classification_handles_negation():
    assert vertical.approach_of("We replaced manual Excel forecasting with one integrated system") == "integrated"
    assert vertical.approach_of(SCENARIO_D) == "manual"
    assert vertical.approach_of(SCENARIO_C) is None


def test_precedents_exclude_own_client(engine):
    with Session(engine) as s:
        world(s)
        cityd_precedent(s)
        s.add(DossierItem(id="di-own", client_id="cl-kaneka", category=Category.feature_request,
                          title="Pay gap report", description=SCENARIO_C, status=ItemStatus.resolved,
                          created_by="p-sofie"))
        s.commit()
        ids = [p.dossier_item_id for p in vertical.find_precedents(s, SOFIE, "cl-kaneka", SCENARIO_C, None)]
        assert "di-own" not in ids and "di-cityd-payframe" in ids


def test_unrelated_text_finds_no_precedent(engine):
    with Session(engine) as s:
        world(s)
        cityd_precedent(s)
        assert vertical.find_precedents(s, SOFIE, "cl-kaneka", "Printer toner is empty on floor two", None) == []


def test_same_approach_is_not_a_conflict(engine):
    with Session(engine) as s:
        world(s)
        cityd_precedent(s)
        doc = add_doc(s, "cl-kaneka", "Plan", "We will build the pay gap report in one integrated system.")
        assert vertical.check_approach(s, "cl-kaneka", doc, Category.feature_request) == []


def test_search_endpoint_is_data_minimized(engine, client):
    with Session(engine) as s:
        world(s)
        cityd_precedent(s)
    login(client)
    r = client.get("/search/precedents", params={"q": "adjusted and unadjusted pay gap report", "exclude_client_id": "cl-kaneka"})
    assert r.status_code == 200, r.text
    items = r.json()
    assert items and items[0]["client_label"] == "Consulting client, BE"
    assert set(items[0]) == {"dossier_item_id", "client_label", "category", "title", "resolution_summary",
                             "date", "expert", "similarity"}
    assert "12" not in items[0]["resolution_summary"] and "CityD" not in str(items[0])
    assert client.get("/search/precedents", params={"q": "ab"}).status_code == 422
    assert client.get("/search/precedents", params={"q": "abc", "category": "nope"}).status_code == 422
