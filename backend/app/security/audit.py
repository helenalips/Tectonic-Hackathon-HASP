"""Append-only audit trail. This module is the only writer of AuditLog; it never updates or deletes.

No API route reads, updates or deletes AuditLog (tests/security enforce this).
"""
from sqlmodel import Session

from app.models import AuditLog
from app.security.logging import mask_pii

# schema.md §2 AuditLog.action
ACTIONS = frozenset(
    {"view", "create", "update", "resolve", "link_duplicate", "login", "login_failed", "create_anyway"}
)


def record(
    session: Session,
    *,
    user_id: str | None,
    action: str,
    entity: str,
    entity_id: str | None = None,
    detail: str | None = None,
    commit: bool = True,
) -> None:
    if action not in ACTIONS:
        raise ValueError(f"Unknown audit action: {action!r}")
    session.add(
        AuditLog(
            user_id=user_id[:40] if user_id else None,
            action=action,
            entity=entity[:40],
            entity_id=entity_id[:40] if entity_id else None,
            detail=mask_pii(detail)[:300] if detail else None,
        )
    )
    if commit:
        session.commit()
