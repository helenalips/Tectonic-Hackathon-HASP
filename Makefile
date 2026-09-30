# TrustGrid — hackathon build. Run `make help` for targets.
PY      := backend/.venv/bin/python
PIP     := backend/.venv/bin/pip
.DEFAULT_GOAL := help

.PHONY: help install lock seed demo-reset dev test test-security security check

help:
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-14s %s\n", $$1, $$2}'

install: ## Create venv, install pinned backend + frontend deps
	test -d backend/.venv || python3.11 -m venv backend/.venv
	$(PIP) install -q -r backend/requirements.lock
	cd frontend && npm ci --no-audit --no-fund

lock: ## Refresh the full backend lock file
	$(PIP) freeze > backend/requirements.lock

seed: ## Parse mock-cases.md and (re)build the SQLite demo database
	cd backend && ../$(PY) -m scripts.parse_mock_data && ../$(PY) -m scripts.seed

demo-reset: seed ## Reset the demo to its starting state (same as seed; drops and rebuilds the DB)

dev: ## Run backend :8000 and frontend :5173
	@trap 'kill 0' INT TERM; \
	(cd backend && ../$(PY) -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload) & \
	(cd frontend && npm run dev -- --host 127.0.0.1 --port 5173) & \
	wait

test: ## Backend + frontend tests
	cd backend && ../$(PY) -m pytest -q
	@if [ -f frontend/package.json ]; then cd frontend && npm test --silent; fi

test-security: ## Security contract tests only (backend/tests/security)
	cd backend && ../$(PY) -m pytest -q tests/security

security: ## bandit (app + scripts), pip-audit, npm audit, gitleaks. Non-zero exit on any finding >= medium (npm: >= high)
	cd backend && ../$(PY) -m bandit -q -r app scripts -ll
	cd backend && ../$(PY) -m pip_audit -r requirements.lock --progress-spinner off
	@if [ -f frontend/package-lock.json ]; then cd frontend && npm audit --audit-level=high; fi
	@command -v gitleaks >/dev/null || { echo "gitleaks is not installed: brew install gitleaks"; exit 1; }
	gitleaks git . --no-banner --redact --config .gitleaks.toml
	gitleaks dir . --no-banner --redact --config .gitleaks.toml

check: test security ## Everything that must be green before the demo
	@echo "make check: all green"
