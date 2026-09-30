# TrustGrid

**One source of truth per client, checked against every client.** TrustGrid turns scattered client
touchpoints (emails, meetings, contracts, tickets) into one record per client. It catches conflicts and
duplicates as they arrive, shows why each fact can be trusted, and names the colleague to ask.

Built for the SD Worx hackathon challenge *"Find it. Understand it. Trust it."*

> **Demo data.** The five client names come from the challenge brief. Every internal fact (prices,
> discounts, headcounts, emails, people) is fictional and tagged "Demo data" in the app.

## Architecture

```
  Browser (React + Vite, SD Worx house style)       http://localhost:5173
      │  same-origin /api/* (Vite proxy), httpOnly session cookie
      ▼
  FastAPI  ──────────────────────────────────────────────────────  http://127.0.0.1:8000
  │  security layer: auth (JWT cookie) · RBAC · rate limits · CSRF origin check
  │                  · security headers · strict schemas · audit log · PII-masked logs
  │
  ├─ POST /events ──► Capture ─► sanitize + injection check
  │                      ├─► Dedup (same client only): document · claim · dossier item
  │                      ├─► Horizontal check: conflicts within this client's record
  │                      └─► Vertical check: precedents + approach conflicts at other clients
  │                                          (data-minimized: sector + country, no figures)
  ├─ GET  /clients/{id} ─► record: timeline · claims + evidence · trust scores · experts
  ├─ POST /ask ─────────► answer with sources, trust and experts
  ├─ POST /solutions ───► draft backed by the record expert and the problem expert
  │
  ├─ Trust engine: recency · ownership · country · author expertise · corroboration · conflicts
  ├─ Embeddings: all-MiniLM-L6-v2 (local)            ├─ LLM: Claude (optional, LLM_MODE=claude)
  └─ SQLite (SQLModel ORM)                           └─ Fetcher: https://sdworx.com only
```

Contracts: `contracts/schema.md` (data), `contracts/openapi.yaml` (API), `contracts/interfaces.md` (modules).

## Setup

Requires Python 3.11, Node 20+ and (for `make security`) `gitleaks` (`brew install gitleaks`).

```bash
cp .env.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # paste as JWT_SECRET in .env
# set DEMO_PASSWORD in .env (12+ characters); leave LLM_MODE=mock unless you have an Anthropic key
make install      # venv + pinned backend deps, npm ci for the frontend
make seed         # build the demo database from mock-cases.md and data/seed/
make dev          # backend on :8000, frontend on :5173
```

Open http://localhost:5173. The first run downloads the embedding model (about 90 MB) from Hugging Face.

### Demo users

All demo users share the password from `DEMO_PASSWORD` in your `.env`.

| Email | Role | Can edit |
|---|---|---|
| `sofie@example.com` | Consultant (Sofie Maes, pay transparency) | Kaneka Belgium, CityD-WES group |
| `tomasz@example.com` | Consultant (Tomasz Nowak, HR system implementation) | SK hi-tech battery materials Poland |
| `lotte@example.com` | Team lead (Lotte de Vries) | All clients |
| `admin@example.com` | Admin | All clients |

## Demo script

Live inputs live in `data/seed/demo_inputs.json` (keys `a`, `c`, `d`, `f`, `g`). Paste each `text`
into **Capture new event** with the listed client and type. Run `make demo-reset` before every rehearsal.

1. **Log in and open a client.** Log in as `sofie@example.com`, open **Kaneka Belgium**.
   The branded timeline shows every touchpoint with its trust score, the record expert and the
   problem expert, and the status line reads **"0 conflicts · 0 duplicates"**.
2. **Scenario a: a conflict with a promise.** Add event `a` (note, *"Invoice note from Finance: … full price …"*).
   TrustGrid flags a **HIGH within-record conflict**: full price contradicts Jan Peeters' 10 % discount
   email of 2025-03-14. Open it, read the plain-language explanation, and **resolve** it (for example
   "Record is correct: keep the discount").
3. **Scenario g: the same fact again, nothing duplicated.** Add the four `g` events in order: the steering
   meeting note restating the 10 % discount, the forwarded copy of Jan's email, and the same open question
   twice. Nothing is duplicated: the forward is linked as a duplicate, the question links to the existing
   open item, and the discount claim now reads **"confirmed by 3 documents"** with a **higher trust score**.
4. **Scenario c: a precedent at another client.** Add event `c` (email, *"Feature request … adjusted and
   unadjusted pay gap report …"*). TrustGrid finds the **precedent at CityD-WES** (integrated system with
   competence matrix and salary scale) and names **Sofie Maes as problem expert**.
5. **Scenario d: a cross-record warning.** Add event `d` (note, *"Proposal … manual Excel pay gap
   calculation …"*). TrustGrid warns that this **differs from the approach that solved the same problem**
   at another client.
6. **Solution builder.** Open the pay gap dossier item and click **Build solution**. The draft is built on
   the documents of both experts and shows **consistent on both dimensions** (within the record and
   across records).
7. **Ask a question.** Ask *"Which discount applies to the pay equity audit?"*. The answer cites its sources, shows the
   trust score and why, lists what is uncertain, and names the experts.
8. **Security.**
   - Open **Global Paint company**: the ticket with *"ignore previous instructions…"* is **flagged
     suspicious**, capped at trust 40, and none of its instructions were followed. (Optional: add event `f`
     as `lotte@example.com`.)
   - As Sofie, open **SK hi-tech**: read-only. The API refuses any write with **403** (`make test-security`
     proves it: `test_idor.py`).
   - The fetcher rejects any **non-SD Worx URL** (`test_fetch.py`).
   - `SECURITY.md` shows **zero high or critical findings** from bandit, pip-audit, npm audit and gitleaks.
9. **House style everywhere.** SD Worx blue, the SD Worx type scale and logo on every screen; short, plain,
   confident copy (`branding/`, `docs/BRANDING_NOTES.md`).

## Make targets

| Target | What it does |
|---|---|
| `make install` | Create the venv, install pinned backend and frontend dependencies |
| `make seed` | Parse `mock-cases.md` and rebuild the SQLite demo database |
| `make demo-reset` | Reset the demo to its starting state (same as `seed`) |
| `make dev` | Run the backend (:8000) and the frontend (:5173) |
| `make test` | Backend and frontend tests |
| `make test-security` | Security contract tests only |
| `make security` | bandit, pip-audit, npm audit, gitleaks; fails on any high or critical finding |
| `make check` | Everything above that must be green before the demo |
| `make lock` | Refresh `backend/requirements.lock` |

## Security

Client knowledge is sensitive, so security is built in, not added on:

- Every route needs a session; consultants write only to their assigned clients (checked server-side).
- Documents are data, never instructions: prompt injection is flagged and can't change trust or actions.
- Cross-client insight without cross-client leaks: precedents show sector, country, pattern and expert, never figures.
- Dedup never matches across clients.
- Append-only audit trail; logs mask personal data and never contain secrets or document text.
- The app reaches the internet only for `https://sdworx.com` pages (and Claude, when enabled).

Details, threat model, OWASP mapping and the latest scan results: [SECURITY.md](SECURITY.md).

## Teamleden

- Anna Vermeulen
- Seppe Reussen
- Pieter-Jan Brys
- Helena Lips
