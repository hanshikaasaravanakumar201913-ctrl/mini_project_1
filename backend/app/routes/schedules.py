from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.c_engine_bridge import c_engine
from backend.app.database import get_db
from backend.app.expiry_engine import evaluate_and_generate_notifications
from backend.app.models import (
    HouseholdMember,
    MedicationSchedule,
    MedicineEventHistory,
    MedicineRecord,
    ScheduleLog,
    User,
    utcnow_naive,
)
from backend.app.refill_engine import compute_medicine_refill_prediction
from backend.app.schemas import ScheduleCreate, ScheduleLogCreate, ScheduleResponse
from backend.app.security import get_current_user, resolve_household_access
import datetime

router = APIRouter(prefix="/schedules", tags=["Schedules"])


def estimate_daily_rate(frequency: str, dose_quantity: int) -> Optional[float]:
    if dose_quantity <= 0:
        return None
    freq_lower = (frequency or "").lower()
    if "as needed" in freq_lower or "prn" in freq_lower:
        return None
    if "twice" in freq_lower or "bid" in freq_lower:
        return float(dose_quantity * 2)
    if "thrice" in freq_lower or "tid" in freq_lower or "three" in freq_lower:
        return float(dose_quantity * 3)
    if "weekly" in freq_lower:
        return float(dose_quantity) / 7.0
    return float(dose_quantity)


def enrich_schedule(s: MedicationSchedule) -> dict:
    estimated_depletion = None
    if s.medicine and s.medicine.refill_prediction and s.medicine.refill_prediction.estimated_depletion_date:
        estimated_depletion = s.medicine.refill_prediction.estimated_depletion_date
    elif s.medicine and s.dose_quantity > 0 and s.medicine.quantity > 0:
        daily_rate = estimate_daily_rate(s.frequency, s.dose_quantity)
        if daily_rate and daily_rate > 0:
            days_left = int(s.medicine.quantity // daily_rate)
            est_date = datetime.date.today() + datetime.timedelta(days=days_left)
            estimated_depletion = est_date.isoformat()

    return {
        "id": s.id,
        "medicine_id": s.medicine_id,
        "member_id": s.member_id,
        "reminder_time": s.reminder_time,
        "frequency": s.frequency,
        "days_of_week": s.days_of_week,
        "dose_quantity": s.dose_quantity,
        "status": s.status,
        "created_at": s.created_at,
        "medicine_name": s.medicine.medicine_name if s.medicine else "Unknown",
        "estimated_depletion_date": estimated_depletion,
    }


@router.get("", response_model=List[ScheduleResponse])
def get_schedules(
    member_id: Optional[int] = None,
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = resolve_household_access(
        db, user, requested_household_id=household_id, required_permission="can_view_medicines"
    )
    query = (
        db.query(MedicationSchedule)
        .join(MedicineRecord)
        .filter(MedicineRecord.household_id == ctx.household.id)
    )
    if member_id:
        query = query.filter(MedicationSchedule.member_id == member_id)
    items = query.all()
    return [enrich_schedule(s) for s in items]


@router.post("", response_model=ScheduleResponse, status_code=201)
def create_schedule(
    data: ScheduleCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    med = db.query(MedicineRecord).filter(MedicineRecord.id == data.medicine_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medicine not found")

    ctx = resolve_household_access(
        db, user, requested_household_id=med.household_id, required_permission="can_manage_schedules"
    )

    if data.member_id is not None:
        mem = (
            db.query(HouseholdMember)
            .filter(HouseholdMember.id == data.member_id, HouseholdMember.household_id == ctx.household.id)
            .first()
        )
        if not mem:
            raise HTTPException(status_code=404, detail="Member not found in household.")

    sched = MedicationSchedule(**data.model_dump())
    db.add(sched)
    db.commit()
    db.refresh(sched)

    compute_medicine_refill_prediction(db, med)
    db.refresh(sched)
    return enrich_schedule(sched)


@router.post("/{schedule_id}/log", response_model=dict)
def log_schedule_dose(
    schedule_id: int,
    log_data: ScheduleLogCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sched = db.query(MedicationSchedule).filter(MedicationSchedule.id == schedule_id).first()
    if not sched or not sched.medicine:
        raise HTTPException(status_code=404, detail="Schedule not found")

    ctx = resolve_household_access(
        db,
        user,
        requested_household_id=sched.medicine.household_id,
        required_permission="can_record_doses",
    )

    now = utcnow_naive()
    status_upper = log_data.status.strip().upper()
    if status_upper not in ("TAKEN", "SKIPPED", "SNOOZED"):
        raise HTTPException(status_code=400, detail="Dose log status must be TAKEN, SKIPPED, or SNOOZED.")

    # Duplicate guard within 60 seconds for TAKEN
    if status_upper == "TAKEN":
        one_min_ago = now - datetime.timedelta(seconds=60)
        recent_log = (
            db.query(ScheduleLog)
            .filter(
                ScheduleLog.schedule_id == schedule_id,
                ScheduleLog.status == "TAKEN",
                ScheduleLog.logged_at >= one_min_ago,
            )
            .first()
        )
        if recent_log:
            return {
                "success": True,
                "status": status_upper,
                "medicine_id": sched.medicine_id,
                "current_stock": sched.medicine.quantity,
                "duplicate_prevented": True,
                "message": "Dose was already recorded recently; duplicate decrement prevented.",
            }

    log = ScheduleLog(
        schedule_id=schedule_id,
        logged_at=now,
        status=status_upper,
        notes=log_data.notes,
    )
    db.add(log)

    delta = 0
    ev = None
    if status_upper == "TAKEN":
        prev_qty = sched.medicine.quantity
        if prev_qty >= sched.dose_quantity:
            sched.medicine.quantity = prev_qty - sched.dose_quantity
            delta = -sched.dose_quantity
        else:
            delta = -prev_qty
            sched.medicine.quantity = 0

        ev = MedicineEventHistory(
            household_id=ctx.household.id,
            actor_user_id=user.id,
            medicine_id=sched.medicine.id,
            action="DOSE_TAKEN",
            timestamp=now,
            description=f"Dose logged as TAKEN by {user.full_name}. Stock decremented by {abs(delta)} unit(s).",
            quantity_delta=delta,
        )
        db.add(ev)
    elif status_upper == "SKIPPED":
        ev = MedicineEventHistory(
            household_id=ctx.household.id,
            actor_user_id=user.id,
            medicine_id=sched.medicine.id,
            action="DOSE_SKIPPED",
            timestamp=now,
            description=f"Scheduled dose marked as SKIPPED by {user.full_name}.",
            quantity_delta=0,
        )
        db.add(ev)

    db.commit()

    evaluate_and_generate_notifications(db, sched.medicine)
    compute_medicine_refill_prediction(db, sched.medicine)

    c_engine.ht_insert_medicine(
        str(sched.medicine.id),
        {
            "id": str(sched.medicine.id),
            "name": sched.medicine.medicine_name,
            "brand": sched.medicine.brand or "",
            "strength": sched.medicine.strength or "",
            "dosage_form": sched.medicine.dosage_form,
            "quantity": sched.medicine.quantity,
            "expiry_date": sched.medicine.printed_expiry_date,
            "is_confirmed": 1 if sched.medicine.is_confirmed else 0,
            "household_id": ctx.household.id,
        },
    )
    if ev:
        db.refresh(ev)
        c_engine.ll_append_event(
            ev.id,
            str(sched.medicine.id),
            ev.action,
            ev.timestamp.isoformat(),
            ev.description,
            ev.quantity_delta,
            household_id=ctx.household.id,
        )

    return {
        "success": True,
        "status": status_upper,
        "medicine_id": sched.medicine_id,
        "quantity_delta": delta,
        "current_stock": sched.medicine.quantity,
    }
