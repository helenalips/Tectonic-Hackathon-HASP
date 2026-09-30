"""Conflicts: list (scoped by assignment) and resolve (RBAC + audit)."""
from typing import Literal

from fastapi import APIRouter, Depends, Path, Query
from sqlmodel import Session, select

from app.agents import horizontal
from app.db import get_session
from app.models import Conflict, Resolution
from app.schemas import ConflictResolve, ConflictView
from app.security.auth import CurrentUser, get_current_user
from app.views import conflict_view

router = APIRouter(tags=["conflicts"])


@router.get("/conflicts", response_model=list[ConflictView])
def list_conflicts(
    client_id: str | None = Query(default=None, max_length=40, pattern=r"^cl-[a-z0-9-]{1,36}$"),
    status: Literal["pending", "resolved"] | None = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[ConflictView]:
    stmt = select(Conflict)
    if client_id is not None:
        stmt = stmt.where(Conflict.client_id == client_id)
    if not user.is_privileged:
        # Consultants only see conflicts on their assigned clients (both scopes).
        stmt = stmt.where(Conflict.client_id.in_(sorted(user.assigned_client_ids)))  # type: ignore[union-attr]
    if status == "pending":
        stmt = stmt.where(Conflict.resolution == Resolution.pending)
    elif status == "resolved":
        stmt = stmt.where(Conflict.resolution != Resolution.pending)
    rows = session.exec(stmt.order_by(Conflict.created_at.desc(), Conflict.id)).all()  # type: ignore[attr-defined]
    return [conflict_view(session, c) for c in rows]


@router.post("/conflicts/{conflict_id}/resolve", response_model=ConflictView)
def resolve(
    body: ConflictResolve,
    conflict_id: str = Path(max_length=40),
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ConflictView:
    conflict = horizontal.resolve_conflict(session, user, conflict_id, body)
    return conflict_view(session, conflict)
