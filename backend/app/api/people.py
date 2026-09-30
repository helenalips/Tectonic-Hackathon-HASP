"""Person profile: domains, reliability and where they have worked."""
from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlmodel import Session, select

from app.agents import experts as ex
from app.agents import trust
from app.api.clients import person_contribution
from app.db import get_session
from app.models import Contribution, Person
from app.schemas import PersonProfile
from app.security.auth import CurrentUser, get_current_user

router = APIRouter(prefix="/people", tags=["people"])


@router.get("/{person_id}", response_model=PersonProfile)
def get_person(
    person_id: str = Path(max_length=40, pattern=r"^p-[a-z0-9-]{1,38}$"),
    user: CurrentUser = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    person = session.get(Person, person_id)
    if person is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    contributions = session.exec(
        select(Contribution).where(Contribution.person_id == person.id).order_by(Contribution.last_date.desc())
    ).all()
    return PersonProfile(
        person=ex.person_ref(session, person.id),
        domains=list(person.domains or []),
        countries=list(person.countries or []),
        reliability=trust.person_reliability(session, person.id),
        contributions=[person_contribution(session, c) for c in contributions],
    )
