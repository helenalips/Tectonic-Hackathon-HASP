# TrustGrid security

TrustGrid holds client knowledge: promises, prices, headcounts, who said what and when.
That is exactly the information a payroll provider must protect. This page states what we protect,
against what, how, and where the limits of this proof of concept are.

Everything here is enforced in code and checked by tests in `backend/tests/security/`.
Run `make security` and `make test-security` to verify it yourself.

## 1. Scope

| In scope | Out of scope (proof of concept) |
|---|---|
| FastAPI backend (`backend/app`), seed and fetch scripts (`backend/scripts`) | Production hosting, TLS termination, WAF |
| React frontend (`frontend/`) | Single sign-on (SD Worx would use its identity provider) |
| Claude API calls (optional, `LLM_MODE=claude`) | Multi-instance deployment (rate limits and token revocation are in-memory) |
| Demo data in `data/seed/` and the SQLite database | Backups, key rotation, data retention jobs |

## 2. Threat model (STRIDE)

| Asset | Threat | Control | Test |
|---|---|---|---|
| Session | **Spoofing**: forged or replayed session token | HS256 JWT, algorithm pinned on decode, issuer, audience, `exp`, `iat`, `jti` required; 15-minute lifetime; httpOnly, SameSite=Strict cookie, `Secure` over HTTPS; logout revokes the `jti` | `test_auth_contract.py` |
| Login | **Spoofing**: password guessing, account discovery | bcrypt; same error and the same timing for unknown email and wrong password; 5 attempts per minute per IP | `test_baseline.py` |
| Client record | **Tampering**: consultant writes to a client they are not assigned to (IDOR) | `rbac.require_client_write` on every write, server-side; the author is always the session user; no mass assignment (`extra="forbid"`) | `test_idor.py` |
| Client record | **Tampering**: a hostile document changes trust, claims or conflicts | Documents are data. Injection text is flagged, trust is capped at 40, suspicious text never produces claims or approach checks, the LLM never gets tools | `test_prompt_injection.py` |
| Audit trail | **Repudiation**: "I never resolved that conflict" | Append-only `AuditLog` for login, failed login, view, create, resolve, link, override; no route reads, updates or deletes it | `test_audit.py` |
| Other clients' data | **Information disclosure**: figures leak through cross-client search | Precedents carry a sector + country label, masked figures, date and expert only; dedup never matches across clients | `test_data_minimization.py` |
| Secrets, PII | **Information disclosure** through logs or errors | Secrets only from `.env`; JSON logs masked at record creation (email, IBAN, national number, phone, JWT, API keys, `password=`); no document text in logs; generic 500s; 422s name fields, never values | `test_logging.py`, `test_auth_contract.py` |
| Internet egress | **Information disclosure / SSRF** | One fetcher, HTTPS to `sdworx.com` only, redirects re-checked, no IP literals or IDN look-alikes, size and type limits; a static test forbids any other network import | `test_fetch.py` |
| API | **Denial of service**: expensive LLM and embedding calls, large bodies | Per-user rate limits on `/ask`, `/events`, `/solutions`; 128 KB body cap; field length limits on every input | `test_rate_limits.py`, `test_auth_contract.py` |
| Roles | **Elevation of privilege**: consultant claims lead rights | Role and assignments are re-read from the database on every request, never taken from the token or the request | `test_auth_contract.py` |
| Browser | **Tampering**: CSRF, XSS, clickjacking | SameSite=Strict plus an Origin / Fetch-Metadata check on every write, JSON-only bodies (415 otherwise); plain text only (stored text is stripped of markup, React escapes output, a static test forbids raw HTML sinks); CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY` | `test_auth_contract.py`, `test_input_validation.py`, `test_static_rules.py` |

## 3. Controls mapped to OWASP Top 10 (2021)

| OWASP | How TrustGrid handles it |
|---|---|
| **A01 Broken Access Control** | Every route depends on `get_current_user` (a test walks every registered route). Writes call `rbac.require_client_write`. Consultants see conflicts only for their clients. Cross-client results are data-minimized. Only `GET` and `POST` exist. |
| **A02 Cryptographic Failures** | bcrypt password hashes, never returned. JWT secret of 32+ characters from `.env` (validated at start-up). `Secure` cookie and HSTS when `COOKIE_SECURE=true`. No secrets in the repository (gitleaks on history and working tree). |
| **A03 Injection** | ORM only, no string-built SQL (static test). Strict Pydantic models with patterns and lengths. Stored text is plain text: HTML, entity-encoded HTML, control and bidi characters are removed. The API never returns HTML. |
| **A04 Insecure Design** | Documents are data, never instructions. Dedup is scoped to one client by design. Suspicious documents are capped in trust and excluded from claims, answers and solution drafts. Rate limits on costly endpoints. |
| **A05 Security Misconfiguration** | No `/docs` or `/openapi.json` in the running app. Strict security headers on every response. CORS allows only the frontend origin with credentials. Error responses are generic. |
| **A06 Vulnerable and Outdated Components** | Every dependency pinned (`requirements.lock`, `package-lock.json`). `pip-audit` and `npm audit` in `make security`. `python-jose` replaced by `PyJWT`: its `ecdsa` dependency has an open advisory. |
| **A07 Identification and Authentication Failures** | Generic login errors with equal timing, 5 logins per minute, 15-minute sessions, server-side revocation on logout, token size cap. |
| **A08 Software and Data Integrity Failures** | Locked dependency versions installed with `pip install -r requirements.lock` and `npm ci`. LLM output is parsed into a strict schema and falls back to the deterministic path when it does not validate. |
| **A09 Security Logging and Monitoring Failures** | Append-only audit trail. Structured JSON logs, masked for PII and secrets. Document content, questions and answers are never logged. |
| **A10 Server-Side Request Forgery** | `app/security/fetch.py` is the single egress point (static test). HTTPS, port 443, `sdworx.com` and subdomains, no credentials, IP literals or punycode; redirects re-checked hop by hop; environment proxies ignored; text content types only; 2 MB cap. |

## 4. Controls mapped to OWASP Top 10 for LLM applications (2025)

The LLM is optional (`LLM_MODE=claude`). The deterministic mock path demos every scenario with no API key,
and every LLM call falls back to it on any error.

| OWASP LLM | How TrustGrid handles it |
|---|---|
| **LLM01 Prompt Injection** | Detection on every document (NFKC, homoglyph folding, zero-width and spacing tricks, English, Dutch and French phrases, chat-template markers). Flagged documents are stored as data, marked suspicious with a reason, capped at trust 40, never sent to the LLM for extraction, and never used as a source for claims, answers or solution drafts. Every document that is sent is wrapped in `<untrusted_document>` tags that cannot be closed from inside, under a fixed system guard. Detection is a signal; the control is that no text can change scores, statuses or actions. |
| **LLM02 Sensitive Information Disclosure** | The LLM receives one client's documents only. Cross-client precedents contain no figures and no client name unless the user may see it. The system prompt holds no secrets. Logs are masked. |
| **LLM03 Supply Chain** | Pinned SDK (`anthropic`) and embedding library. The embedding model (`all-MiniLM-L6-v2`) is downloaded from Hugging Face once at first run: a build-time dependency, not runtime data fetching. Tests use a deterministic hash backend with no download. |
| **LLM04 Data and Model Poisoning** | Suspicious documents never produce claims. Every fact carries its evidence, author and date, so a planted fact is visible and traceable. Trust needs corroboration from several documents. |
| **LLM05 Improper Output Handling** | LLM output is validated against a Pydantic schema, converted to plain text, and rendered by React as text. Citation markers that point to a document the model was not given are dropped; an answer without a valid citation falls back to the deterministic path. |
| **LLM06 Excessive Agency** | The LLM has no tools and no write access. It drafts text; code decides what is stored, what conflicts and how much it is trusted. Every write is a user action, checked by RBAC and audited. |
| **LLM07 System Prompt Leakage** | The system prompt contains no secrets or access rules. Access control lives in code, not in the prompt. |
| **LLM08 Vector and Embedding Weaknesses** | Embedding searches are filtered by `client_id` for dedup. The only cross-client search returns data-minimized results. |
| **LLM09 Misinformation** | Every answer shows its sources, a trust score with the factors behind it, open conflicts, uncertainties, and the expert to ask. |
| **LLM10 Unbounded Consumption** | Per-user rate limits on `/ask` (20/min), `/solutions` (10/min), `/events` (30/min); input length limits; LLM timeout 30 s, one retry, 4 000 output tokens. |

## 5. Data and privacy

- **Fictional internal data.** People, emails, meetings, prices, discounts and headcounts are generated and marked `source: generated`. No real SD Worx or client records are used.
- **Real public client names.** By team decision the five client names from the challenge's `mock-cases.md` stay unchanged. The API returns `demo_data: true` and the UI shows a visible "Demo data" tag, so no fictional fact reads as a real SD Worx record.
- **GDPR mindset.** Purpose limitation: data serves one client record. Data minimization: cross-client results show a pattern, a date and an expert, not the client's figures. Access: consultants write only to assigned clients; every view and change is audited.
- **PII masking.** Logs and audit details mask email addresses, IBANs, Belgian national numbers, phone numbers, tokens and keys. Demo emails use `example.com`.
- **Secrets.** `.env` holds `JWT_SECRET`, `DEMO_PASSWORD` and the optional `ANTHROPIC_API_KEY`. It is git-ignored; `.env.example` holds no values. The demo password is never stored in code or seed files; `scripts/seed.py` hashes it with bcrypt.

## 6. Dependencies

- Backend: top-level pins in `backend/requirements.txt`, full transitive lock in `backend/requirements.lock` (`make lock`).
- Frontend: `frontend/package-lock.json`, installed with `npm ci`.
- `python-jose` was replaced by `PyJWT` because `python-jose` depends on `ecdsa`, which has an open advisory.
- `sentence-transformers` downloads `all-MiniLM-L6-v2` from Hugging Face at first run. This is a build-time dependency, not app data fetching. The app itself reaches the internet only through `app/security/fetch.py` (SD Worx pages) and the Anthropic SDK (when enabled).

## 7. How to verify

```bash
make security        # bandit (app + scripts), pip-audit, npm audit, gitleaks (history + working tree)
make test-security   # security contract tests
make check           # all tests + all scans; non-zero exit on any failure
```

`make security` exits non-zero on any bandit finding of medium severity or higher, any known
vulnerability in a Python dependency, any high or critical npm advisory, and any leaked secret.

Contract tests call the real HTTP API. A test whose endpoint does not exist yet is marked
`xfail` at runtime; once the route exists, the test runs for real, so a regression can't hide
behind an `xfail` marker.

## 8. Latest scan results

Run on 2026-09-30 with `make security` and `make check`.

| Tool | Version | Scope | Result |
|---|---|---|---|
| bandit | 1.9.4 | `backend/app`, `backend/scripts` (4 913 lines) | **0 issues** (0 high, 0 medium, 0 low) |
| pip-audit | 2.10.1 | `backend/requirements.lock` | **No known vulnerabilities found** |
| npm audit | npm 12.0.1 | `frontend/package-lock.json` (171 packages) | **0 vulnerabilities** (0 critical, 0 high, 0 moderate, 0 low) |
| gitleaks | 8.30.1 | git history (5 commits) and working tree | **No leaks found** |
| pytest | 9.1.1 | `backend/tests` (259 in `tests/security`) | **384 passed, 1 xfailed** (xfail: logout revocation needs a one-line change in `app/api/auth.py`) |
| vitest | 5.0.3 | `frontend` | **26 passed** |

Zero high or critical findings.

## 9. Known limitations

- **Demo build.** Runs locally on `127.0.0.1` over plain HTTP. In production: TLS, `COOKIE_SECURE=true` (turns on `Secure` and HSTS), a reverse proxy, and SSO instead of demo passwords.
- **SQLite, single process.** Rate-limit counters and revoked tokens live in memory and reset on restart. Production needs Redis or the database for both.
- **Shared demo password.** All demo users share `DEMO_PASSWORD`. There is no account lockout beyond the rate limit, and no MFA.
- **Read access is broad by design.** Every signed-in colleague may read every client record: knowledge sharing is the point. Writes are restricted, and cross-client *search* is minimized, but a user who opens another client's record sees its figures. A production rollout would scope reads to the portfolio or team.
- **Injection detection is heuristic.** It catches common and obfuscated phrasings, not every possible one. The design does not depend on it: documents never get tools, never change scores directly, and suspicious or not, they stay data.
- **Audit log is append-only in code, not in storage.** Anyone with file access to the SQLite database can edit it. Production needs a write-once store or a hash chain.
- **Frontend fonts** load from Google Fonts in the demo. Production should self-host them so no visitor IP reaches a third party.
