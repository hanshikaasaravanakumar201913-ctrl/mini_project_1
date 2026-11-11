from typing import List, Optional
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.expiry_engine import calculate_days_until_expiry
from backend.app.language_registry import sanitize_language_code
from backend.app.models import HouseholdMember, MedicineRecord, User
from backend.app.schemas import HouseholdMemberCreate, HouseholdMemberResponse
from backend.app.security import get_current_user, resolve_household_access

router = APIRouter(prefix="/household", tags=["Household"])


@router.get("/members", response_model=List[HouseholdMemberResponse])
def get_members(
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = resolve_household_access(
        db, user, requested_household_id=household_id, required_permission="can_view_medicines"
    )
    return (
        db.query(HouseholdMember)
        .filter(HouseholdMember.household_id == ctx.household.id)
        .order_by(HouseholdMember.id.asc())
        .all()
    )


@router.post("/members", response_model=HouseholdMemberResponse, status_code=201)
def create_member(
    data: HouseholdMemberCreate,
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_hh = data.household_id or household_id
    ctx = resolve_household_access(
        db, user, requested_household_id=target_hh, required_permission="can_edit_medicines"
    )

    member = HouseholdMember(
        household_id=ctx.household.id,
        name=data.name.strip(),
        relationship_role=data.relationship_role,
        age=data.age,
        allergies=data.allergies,
        notes=data.notes,
        preferred_language=sanitize_language_code(getattr(data, "preferred_language", "en")),
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.patch("/members/{member_id}/language", response_model=HouseholdMemberResponse)
def update_member_language(
    member_id: int,
    preferred_language: str = Body(..., embed=True),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member = db.query(HouseholdMember).filter(HouseholdMember.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Household member not found.")
    resolve_household_access(
        db,
        user,
        requested_household_id=member.household_id,
        required_permission="can_edit_medicines",
    )
    member.preferred_language = sanitize_language_code(preferred_language)
    db.commit()
    db.refresh(member)
    return member


@router.get("/summary", response_model=List[dict])
def get_household_summary(
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = resolve_household_access(
        db, user, requested_household_id=household_id, required_permission="can_view_medicines"
    )
    members = (
        db.query(HouseholdMember).filter(HouseholdMember.household_id == ctx.household.id).all()
    )
    summary = []
    for m in members:
        meds = (
            db.query(MedicineRecord)
            .filter(
                MedicineRecord.household_id == ctx.household.id,
                MedicineRecord.assigned_member_id == m.id,
                MedicineRecord.is_disposed == False,
            )
            .all()
        )
        expiring_soon = 0
        expired = 0
        for med in meds:
            days = calculate_days_until_expiry(med.printed_expiry_date)
            if days < 0:
                expired += 1
            elif days <= 10:
                expiring_soon += 1

        summary.append(
            {
                "member_id": m.id,
                "name": m.name,
                "role": m.relationship_role,
                "age": m.age,
                "allergies": m.allergies,
                "total_medicines": len(meds),
                "expiring_soon": expiring_soon,
                "already_expired": expired,
            }
        )
    return summary
