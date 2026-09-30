"""Draft a solution for a dossier item, backed by the record expert and the problem expert."""
from fastapi import APIRouter, Depends, Request, status
from sqlmodel import Session

from app.agents.solution import build_solution
from app.config import get_settings
from app.db import get_session
from app.schemas import SolutionRequest, SolutionView
from app.security.auth import CurrentUser, get_current_user
from app.security.web import limiter

router = APIRouter(tags=["solutions"])


@router.post("/solutions", response_model=SolutionView, status_code=status.HTTP_201_CREATED)
@limiter.limit(lambda: get_settings().rate_solutions)
def create_solution(
    request: Request,
    body: SolutionRequest,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # build_solution enforces RBAC (require_client_write on the item's client) and writes the audit row.
    return build_solution(session, user, body)
