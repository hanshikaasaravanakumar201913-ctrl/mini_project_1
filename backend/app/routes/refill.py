from typing import List, Optional
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.c_engine_bridge import c_engine
from backend.app.database import get_db
from backend.app.expiry_engine import evaluate_and_generate_notifications
from backend.app.models import (
    MedicationSchedule,
    MedicineEventHistory,
    MedicineRecord,
    RefillPrediction,
    User,
    utcnow_naive,
)
from backend.app.refill_engine import (
    compute_medicine_refill_prediction,
    recalculate_household_refills,
)
from backend.app.schemas import RefillPredictionResponse
from backend.app.security import get_current_user, resolve_household_access

router = APIRouter(prefix="/refill", tags=["Refill Predictions"])


def _serialize_prediction(pred: RefillPrediction, db: Session) -> dict:
    med = pred.medicine
    sched = (
        db.query(MedicationSchedule).filter(MedicationSchedule.id == pred.schedule_id).first()
        if pred.schedule_id
        else None
    )
    return {
        "id": pred.id,
        "household_id": pred.household_id,
        "medicine_id": pred.medicine_id,
        "medicine_name": med.medicine_name if med else "Unknown Medicine",
        "current_quantity": med.quantity if med else 0,
        "quantity_unit": med.quantity_unit if med else "units",
        "schedule_id": pred.schedule_id,
        "frequency": sched.frequency if sched else None,
        "estimated_daily_consumption": pred.estimated_daily_consumption,
        "remaining_days": pred.remaining_days,
        "estimated_depletion_date": pred.estimated_depletion_date,
        "suggested_refill_date": pred.suggested_refill_date,
        "confidence_level": pred.confidence_level,
        "adherence_ratio": pred.adherence_ratio,
        "calculation_notes": pred.calculation_notes,
        "updated_at": pred.updated_at,
    }


@router.get("/predictions", response_model=List[RefillPredictionResponse])
def get_refill_predictions(
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = resolve_household_access(
        db, user, requested_household_id=household_id, required_permission="can_view_medicines"
    )
    preds = recalculate_household_refills(db, ctx.household.id)
    preds.sort(key=lambda p: (p.remaining_days is None, p.remaining_days if p.remaining_days is not None else 9999))
    return [_serialize_prediction(p, db) for p in preds]


@router.post("/recalculate", response_model=dict)
def recalculate_refills(
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = resolve_household_access(
        db, user, requested_household_id=household_id, required_permission="can_manage_schedules"
    )
    preds = recalculate_household_refills(db, ctx.household.id)
    return {
        "success": True,
        "recalculated_count": len(preds),
        "upcoming_refills": sum(1 for p in preds if p.remaining_days is not None and p.remaining_days <= 7),
    }


@router.patch("/medicines/{medicine_id}/adjust-quantity", response_model=RefillPredictionResponse)
def adjust_medicine_quantity(
    medicine_id: int,
    new_quantity: int = Body(..., embed=True, ge=0),
    notes: Optional[str] = Body("Manual inventory reconciliation", embed=True),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    med = db.query(MedicineRecord).filter(MedicineRecord.id == medicine_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medicine not found.")

    ctx = resolve_household_access(
        db, user, requested_household_id=med.household_id, required_permission="can_edit_medicines"
    )

    delta = new_quantity - med.quantity
    med.quantity = new_quantity
    now = utcnow_naive()
    med.updated_at = now

    ev = MedicineEventHistory(
        household_id=ctx.household.id,
        actor_user_id=user.id,
        medicine_id=med.id,
        action="QUANTITY_ADJUSTED",
        timestamp=now,
        description=f"{notes or 'Inventory quantity corrected'} ({delta:+d}, now {new_quantity}).",
        quantity_delta=delta,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)

    evaluate_and_generate_notifications(db, med)
    pred = compute_medicine_refill_prediction(db, med)

    c_engine.ht_insert_medicine(
        str(med.id),
        {
            "id": str(med.id),
            "name": med.medicine_name,
            "brand": med.brand or "",
            "strength": med.strength or "",
            "dosage_form": med.dosage_form,
            "quantity": med.quantity,
            "expiry_date": med.printed_expiry_date,
            "is_confirmed": 1 if med.is_confirmed else 0,
            "household_id": ctx.household.id,
        },
    )
    c_engine.ll_append_event(
        ev.id,
        str(med.id),
        ev.action,
        ev.timestamp.isoformat(),
        ev.description,
        ev.quantity_delta,
        household_id=ctx.household.id,
    )

    return _serialize_prediction(pred, db)
