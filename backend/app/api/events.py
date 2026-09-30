"""POST /events: capture a client touchpoint (contracts/openapi.yaml)."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session

from app.agents.capture import capture_event
from app.config import get_settings
from app.db import get_session
from app.schemas import EventCreate, EventResult
from app.security import rbac
from app.security.auth import CurrentUser, get_current_user
from app.security.web import limiter

router = APIRouter(tags=["events"])


@router.post("/events", status_code=status.HTTP_201_CREATED, response_model=EventResult)
@limiter.limit(lambda: get_settings().rate_events)
def create_event(
    request: Request,
    body: EventCreate,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> EventResult:
    rbac.get_client_or_404(session, body.client_id)
    rbac.require_client_write(user, body.client_id)
    try:
        return capture_event(session, user, body)
    except ValueError:
        session.rollback()
        raise HTTPException(status_code=422, detail="Invalid input: text") from None
