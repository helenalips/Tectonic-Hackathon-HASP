"""Server-side authorization. Every route that touches a client goes through these helpers.

Policy (contracts/schema.md):
- Everyone authenticated may READ a client record (knowledge sharing is the point of TrustGrid);
  cross-client search results are data-minimized separately.
- Consultants may WRITE (events, conflict resolution, solutions) only on assigned clients.
- Leads and admins may write anywhere and resolve any conflict.
"""
from fastapi import HTTPException, status
from sqlmodel import Session

from app.models import Client
from app.security.auth import CurrentUser

_FORBIDDEN = HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not assigned to this client")
_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def get_client_or_404(session: Session, client_id: str) -> Client:
    client = session.get(Client, client_id)
    if client is None:
        raise _NOT_FOUND
    return client


def can_write_client(user: CurrentUser, client_id: str | None) -> bool:
    if user.is_privileged:
        return True
    return client_id is not None and client_id in user.assigned_client_ids


def require_client_write(user: CurrentUser, client_id: str | None) -> None:
    if not can_write_client(user, client_id):
        raise _FORBIDDEN


def can_see_client_name(user: CurrentUser, client_id: str) -> bool:
    """Used by the vertical check to decide between client name and anonymized label."""
    return can_write_client(user, client_id)


def client_label(user: CurrentUser, client: Client) -> str:
    """Cross-client display label (schema.md §8): the name only for assigned users and leads/admins,
    otherwise sector + country, e.g. "Manufacturing client · PL"."""
    if can_see_client_name(user, client.id):
        return client.name
    return f"{client.sector} client · {client.country}"
