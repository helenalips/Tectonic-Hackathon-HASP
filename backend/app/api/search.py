"""Vertical search across other clients. Results are data-minimized (schema.md §8)."""
from fastapi import APIRouter, Depends, Query, Request
from sqlmodel import Session

from app.agents import vertical
from app.config import get_settings
from app.db import get_session
from app.models import Category
from app.schemas import Precedent
from app.security.auth import CurrentUser, get_current_user
from app.security.web import limiter

router = APIRouter(tags=["search"])


@router.get("/search/precedents", response_model=list[Precedent])
@limiter.limit("30/minute")
def search_precedents(
    request: Request,
    q: str = Query(min_length=3, max_length=500),
    exclude_client_id: str | None = Query(default=None, max_length=40, pattern=r"^cl-[a-z0-9-]{1,36}$"),
    category: Category | None = Query(default=None),
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[Precedent]:
    # With no client to exclude, search every client ("" never matches a real id).
    return vertical.find_precedents(
        session, user, exclude_client_id or "", q, category, k=get_settings().precedent_top_k
    )
