import secrets
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import (
    CaregiverInvitation,
    CaregiverPermission,
    Household,
    User,
    utcnow_naive,
)
from backend.app.notification_service import emit_notification
from backend.app.schemas import (
    CaregiverAccessResponse,
    CaregiverInviteCreate,
    CaregiverInviteResponse,
    CaregiverPermissionFlags,
)
from backend.app.security import get_current_user, resolve_household_access

router = APIRouter(prefix="/caregivers", tags=["Caregiver Access"])


@router.get("/household", response_model=dict)
def list_household_caregivers(
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = resolve_household_access(
        db, user, requested_household_id=household_id, require_owner=True
    )

    perms = (
        db.query(CaregiverPermission)
        .filter(
            CaregiverPermission.household_id == ctx.household.id,
            CaregiverPermission.is_active == True,
        )
        .all()
    )
    active_caregivers = []
    for p in perms:
        cg_user = db.query(User).filter(User.id == p.caregiver_user_id).first()
        active_caregivers.append(
            {
                "id": p.id,
                "household_id": p.household_id,
                "caregiver_user_id": p.caregiver_user_id,
                "caregiver_name": cg_user.full_name if cg_user else "Caregiver",
                "caregiver_email": cg_user.email if cg_user else None,
                "can_view_medicines": p.can_view_medicines,
                "can_edit_medicines": p.can_edit_medicines,
                "can_view_prescriptions": p.can_view_prescriptions,
                "can_manage_schedules": p.can_manage_schedules,
                "can_record_doses": p.can_record_doses,
                "can_view_notifications": p.can_view_notifications,
                "can_manage_refills": p.can_manage_refills,
                "is_active": p.is_active,
                "created_at": p.created_at,
            }
        )

    invites = (
        db.query(CaregiverInvitation)
        .filter(CaregiverInvitation.household_id == ctx.household.id)
        .order_by(CaregiverInvitation.created_at.desc())
        .all()
    )

    return {
        "household_id": ctx.household.id,
        "household_name": ctx.household.name,
        "active_caregivers": active_caregivers,
        "invitations": [CaregiverInviteResponse.model_validate(i).model_dump() for i in invites],
    }


@router.post("/invite", response_model=CaregiverInviteResponse, status_code=201)
def invite_caregiver(
    data: CaregiverInviteCreate,
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = resolve_household_access(
        db, user, requested_household_id=household_id, require_owner=True
    )

    target_email = data.caregiver_email.strip().lower()
    if target_email == user.email.lower():
        raise HTTPException(status_code=400, detail="You are already the owner of this household.")

    target_user = db.query(User).filter(User.email == target_email).first()

    inv = CaregiverInvitation(
        household_id=ctx.household.id,
        invited_by_user_id=user.id,
        caregiver_email=target_email,
        caregiver_user_id=target_user.id if target_user else None,
        invite_token=secrets.token_urlsafe(16),
        status="PENDING",
        can_view_medicines=data.can_view_medicines,
        can_edit_medicines=data.can_edit_medicines,
        can_view_prescriptions=data.can_view_prescriptions,
        can_manage_schedules=data.can_manage_schedules,
        can_record_doses=data.can_record_doses,
        can_view_notifications=data.can_view_notifications,
        can_manage_refills=data.can_manage_refills,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)

    if target_user:
        emit_notification(
            db,
            household_id=ctx.household.id,
            user_id=target_user.id,
            notification_type="CAREGIVER",
            reference_id=inv.id,
            severity="INFO",
            message=f"You have been invited as a caregiver for '{ctx.household.name}' by {user.full_name}.",
        )

    return inv


@router.get("/invitations/mine", response_model=List[dict])
def list_my_invitations(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    invites = (
        db.query(CaregiverInvitation)
        .filter(CaregiverInvitation.caregiver_email == user.email.lower())
        .order_by(CaregiverInvitation.created_at.desc())
        .all()
    )
    results = []
    for inv in invites:
        hh = db.query(Household).filter(Household.id == inv.household_id).first()
        item = CaregiverInviteResponse.model_validate(inv).model_dump()
        item["household_name"] = hh.name if hh else f"Household #{inv.household_id}"
        results.append(item)
    return results


@router.post("/invitations/{invitation_id}/accept", response_model=CaregiverAccessResponse)
def accept_caregiver_invitation(
    invitation_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    inv = db.query(CaregiverInvitation).filter(CaregiverInvitation.id == invitation_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Caregiver invitation not found.")
    if inv.caregiver_email.lower() != user.email.lower():
        raise HTTPException(status_code=403, detail="This invitation is addressed to another account.")
    if inv.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Invitation is already {inv.status}.")

    now = utcnow_naive()
    inv.status = "ACCEPTED"
    inv.caregiver_user_id = user.id
    inv.responded_at = now

    perm = (
        db.query(CaregiverPermission)
        .filter(
            CaregiverPermission.household_id == inv.household_id,
            CaregiverPermission.caregiver_user_id == user.id,
        )
        .first()
    )
    if not perm:
        perm = CaregiverPermission(
            household_id=inv.household_id,
            caregiver_user_id=user.id,
        )
        db.add(perm)

    perm.can_view_medicines = inv.can_view_medicines
    perm.can_edit_medicines = inv.can_edit_medicines
    perm.can_view_prescriptions = inv.can_view_prescriptions
    perm.can_manage_schedules = inv.can_manage_schedules
    perm.can_record_doses = inv.can_record_doses
    perm.can_view_notifications = inv.can_view_notifications
    perm.can_manage_refills = inv.can_manage_refills
    perm.is_active = True
    perm.updated_at = now

    db.commit()
    db.refresh(perm)

    emit_notification(
        db,
        household_id=inv.household_id,
        notification_type="CAREGIVER",
        reference_id=perm.id,
        severity="INFO",
        message=f"Caregiver {user.full_name} accepted access invitation.",
    )

    return {
        "id": perm.id,
        "household_id": perm.household_id,
        "caregiver_user_id": perm.caregiver_user_id,
        "caregiver_name": user.full_name,
        "caregiver_email": user.email,
        "can_view_medicines": perm.can_view_medicines,
        "can_edit_medicines": perm.can_edit_medicines,
        "can_view_prescriptions": perm.can_view_prescriptions,
        "can_manage_schedules": perm.can_manage_schedules,
        "can_record_doses": perm.can_record_doses,
        "can_view_notifications": perm.can_view_notifications,
        "can_manage_refills": perm.can_manage_refills,
        "is_active": perm.is_active,
        "created_at": perm.created_at,
    }


@router.post("/invitations/{invitation_id}/decline")
def decline_caregiver_invitation(
    invitation_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    inv = db.query(CaregiverInvitation).filter(CaregiverInvitation.id == invitation_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Caregiver invitation not found.")
    if inv.caregiver_email.lower() != user.email.lower():
        raise HTTPException(status_code=403, detail="Not authorized to decline this invitation.")
    if inv.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Invitation is already {inv.status}.")

    inv.status = "DECLINED"
    inv.responded_at = utcnow_naive()
    db.commit()
    return {"success": True, "status": "DECLINED"}


@router.put("/{permission_id}/permissions", response_model=CaregiverAccessResponse)
def update_caregiver_permissions(
    permission_id: int,
    flags: CaregiverPermissionFlags,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    perm = db.query(CaregiverPermission).filter(CaregiverPermission.id == permission_id).first()
    if not perm:
        raise HTTPException(status_code=404, detail="Caregiver permission record not found.")

    resolve_household_access(db, user, requested_household_id=perm.household_id, require_owner=True)

    perm.can_view_medicines = flags.can_view_medicines
    perm.can_edit_medicines = flags.can_edit_medicines
    perm.can_view_prescriptions = flags.can_view_prescriptions
    perm.can_manage_schedules = flags.can_manage_schedules
    perm.can_record_doses = flags.can_record_doses
    perm.can_view_notifications = flags.can_view_notifications
    perm.can_manage_refills = flags.can_manage_refills
    perm.updated_at = utcnow_naive()
    db.commit()
    db.refresh(perm)

    cg_user = db.query(User).filter(User.id == perm.caregiver_user_id).first()
    return {
        "id": perm.id,
        "household_id": perm.household_id,
        "caregiver_user_id": perm.caregiver_user_id,
        "caregiver_name": cg_user.full_name if cg_user else "Caregiver",
        "caregiver_email": cg_user.email if cg_user else None,
        "can_view_medicines": perm.can_view_medicines,
        "can_edit_medicines": perm.can_edit_medicines,
        "can_view_prescriptions": perm.can_view_prescriptions,
        "can_manage_schedules": perm.can_manage_schedules,
        "can_record_doses": perm.can_record_doses,
        "can_view_notifications": perm.can_view_notifications,
        "can_manage_refills": perm.can_manage_refills,
        "is_active": perm.is_active,
        "created_at": perm.created_at,
    }


@router.delete("/{permission_id}")
def revoke_caregiver_access(
    permission_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    perm = db.query(CaregiverPermission).filter(CaregiverPermission.id == permission_id).first()
    if not perm:
        raise HTTPException(status_code=404, detail="Caregiver access record not found.")

    resolve_household_access(db, user, requested_household_id=perm.household_id, require_owner=True)

    now = utcnow_naive()
    perm.is_active = False
    perm.updated_at = now

    cg_user = db.query(User).filter(User.id == perm.caregiver_user_id).first()
    if cg_user:
        db.query(CaregiverInvitation).filter(
            CaregiverInvitation.household_id == perm.household_id,
            CaregiverInvitation.caregiver_email == cg_user.email,
            CaregiverInvitation.status == "ACCEPTED",
        ).update({"status": "REVOKED", "responded_at": now})

    db.commit()

    emit_notification(
        db,
        household_id=perm.household_id,
        notification_type="CAREGIVER",
        reference_id=perm.id,
        severity="WARNING",
        message=f"Caregiver access revoked immediately for {cg_user.full_name if cg_user else 'user'}.",
    )
    return {"success": True, "revoked": True}
