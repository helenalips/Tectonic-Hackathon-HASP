"""Ask a question about one client and get a backed answer."""
from fastapi import APIRouter, Depends, Request
from sqlmodel import Session

from app.agents.answer import answer_question
from app.config import get_settings
from app.db import get_session
from app.schemas import Answer, AskRequest
from app.security import audit, rbac
from app.security.auth import CurrentUser, get_current_user
from app.security.web import limiter

router = APIRouter(tags=["ask"])


@router.post("/ask", response_model=Answer)
@limiter.limit(lambda: get_settings().rate_ask)
def ask(
    request: Request,
    body: AskRequest,
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    rbac.get_client_or_404(session, body.client_id)
    answer = answer_question(session, user, body)
    # Log that the record was consulted; never the question or answer text.
    audit.record(session, user_id=user.id, action="view", entity="answer", entity_id=body.client_id)
    return answer
