"""Password hashing, JWT session cookie and the authenticated-user dependency.

Token rules: HS256 only (pinned on decode, never read from the token header), issuer and audience
checked, `exp`/`iat`/`sub`/`jti` required, 15-minute lifetime. Logout revokes the token's `jti`
server-side (in-memory: single-process demo), so a copied cookie stops working after logout.
"""
import secrets
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, Response, status
import jwt
from passlib.context import CryptContext
from sqlmodel import Session, select

from app.config import get_settings
from app.db import get_session
from app.models import ClientAssignment, Role, User

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
# Verified against when the email is unknown, so login timing doesn't reveal which accounts exist.
_DUMMY_HASH = _pwd.hash("timing-equaliser-not-a-password")

JWT_ISSUER = "trustgrid-api"
JWT_AUDIENCE = "trustgrid-web"
_REQUIRED_CLAIMS = ["exp", "iat", "sub", "jti", "iss", "aud"]

# jti -> expiry (epoch seconds). Pruned on every write.
_revoked: dict[str, float] = {}
_revoked_lock = threading.Lock()


def hash_password(password: str) -> str:
    return _pwd.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if password_hash is None:
        _pwd.verify(password, _DUMMY_HASH)
        return False
    return _pwd.verify(password, password_hash)


def create_token(user_id: str) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(minutes=s.jwt_expiry_minutes),
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, s.jwt_secret.get_secret_value(), algorithm=s.jwt_algorithm)


def decode_token(token: str) -> dict | None:
    """Verify signature, algorithm, issuer, audience, expiry and revocation. None when anything is off."""
    s = get_settings()
    try:
        payload = jwt.decode(
            token,
            s.jwt_secret.get_secret_value(),
            algorithms=[s.jwt_algorithm],  # pinned: the token header cannot choose the algorithm
            issuer=JWT_ISSUER,
            audience=JWT_AUDIENCE,
            options={"require": _REQUIRED_CLAIMS},
        )
    except jwt.PyJWTError:
        return None
    if not isinstance(payload.get("sub"), str) or _is_revoked(payload.get("jti")):
        return None
    return payload


def _is_revoked(jti: object) -> bool:
    with _revoked_lock:
        return isinstance(jti, str) and jti in _revoked


def revoke_token(token: str | None) -> None:
    """Revoke a session token until it expires. Safe to call with a missing or invalid token."""
    if not token:
        return
    payload = decode_token(token)
    if payload is None:
        return
    now = time.time()
    with _revoked_lock:
        for jti, exp in list(_revoked.items()):
            if exp < now:
                del _revoked[jti]
        _revoked[payload["jti"]] = float(payload["exp"])


def revoke_request_token(request: Request) -> None:
    revoke_token(request.cookies.get(get_settings().cookie_name))


def set_session_cookie(response: Response, token: str) -> None:
    s = get_settings()
    response.set_cookie(
        key=s.cookie_name,
        value=token,
        max_age=s.jwt_expiry_minutes * 60,
        httponly=True,
        secure=s.cookie_secure,
        samesite="strict",
        path="/",
    )


def clear_session_cookie(response: Response, request: Request | None = None) -> None:
    s = get_settings()
    if request is not None:
        revoke_request_token(request)
    response.delete_cookie(s.cookie_name, path="/", httponly=True, samesite="strict", secure=s.cookie_secure)


@dataclass(frozen=True)
class CurrentUser:
    id: str
    person_id: str
    email: str
    role: Role
    assigned_client_ids: frozenset[str]

    @property
    def is_privileged(self) -> bool:
        return self.role in (Role.lead, Role.admin)


_UNAUTHORIZED = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


def get_current_user(request: Request, session: Session = Depends(get_session)) -> CurrentUser:
    token = request.cookies.get(get_settings().cookie_name)
    if not token or len(token) > 4096:
        raise _UNAUTHORIZED
    payload = decode_token(token)
    if payload is None:
        raise _UNAUTHORIZED
    # Role and assignments are re-read on every request, so a revoked assignment applies immediately.
    user = session.get(User, payload["sub"])
    if user is None:
        raise _UNAUTHORIZED
    assigned = session.exec(select(ClientAssignment.client_id).where(ClientAssignment.user_id == user.id)).all()
    return CurrentUser(user.id, user.person_id, user.email, user.role, frozenset(assigned))
