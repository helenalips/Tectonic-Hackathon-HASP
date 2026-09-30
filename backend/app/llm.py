"""Thin, fail-safe wrapper around the Claude API.

Rules (contracts/interfaces.md):
- No tools. One request, JSON out, validated with the caller's pydantic schema.
- The system prompt always starts with sanitize.LLM_SYSTEM_GUARD.
- Returns None on ANY failure so callers fall back to their deterministic mock path.
- Never logs prompts, document content or keys (only the exception type).
"""
from __future__ import annotations

import logging
import re
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.config import get_settings
from app.security.sanitize import LLM_SYSTEM_GUARD

log = logging.getLogger("trustgrid.llm")

T = TypeVar("T", bound=BaseModel)

_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.DOTALL | re.IGNORECASE)
_MAX_TOKENS = 4000


def llm_enabled() -> bool:
    s = get_settings()
    key = s.anthropic_api_key.get_secret_value() if s.anthropic_api_key else ""
    return s.llm_mode == "claude" and bool(key.strip())


def _client():
    import anthropic  # imported lazily: mock mode never needs the SDK

    s = get_settings()
    return anthropic.Anthropic(
        api_key=s.anthropic_api_key.get_secret_value() if s.anthropic_api_key else None,
        timeout=s.llm_timeout_seconds,
        max_retries=1,
    )


def _strip_fences(text: str) -> str:
    m = _FENCE_RE.match(text)
    return m.group(1) if m else text.strip()


def _guarded_system(system: str) -> str:
    if system.startswith(LLM_SYSTEM_GUARD):
        return system
    return f"{LLM_SYSTEM_GUARD}\n\n{system}"


def complete_json(system: str, user_content: str, schema: type[T]) -> T | None:
    """Ask Claude for JSON matching `schema`. Returns None on any error or invalid output.

    `user_content` must already contain untrusted documents wrapped with sanitize.wrap_untrusted().
    """
    if not llm_enabled():
        return None
    try:
        response = _client().messages.create(
            model=get_settings().anthropic_model,
            max_tokens=_MAX_TOKENS,
            system=_guarded_system(system),
            messages=[{"role": "user", "content": user_content}],
        )
        if getattr(response, "stop_reason", None) == "refusal":
            return None
        text = "".join(
            getattr(block, "text", "") for block in response.content if getattr(block, "type", "") == "text"
        )
        if not text.strip():
            return None
        return schema.model_validate_json(_strip_fences(text))
    except ValidationError:
        log.warning("LLM output failed schema validation (%s)", schema.__name__)
        return None
    except Exception as exc:  # noqa: BLE001 - any failure falls back to the mock path
        log.warning("LLM call failed: %s", type(exc).__name__)
        return None
