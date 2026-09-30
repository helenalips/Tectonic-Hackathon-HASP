# Internal module interfaces (phase 1)

Owner: orchestrator. These are the Python signatures agents call across module boundaries.
Implement exactly these names and signatures; add private helpers freely.
Response shapes: `backend/app/schemas.py`. Tables: `backend/app/models.py`. Both frozen.

## Ownership

| Agent | Owns (writes) |
|---|---|
| 1 Data & Capture | `app/llm.py`, `app/agents/capture.py`, `app/api/events.py`, `scripts/parse_mock_data.py`, `scripts/seed.py`, `scripts/fetch_sdworx_public.py`, `data/seed/*.json`, `data/sdworx_public.json`, `tests/test_capture*.py`, `tests/test_seed*.py` |
| 2 Consistency engine | `app/embeddings.py`, `app/agents/dedup.py`, `app/agents/horizontal.py`, `app/agents/vertical.py`, `app/agents/trust.py`, `app/api/conflicts.py`, `app/api/search.py`, `app/api/dossiers.py`, `app/views.py`, `tests/test_dedup*.py`, `tests/test_horizontal*.py`, `tests/test_vertical*.py`, `tests/test_trust*.py`, `tests/test_scenarios.py` |
| 3 Experts, answer, solution | `app/agents/experts.py`, `app/agents/answer.py`, `app/agents/solution.py`, `app/api/clients.py`, `app/api/people.py`, `app/api/ask.py`, `app/api/solutions.py`, `tests/test_experts*.py`, `tests/test_answer*.py`, `tests/test_solution*.py`, `tests/test_clients*.py`, `docs/SOLUTION.md` |
| 4 Frontend | everything under `frontend/` (except `src/theme/tokens.ts` values), `docs/BRANDING_NOTES.md` |
| 5 Security & QA | `app/security/*`, `tests/security/*`, `SECURITY.md`, `README.md`, `Makefile`, `.gitleaks.toml` |

Frozen for everyone except the orchestrator: `app/models.py`, `app/schemas.py`, `app/config.py`, `app/db.py`, `app/main.py`, `contracts/*`.
Need a change? Stop and report it; do not edit.

## Signatures

```python
# app/llm.py  (Agent 1)
def llm_enabled() -> bool                                  # settings.llm_mode == "claude" and key set
def complete_json(system: str, user_content: str, schema: type[T]) -> T | None
    # Claude call, no tools. Output parsed + validated with schema.model_validate_json.
    # Returns None on any error/invalid output -> caller uses its deterministic mock path.
    # system MUST start with sanitize.LLM_SYSTEM_GUARD; documents MUST go through sanitize.wrap_untrusted.

# app/agents/capture.py  (Agent 1)
@dataclass class ExtractedClaim: key: str; value: str; unit: str | None; confidence: float; quote: str
def normalize_value(key: str, raw: str) -> tuple[str, str | None] | None   # None = invalid for this key
def extract_claims(text: str) -> list[ExtractedClaim]      # only taxonomy keys; values normalized
def classify_category(text: str) -> Category
def capture_event(session, user: CurrentUser, body: EventCreate) -> EventResult
    # orchestrates: sanitize -> injection check -> dedup.find_duplicate_document -> store Document
    # -> dedup.find_open_dossier_item / create DossierItem -> extract_claims -> dedup.upsert_claim
    # -> horizontal.check_claim -> vertical.find_precedents + vertical.check_approach -> audit -> EventResult

# app/embeddings.py  (Agent 2)
def embed(texts: list[str]) -> np.ndarray                  # L2-normalized rows
def cosine(a: np.ndarray, b: np.ndarray) -> float
    # EMBEDDINGS_BACKEND env: "minilm" (default at runtime) | "hash" (tests: deterministic, no download)

# app/agents/dedup.py  (Agent 2)
def content_hash(text: str) -> str
@dataclass class DedupMatch: matched_id: str; similarity: float; reason: str
def find_duplicate_document(session, client_id: str, text: str) -> DedupMatch | None
def find_open_dossier_item(session, client_id: str, category: Category, text: str) -> DedupMatch | None
@dataclass class ClaimUpsert: claim: Claim; created: bool; match: DedupMatch | None
def upsert_claim(session, client_id: str, extracted: ExtractedClaim, document: Document, valid_from: date) -> ClaimUpsert
    # same client+key+value active claim -> add ClaimEvidence(confirmation), created=False
def record_decision(session, *, client_id, level, new_ref, match: DedupMatch, user_id, outcome="linked", override_reason=None) -> DedupDecision

# app/agents/horizontal.py  (Agent 2)
def check_claim(session, claim: Claim, document: Document) -> list[Conflict]   # within_record, persisted
def resolve_conflict(session, user: CurrentUser, conflict_id: str, body: ConflictResolve) -> Conflict

# app/agents/vertical.py  (Agent 2)
def find_precedents(session, user: CurrentUser, client_id: str, text: str, category: Category | None, k: int = 5) -> list[Precedent]
def check_approach(session, client_id: str, document: Document, category: Category) -> list[Conflict]  # across_records

# app/agents/trust.py  (Agent 2)
def document_trust(session, doc: Document) -> TrustScore
def claim_trust(session, claim: Claim) -> TrustScore
def person_reliability(session, person_id: str) -> PersonReliability
def label_for(score: int) -> str

# app/views.py  (Agent 2) — ORM -> schema converters used by all APIs
def person_ref(session, person_id) -> PersonRef
def claim_view(session, claim) -> ClaimView
def conflict_view(session, conflict) -> ConflictView
def dossier_item_view(session, item) -> DossierItemView
def consistency_status(session, client_id) -> ConsistencyStatus

# app/agents/experts.py  (Agent 3)
def record_expert(session, client_id: str) -> Expert | None
def problem_expert(session, user: CurrentUser, client_id: str, category: Category | None, text: str) -> Expert | None
def experts_for(session, user, client_id, category=None, text="") -> Experts

# app/agents/answer.py  (Agent 3)
def answer_question(session, user: CurrentUser, body: AskRequest) -> Answer

# app/agents/solution.py  (Agent 3)
def build_solution(session, user: CurrentUser, body: SolutionRequest) -> SolutionView
```

## Rules for every agent
- Tests use the fixtures in `tests/conftest.py`, `EMBEDDINGS_BACKEND=hash`, `LLM_MODE=mock`.
- Mock path must be deterministic and must demo every scenario (schema.md §7) with no API key.
- Every endpoint: `Depends(get_current_user)`; writes call `rbac.require_client_write`; mutations call `audit.record`.
- Never render/return HTML. Never build SQL strings. Never log document content or secrets.
- Dedup matching is always filtered by the same `client_id`.
- Client names: the real names from mock-cases.md stay unchanged (team decision). All generated internal facts are `source: generated` and the API sets `demo_data: true`.
