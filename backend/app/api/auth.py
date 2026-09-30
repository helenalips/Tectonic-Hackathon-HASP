from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlmodel import Session, select

from app.config import get_settings
from app.db import get_session
from app.models import ClientAssignment, Person, User
from app.security import audit
from app.security.auth import (
    CurrentUser,
    clear_session_cookie,
    create_token,
    get_current_user,
    set_session_cookie,
    verify_password,
)
from app.security.web import limiter

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=128)


class PersonRef(BaseModel):
    id: str
    name: str
    role: str
    team: str


class Me(BaseModel):
    user_id: str
    person: PersonRef
    role: str
    assigned_client_ids: list[str]


def _me(session: Session, user_id: str, person_id: str, role: str, assigned: list[str]) -> Me:
    p = session.get(Person, person_id)
    return Me(
        user_id=user_id,
        person=PersonRef(id=p.id, name=p.name, role=p.role, team=p.team),
        role=role,
        assigned_client_ids=sorted(assigned),
    )


@router.post("/login", response_model=Me)
@limiter.limit(lambda: get_settings().rate_login)
def login(request: Request, response: Response, body: LoginRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == body.email.lower())).first()
    if not verify_password(body.password, user.password_hash if user else None):
        audit.record(session, user_id=None, action="login_failed", entity="user")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email or password is incorrect")
    set_session_cookie(response, create_token(user.id))
    audit.record(session, user_id=user.id, action="login", entity="user", entity_id=user.id)
    assigned = session.exec(select(ClientAssignment.client_id).where(ClientAssignment.user_id == user.id)).all()
    return _me(session, user.id, user.person_id, user.role.value, list(assigned))


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, user: CurrentUser = Depends(get_current_user)):
    clear_session_cookie(response, request)
    response.status_code = 204
    return response


@router.get("/me", response_model=Me)
def me(user: CurrentUser = Depends(get_current_user), session: Session = Depends(get_session)):
    return _me(session, user.id, user.person_id, user.role.value, list(user.assigned_client_ids))
