from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.expiry_engine import (
    evaluate_and_generate_notifications,
    evaluate_prescription_validity_notifications,
)
from backend.app.models import ExpiryNotification, MedicineRecord, Prescription, User
from backend.app.refill_engine import recalculate_household_refills
from backend.app.schemas import NotificationResponse
from backend.app.security import get_current_user, resolve_household_access

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=List[NotificationResponse])
def get_notifications(
    unread_only: bool = False,
    notification_type: Optional[str] = Query(None),
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Support Pharmacy/Admin users seeing their user-targeted notifications, or household users seeing household alerts
    if user.role in ("PHARMACY_STAFF", "PLATFORM_ADMIN") and household_id is None:
        query = db.query(ExpiryNotification).filter(ExpiryNotification.user_id == user.id)
    else:
        ctx = resolve_household_access(
            db, user, requested_household_id=household_id, required_permission="can_view_notifications"
        )
        query = db.query(ExpiryNotification).filter(
            or_(
                ExpiryNotification.household_id == ctx.household.id,
                ExpiryNotification.user_id == user.id,
            )
        )

    if unread_only:
        query = query.filter(ExpiryNotification.is_read == False)
    if notification_type:
        query = query.filter(ExpiryNotification.notification_type == notification_type.upper())

    notifications = query.order_by(ExpiryNotification.triggered_at.desc()).all()
    return [
        {
            "id": n.id,
            "household_id": n.household_id,
            "medicine_id": n.medicine_id,
            "notification_type": n.notification_type or "EXPIRY",
            "reference_id": n.reference_id,
            "severity": n.severity or "WARNING",
            "threshold_days": n.threshold_days,
            "message": n.message,
            "is_read": n.is_read,
            "triggered_at": n.triggered_at,
            "medicine_name": n.medicine.medicine_name if n.medicine else None,
        }
        for n in notifications
    ]


@router.patch("/{notification_id}/read", response_model=dict)
def mark_notification_read(
    notification_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notif = db.query(ExpiryNotification).filter(ExpiryNotification.id == notification_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    if notif.user_id != user.id:
        resolve_household_access(
            db, user, requested_household_id=notif.household_id, required_permission="can_view_notifications"
        )

    notif.is_read = True
    db.commit()
    return {"success": True, "id": notification_id}


@router.post("/mark-all-read", response_model=dict)
def mark_all_read(
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role in ("PHARMACY_STAFF", "PLATFORM_ADMIN") and household_id is None:
        count = (
            db.query(ExpiryNotification)
            .filter(ExpiryNotification.user_id == user.id, ExpiryNotification.is_read == False)
            .update({"is_read": True})
        )
    else:
        ctx = resolve_household_access(
            db, user, requested_household_id=household_id, required_permission="can_view_notifications"
        )
        count = (
            db.query(ExpiryNotification)
            .filter(
                or_(
                    ExpiryNotification.household_id == ctx.household.id,
                    ExpiryNotification.user_id == user.id,
                ),
                ExpiryNotification.is_read == False,
            )
            .update({"is_read": True}, synchronize_session=False)
        )
    db.commit()
    return {"success": True, "updated_count": count}


@router.post("/evaluate-all", response_model=dict)
def evaluate_all_expiries(
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = resolve_household_access(
        db, user, requested_household_id=household_id, required_permission="can_view_notifications"
    )
    medicines = (
        db.query(MedicineRecord)
        .filter(MedicineRecord.household_id == ctx.household.id, MedicineRecord.is_disposed == False)
        .all()
    )
    total_new = 0
    for med in medicines:
        total_new += len(evaluate_and_generate_notifications(db, med))

    prescriptions = (
        db.query(Prescription).filter(Prescription.household_id == ctx.household.id).all()
    )
    for presc in prescriptions:
        total_new += len(evaluate_prescription_validity_notifications(db, presc))

    recalculate_household_refills(db, ctx.household.id)
    return {"evaluated_count": len(medicines), "new_notifications_generated": total_new}
