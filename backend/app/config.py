"""Central configuration. Secrets come only from the environment / .env (never committed)."""
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    # Auth
    jwt_secret: SecretStr = Field(..., min_length=32)
    jwt_algorithm: Literal["HS256"] = "HS256"
    jwt_expiry_minutes: int = 15
    cookie_name: str = "tg_session"
    cookie_secure: bool = False  # True when served over HTTPS
    demo_password: SecretStr = Field(..., min_length=12)

    # LLM
    llm_mode: Literal["mock", "claude"] = "mock"
    anthropic_api_key: SecretStr | None = None
    anthropic_model: str = "claude-sonnet-5-5"
    llm_timeout_seconds: float = 30.0

    # Data
    database_url: str = f"sqlite:///{REPO_ROOT / 'backend' / 'trustgrid.db'}"
    mock_data_path: Path = REPO_ROOT / "mock-cases.md"
    seed_dir: Path = REPO_ROOT / "data" / "seed"
    embedding_model: str = "all-MiniLM-L6-v2"
    embeddings_backend: Literal["minilm", "hash"] = "minilm"  # "hash" for tests: deterministic, no download

    # Web
    cors_origins: list[str] = ["http://localhost:5173"]

    # Rate limits (slowapi syntax)
    rate_login: str = "5/minute"
    rate_ask: str = "20/minute"
    rate_solutions: str = "10/minute"
    rate_events: str = "30/minute"

    # Dedup thresholds (contracts/schema.md §5)
    dedup_document_similarity: float = 0.95
    dedup_dossier_similarity: float = 0.85
    precedent_top_k: int = 5

    # External fetch (official SD Worx domains only)
    fetch_allowed_domains: tuple[str, ...] = ("sdworx.com",)
    fetch_timeout_seconds: float = 10.0
    fetch_max_bytes: int = 2_000_000


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
