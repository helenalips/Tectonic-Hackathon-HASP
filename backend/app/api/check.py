"""POST /check: live draft check (v2). Read-only: nothing is stored except one audit "view" row."""
from fastapi import APIRouter, Depends, Request
from sqlmodel import Session

from app.agents.check import check_draft
from app.config import get_settings
from app.db import get_session
from app.schemas import CheckRequest, CheckResult
from app.security import audit, rbac
from app.security.auth import CurrentUser, get_current_user
from app.security.web import limiter

router = APIRouter(tags=["check"])


@router.post("/check", response_model=CheckResult)
@limiter.limit(lambda: get_settings().rate_check)
def check(
    request: Request,
    body: CheckRequest,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> CheckResult:
    # Reading is open to every authenticated user; cross-client parts are data-minimized in the agent.
    rbac.get_client_or_404(session, body.client_id)
    result = check_draft(session, user, body)
    # Never the draft text: only that this client's record was consulted.
    audit.record(session, user_id=user.id, action="view", entity="check", entity_id=body.client_id)
    return result
