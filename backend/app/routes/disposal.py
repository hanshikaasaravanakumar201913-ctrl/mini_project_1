from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.c_engine_bridge import c_engine
from backend.app.database import get_db
from backend.app.education_data import DISPOSAL_GUIDANCE_INFO
from backend.app.models import (
    DisposalRecord,
    ExpiryNotification,
    MedicineEventHistory,
    MedicineRecord,
    User,
    utcnow_naive,
)
from backend.app.schemas import DisposalCreate, DisposalResponse
from backend.app.security import get_current_user, resolve_household_access

router = APIRouter(prefix="/disposal", tags=["Disposal"])


@router.get("/records", response_model=List[DisposalResponse])
def get_disposal_records(
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = resolve_household_access(
        db, user, requested_household_id=household_id, required_permission="can_view_medicines"
    )
    records = (
        db.query(DisposalRecord)
        .join(MedicineRecord)
        .filter(MedicineRecord.household_id == ctx.household.id)
        .order_by(DisposalRecord.created_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "medicine_id": r.medicine_id,
            "member_id": r.member_id,
            "disposed_date": r.disposed_date,
            "disposal_method": r.disposal_method,
            "quantity_disposed": r.quantity_disposed or 0,
            "reason": r.reason or "Expired",
            "notes": r.notes,
            "created_at": r.created_at,
            "medicine_name": r.medicine.medicine_name if r.medicine else "Disposed Medicine",
        }
        for r in records
    ]


@router.post("/dispose", response_model=DisposalResponse, status_code=201)
def mark_medicine_disposed(
    data: DisposalCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    med = db.query(MedicineRecord).filter(MedicineRecord.id == data.medicine_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medicine record not found")

    ctx = resolve_household_access(
        db, user, requested_household_id=med.household_id, required_permission="can_edit_medicines"
    )

    if med.is_disposed:
        raise HTTPException(status_code=400, detail="Medicine is already recorded as disposed")

    prev_qty = med.quantity
    med.is_disposed = True
    med.quantity = 0
    now = utcnow_naive()

    disp = DisposalRecord(
        household_id=ctx.household.id,
        medicine_id=med.id,
        member_id=med.assigned_member_id,
        disposed_date=data.disposed_date,
        disposal_method=data.disposal_method,
        quantity_disposed=prev_qty,
        reason=data.reason or "Expired",
        notes=data.notes,
        created_at=now,
    )
    db.add(disp)

    db.query(ExpiryNotification).filter(ExpiryNotification.medicine_id == med.id).delete()

    ev = MedicineEventHistory(
        household_id=ctx.household.id,
        actor_user_id=user.id,
        medicine_id=med.id,
        action="DISPOSED",
        timestamp=now,
        description=f"Safely disposed ({prev_qty} unit(s), reason: {disp.reason}) via {data.disposal_method}.",
        quantity_delta=-prev_qty,
    )
    db.add(ev)

    db.commit()
    db.refresh(disp)
    db.refresh(ev)

    c_engine.pq_remove_medicine(med.id, "")
    c_engine.ht_delete_medicine(str(med.id))
    c_engine.ll_append_event(
        ev.id,
        str(med.id),
        ev.action,
        ev.timestamp.isoformat(),
        ev.description,
        ev.quantity_delta,
        household_id=ctx.household.id,
    )

    return {
        "id": disp.id,
        "medicine_id": disp.medicine_id,
        "member_id": disp.member_id,
        "disposed_date": disp.disposed_date,
        "disposal_method": disp.disposal_method,
        "quantity_disposed": disp.quantity_disposed,
        "reason": disp.reason,
        "notes": disp.notes,
        "created_at": disp.created_at,
        "medicine_name": med.medicine_name,
    }


@router.get("/guidance")
def get_disposal_guidance():
    return DISPOSAL_GUIDANCE_INFO
