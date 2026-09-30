"""GET /people (directory) and GET /people/{id} (PersonProfileV2), on the full v2 seed."""
from tests.v2_seeded import login_as, seeded_client, seeded_engine  # noqa: F401

SOFIE, LOTTE = "sofie@example.com", "lotte@example.com"


def test_people_directory(seeded_client):
    login_as(seeded_client, SOFIE)
    r = seeded_client.get("/people")
    assert r.status_code == 200
    rows = {p["person"]["id"]: p for p in r.json()}
    assert "p-admin" not in rows and len(rows) >= 15
    ruben = rows["p-ruben"]
    assert ruben["title"] and ruben["location"] and ruben["domains"]
    assert ruben["solved_count"] >= 3 and ruben["solved_clients_count"] >= 1
    assert 0 <= ruben["reliability"]["score"] <= 100


def test_profile_v2_is_data_minimized_for_a_consultant(seeded_client):
    login_as(seeded_client, SOFIE)  # assigned Kaneka + CityD only
    r = seeded_client.get("/people/p-ruben")
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Senior payroll consultant logistics" and "Dutch" in body["languages"]
    assert body["bio"] and body["years_at_sdworx"] == 10
    assert body["clients_count"] == 2 and body["total_hours"] > 300
    nordvik = next(c for c in body["contributions"] if c["client_id"] == "cl-nordvik")
    assert nordvik["client_label"] == "Logistics client · BE"
    kaneka = next(c for c in body["contributions"] if c["client_id"] == "cl-kaneka")
    assert kaneka["client_label"] == "Kaneka Belgium"
    assert body["solved_cases"] and all(s["client_label"] == "Logistics client · BE" for s in body["solved_cases"])
    assert "Nordvik Logistics" not in str(body["solved_cases"]) + str(body["documents"])
    assert 0 < len(body["documents"]) <= 6
    assert "$2b$" not in r.text and "password" not in r.text.lower()


def test_profile_v2_lead_sees_names(seeded_client):
    login_as(seeded_client, LOTTE)
    body = seeded_client.get("/people/p-ruben").json()
    assert {s["client_label"] for s in body["solved_cases"]} == {"Nordvik Logistics"}


def test_people_auth_and_validation(seeded_client):
    seeded_client.cookies.clear()
    assert seeded_client.get("/people").status_code == 401
    assert seeded_client.get("/people/p-ruben").status_code == 401
    login_as(seeded_client, SOFIE)
    assert seeded_client.get("/people/p-nobody").status_code == 404
    assert seeded_client.get("/people/DROP TABLE").status_code in (404, 422)
