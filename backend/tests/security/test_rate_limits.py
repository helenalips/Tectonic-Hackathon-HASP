"""A04 / LLM10 Unbounded consumption: the expensive endpoints are rate limited per user."""
from app.config import get_settings
from tests.security.helpers import LOTTE, SOFIE, as_user, event, require_route


def _limit(value: str) -> int:
    return int(value.split("/")[0])


def test_ask_is_rate_limited(client):
    require_route("POST", "/ask")
    as_user(client, SOFIE)
    n = _limit(get_settings().rate_ask) + 1
    codes = [client.post("/ask", json={"client_id": "cl-kaneka", "question": f"What discount applies {i}?"}).status_code
             for i in range(n)]
    assert codes[-1] == 429, codes
    assert client.post("/ask", json={"client_id": "cl-kaneka", "question": "Again?"}).json()["detail"].startswith("Too many")


def test_events_are_rate_limited(client):
    require_route("POST", "/events")
    as_user(client, SOFIE)
    n = _limit(get_settings().rate_events) + 1
    codes = [client.post("/events", json=event(text=f"Rate limit note number {i} about payroll.")).status_code
             for i in range(n)]
    assert codes[-1] == 429, codes


def test_solutions_are_rate_limited(client):
    require_route("POST", "/solutions")
    as_user(client, SOFIE)
    n = _limit(get_settings().rate_solutions) + 1
    codes = [client.post("/solutions", json={"dossier_item_id": "di-kan-1"}).status_code for _ in range(n)]
    assert codes[-1] == 429, codes


def test_limit_is_per_user_not_shared(client):
    """One user exhausting /ask does not lock out a colleague on the same IP."""
    require_route("POST", "/ask")
    as_user(client, SOFIE)
    for i in range(_limit(get_settings().rate_ask) + 1):
        client.post("/ask", json={"client_id": "cl-kaneka", "question": f"Question {i}?"})
    as_user(client, LOTTE)
    assert client.post("/ask", json={"client_id": "cl-kaneka", "question": "Lead question?"}).status_code != 429
