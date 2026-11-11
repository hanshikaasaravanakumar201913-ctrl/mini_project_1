import datetime
import math
from typing import List, Optional
from sqlalchemy.orm import Session

from backend.app.c_engine_bridge import c_engine
from backend.app.models import (
    ExpiryNotification,
    MedicationSchedule,
    MedicineRecord,
    RefillPrediction,
    ScheduleLog,
    utcnow_naive,
)
from backend.app.notification_service import emit_notification


def _scheduled_daily_rate(frequency: str, dose_quantity: int) -> Optional[float]:
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


def compute_medicine_refill_prediction(
    db: Session,
    medicine: MedicineRecord,
    reference_date: Optional[datetime.date] = None,
    sync_c_engine: bool = True,
) -> RefillPrediction:
    """
    Calculates refill depletion and confidence using:
      - Current quantity
      - Active schedule dose quantity & frequency (Daily, Twice Daily, Thrice Daily, Weekly, As Needed)
      - Historical ScheduleLog adherence (TAKEN vs SKIPPED) over the past 30 days
    Never invents a fixed daily rate for As-Needed (PRN) medications.
    """
    today = reference_date or datetime.date.today()
    hh_id = medicine.household_id or 1

    active_schedules = (
        db.query(MedicationSchedule)
        .filter(
            MedicationSchedule.medicine_id == medicine.id,
            MedicationSchedule.status == "ACTIVE",
        )
        .all()
    )

    primary_sched = active_schedules[0] if active_schedules else None
    prediction = (
        db.query(RefillPrediction).filter(RefillPrediction.medicine_id == medicine.id).first()
    )
    if not prediction:
        prediction = RefillPrediction(household_id=hh_id, medicine_id=medicine.id)
        db.add(prediction)

    if medicine.is_disposed:
        prediction.schedule_id = None
        prediction.estimated_daily_consumption = 0.0
        prediction.remaining_days = None
        prediction.estimated_depletion_date = None
        prediction.suggested_refill_date = None
        prediction.confidence_level = "LOW"
        prediction.adherence_ratio = None
        prediction.calculation_notes = "Medicine has been disposed."
        db.commit()
        if sync_c_engine:
            c_engine.pq_remove_medicine(medicine.id, "REFILL")
        return prediction

    if not active_schedules:
        prediction.schedule_id = None
        prediction.estimated_daily_consumption = 0.0
        prediction.remaining_days = None
        prediction.estimated_depletion_date = None
        prediction.suggested_refill_date = None
        prediction.confidence_level = "LOW"
        prediction.adherence_ratio = None
        prediction.calculation_notes = (
            "No active regular schedule configured. Refill depletion cannot be forecast automatically."
        )
        db.commit()
        if sync_c_engine:
            c_engine.pq_remove_medicine(medicine.id, "REFILL")
        return prediction

    # Check if all active schedules are As Needed (PRN)
    regular_rates = []
    for s in active_schedules:
        rate = _scheduled_daily_rate(s.frequency, s.dose_quantity)
        if rate is not None:
            regular_rates.append((s, rate))

    if not regular_rates:
        prediction.schedule_id = primary_sched.id if primary_sched else None
        prediction.estimated_daily_consumption = 0.0
        prediction.remaining_days = None
        prediction.estimated_depletion_date = None
        prediction.suggested_refill_date = None
        prediction.confidence_level = "AS_NEEDED_ESTIMATE"
        prediction.adherence_ratio = None
        prediction.calculation_notes = (
            "As-needed (PRN) medication: variable consumption. "
            "No fixed daily depletion assumed; monitor stock threshold manually."
        )
        db.commit()
        if sync_c_engine:
            c_engine.pq_remove_medicine(medicine.id, "REFILL")
        return prediction

    # Sum scheduled daily consumption across active regular schedules
    base_daily_rate = sum(r for _, r in regular_rates)
    sched_ids = [s.id for s, _ in regular_rates]
    cutoff = utcnow_naive() - datetime.timedelta(days=30)
    logs = (
        db.query(ScheduleLog)
        .filter(
            ScheduleLog.schedule_id.in_(sched_ids),
            ScheduleLog.logged_at >= cutoff,
            ScheduleLog.status.in_(["TAKEN", "SKIPPED"]),
        )
        .all()
    )

    taken_count = sum(1 for lg in logs if lg.status == "TAKEN")
    skipped_count = sum(1 for lg in logs if lg.status == "SKIPPED")
    total_logs = taken_count + skipped_count

    adherence_ratio: Optional[float] = None
    effective_rate = base_daily_rate
    confidence = "LOW"
    notes_parts = [f"Base scheduled consumption: {base_daily_rate:.2f} unit(s)/day."]

    if total_logs >= 7:
        adherence_ratio = round(taken_count / total_logs, 2)
        # Bound adherence adjustment safely so incomplete logging never produces zero or extreme rates
        bounded_factor = max(0.5, min(1.0, adherence_ratio))
        effective_rate = round(base_daily_rate * bounded_factor, 2)
        confidence = "HIGH"
        notes_parts.append(
            f"Adjusted using {total_logs} logged doses (30d adherence {int(adherence_ratio * 100)}%)."
        )
    elif total_logs >= 1:
        adherence_ratio = round(taken_count / total_logs, 2)
        confidence = "MEDIUM"
        notes_parts.append(
            f"Preliminary log history ({total_logs} dose records); using scheduled rate estimate."
        )
    else:
        confidence = "LOW"
        notes_parts.append("Estimated solely from schedule frequency (no dose logs recorded yet).")

    if effective_rate <= 0:
        effective_rate = base_daily_rate

    remaining_days = max(0, int(math.floor(medicine.quantity / effective_rate))) if medicine.quantity > 0 else 0
    depletion_date = (today + datetime.timedelta(days=remaining_days)).isoformat()
    refill_lead_days = 5 if remaining_days > 5 else 0
    refill_date = (today + datetime.timedelta(days=max(0, remaining_days - refill_lead_days))).isoformat()

    prediction.schedule_id = primary_sched.id
    prediction.estimated_daily_consumption = round(effective_rate, 2)
    prediction.remaining_days = remaining_days
    prediction.estimated_depletion_date = depletion_date
    prediction.suggested_refill_date = refill_date
    prediction.confidence_level = confidence
    prediction.adherence_ratio = adherence_ratio
    prediction.calculation_notes = " ".join(notes_parts)
    prediction.updated_at = utcnow_naive()
    db.commit()
    db.refresh(prediction)

    # Sync upcoming refill into C99 Min-Heap Priority Queue & generate alert if <= 5 days
    if sync_c_engine:
        c_engine.pq_remove_medicine(medicine.id, "REFILL")
        if remaining_days <= 30:
            c_engine.pq_insert_event(
                medicine.id,
                f"[Refill] {medicine.medicine_name}",
                medicine.batch_number or "N/A",
                remaining_days,
                depletion_date,
                medicine.assigned_member_id or 0,
                household_id=hh_id,
                event_type="REFILL",
            )

    if remaining_days <= 5:
        emit_notification(
            db,
            household_id=hh_id,
            notification_type="REFILL",
            medicine_id=medicine.id,
            reference_id=prediction.id,
            severity="CRITICAL" if remaining_days <= 1 else "WARNING",
            threshold_days=5,
            deduplicate=True,
            message=(
                f"REFILL DUE: '{medicine.medicine_name}' estimated to run out in "
                f"{remaining_days} day(s) ({depletion_date}, {confidence} confidence)."
            ),
        )
    else:
        db.query(ExpiryNotification).filter(
            ExpiryNotification.medicine_id == medicine.id,
            ExpiryNotification.notification_type == "REFILL",
        ).delete()
        db.commit()

    return prediction


def recalculate_household_refills(db: Session, household_id: int) -> List[RefillPrediction]:
    meds = (
        db.query(MedicineRecord)
        .filter(MedicineRecord.household_id == household_id, MedicineRecord.is_disposed == False)
        .all()
    )
    results = []
    for med in meds:
        results.append(compute_medicine_refill_prediction(db, med))
    return results
