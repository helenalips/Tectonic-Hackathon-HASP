from tests.conftest import login
from tests.test_experts_support import disputed_price, fallbacks, world  # noqa: F401  (fixtures)


def test_ask_returns_backed_answer(client, world):
    login(client)
    r = client.post("/ask", json={"client_id": "cl-kaneka", "question": "What discount did we agree on the audit?"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mode"] == "mock"
    assert "10%" in body["answer"] and "[1]" in body["answer"]
    assert "confirmed by 3 documents" in body["answer"]

    first = body["citations"][0]
    assert first["ref"] == 1 and first["document_id"] == "doc-k-email"
    assert first["confirmed_by"] == 3
    assert 0 <= first["trust"]["score"] <= 100 and first["trust"]["label"]

    # The injected ticket is never a source, and the exclusion is explained.
    assert all(c["document_id"] != "doc-k-inject" for c in body["citations"])
    assert "50 percent" not in body["answer"]
    assert any("excluded because it contains instruction-like text" in u for u in body["uncertainties"])

    assert body["experts"]["record_expert"]["person"]["id"] == "p-jan"


def test_ask_flags_wrong_country_source(client, world):
    login(client)
    r = client.post("/ask", json={"client_id": "cl-kaneka", "question": "Which discount rules apply for audits?"})
    body = r.json()
    refs = {c["document_id"]: c["ref"] for c in body["citations"]}
    assert "doc-k-nl" in refs
    assert any(f"[{refs['doc-k-nl']}]" in u and "applies to NL, not BE" in u for u in body["uncertainties"])


def test_ask_validation_and_auth(client, world):
    assert client.post("/ask", json={"client_id": "cl-kaneka", "question": "discount?"}).status_code == 401
    login(client)
    assert client.post("/ask", json={"client_id": "cl-nope", "question": "discount?"}).status_code == 404
    assert client.post("/ask", json={"client_id": "cl-kaneka", "question": "x", "extra": 1}).status_code == 422


def test_ask_surfaces_open_conflict(client, disputed_price):
    login(client)
    body = client.post("/ask", json={"client_id": "cl-kaneka", "question": "What price do we invoice for the audit?"}).json()
    assert any(u.startswith("Open high conflict:") for u in body["uncertainties"])
    assert "disputed" in body["answer"]


def test_llm_output_is_validated_and_falls_back(client, world, monkeypatch):
    from app import llm

    seen = {}

    def fake_complete(system, user_content, schema):
        seen["system"], seen["user"] = system, user_content
        return schema(answer="<b>The discount is 10%</b> [1] and 99% [7].", used_refs=[1, 7], uncertainties=[])

    monkeypatch.setattr(llm, "llm_enabled", lambda: True)
    monkeypatch.setattr(llm, "complete_json", fake_complete)
    login(client)
    body = client.post("/ask", json={"client_id": "cl-kaneka", "question": "What discount did we agree?"}).json()
    assert body["mode"] == "llm"
    assert "<b>" not in body["answer"] and "[7]" not in body["answer"]
    assert [c["ref"] for c in body["citations"]] == [1]
    assert '<untrusted_document id="doc-k-email">' in seen["user"]
    assert "Ignore previous instructions" not in seen["user"]  # suspicious docs never reach the model

    monkeypatch.setattr(llm, "complete_json", lambda *a: None)
    body = client.post("/ask", json={"client_id": "cl-kaneka", "question": "What discount did we agree?"}).json()
    assert body["mode"] == "mock" and "10%" in body["answer"]
