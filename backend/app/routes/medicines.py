from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.app.c_engine_bridge import c_engine
from backend.app.database import get_db
from backend.app.expiry_engine import (
    calculate_days_until_expiry,
    evaluate_and_generate_notifications,
    get_expiry_status_category,
    recalculate_medicine_alerts,
)
from backend.app.models import (
    HouseholdMember,
    MedicationSchedule,
    MedicineEventHistory,
    MedicineRecord,
    Prescription,
    RefillPrediction,
    User,
    generate_passport_token,
    utcnow_naive,
)
from backend.app.refill_engine import compute_medicine_refill_prediction
from backend.app.schemas import DashboardSummary, MedicineCreate, MedicineResponse, MedicineUpdate
from backend.app.security import get_current_user, resolve_household_access

router = APIRouter(prefix="/medicines", tags=["Medicines"])


def _sync_medicine_to_c_engine(med: MedicineRecord):
    days = calculate_days_until_expiry(med.printed_expiry_date)
    hh_id = med.household_id or 1
    c_engine.pq_remove_medicine(med.id, "EXPIRY")
    if not med.is_disposed:
        c_engine.pq_insert_event(
            med.id,
            med.medicine_name,
            med.batch_number or "N/A",
            days,
            med.printed_expiry_date,
            med.assigned_member_id or 0,
            household_id=hh_id,
            event_type="EXPIRY",
        )
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
                "household_id": hh_id,
            },
        )
    else:
        c_engine.ht_delete_medicine(str(med.id))
        c_engine.pq_remove_medicine(med.id, "")


def enrich_medicine_response(med: MedicineRecord) -> dict:
    days = calculate_days_until_expiry(med.printed_expiry_date)
    status = get_expiry_status_category(days)
    return {
        "id": med.id,
        "household_id": med.household_id,
        "medicine_name": med.medicine_name,
        "brand": med.brand,
        "strength": med.strength,
        "dosage_form": med.dosage_form,
        "manufacturer": med.manufacturer,
        "category": med.category or "General",
        "prescribed_dosage": med.prescribed_dosage,
        "prescription_required": bool(med.prescription_required),
        "batch_number": med.batch_number,
        "manufacturing_date": med.manufacturing_date,
        "printed_expiry_date": med.printed_expiry_date,
        "purchase_date": med.purchase_date,
        "opened_date": med.opened_date,
        "quantity": med.quantity,
        "quantity_unit": med.quantity_unit or "units",
        "stock_threshold": med.stock_threshold,
        "storage_instructions": med.storage_instructions,
        "notes": med.notes,
        "package_photo_url": med.package_photo_url,
        "prescription_url": med.prescription_url,
        "prescription_id": med.prescription_id,
        "assigned_member_id": med.assigned_member_id,
        "passport_token": med.passport_token,
        "data_source": med.data_source,
        "is_confirmed": med.is_confirmed,
        "is_disposed": med.is_disposed,
        "created_at": med.created_at,
        "updated_at": med.updated_at,
        "days_until_expiry": days,
        "expiry_status": status,
        "assigned_member": {
            "id": med.assigned_member.id,
            "household_id": med.assigned_member.household_id,
            "linked_user_id": med.assigned_member.linked_user_id,
            "name": med.assigned_member.name,
            "relationship_role": med.assigned_member.relationship_role,
            "age": med.assigned_member.age,
            "allergies": med.assigned_member.allergies,
            "notes": med.assigned_member.notes,
            "created_at": med.assigned_member.created_at,
        }
        if med.assigned_member
        else None,
    }


@router.get("/passport/verify/{passport_token}", response_model=dict)
def verify_public_medicine_passport(passport_token: str, db: Session = Depends(get_db)):
    """
    Public QR verification endpoint returning strictly non-sensitive medicine metadata.
    Never exposes household name, member names, allergies, personal notes, or prescriptions.
    """
    med = db.query(MedicineRecord).filter(MedicineRecord.passport_token == passport_token.strip()).first()
    if not med:
        raise HTTPException(status_code=404, detail="Passport token not found.")

    days = calculate_days_until_expiry(med.printed_expiry_date)
    return {
        "verified": True,
        "passport_token": med.passport_token,
        "medicine_name": med.medicine_name,
        "brand": med.brand,
        "strength": med.strength,
        "dosage_form": med.dosage_form,
        "manufacturer": med.manufacturer,
        "batch_number": med.batch_number,
        "manufacturing_date": med.manufacturing_date,
        "printed_expiry_date": med.printed_expiry_date,
        "expiry_status": get_expiry_status_category(days),
        "days_until_expiry": days,
        "storage_instructions": med.storage_instructions,
        "data_source": med.data_source,
        "is_confirmed": med.is_confirmed,
        "is_disposed": med.is_disposed,
        "privacy_notice": "Redacted passport verification: household and patient PII omitted.",
    }


@router.get("", response_model=List[MedicineResponse])
def get_medicines(
    q: Optional[str] = Query(None),
    member_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    is_low_stock: Optional[bool] = Query(None),
    include_disposed: bool = Query(False),
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = resolve_household_access(
        db, user, requested_household_id=household_id, required_permission="can_view_medicines"
    )
    query = db.query(MedicineRecord).filter(MedicineRecord.household_id == ctx.household.id)

    if not include_disposed:
        query = query.filter(MedicineRecord.is_disposed == False)
    if member_id:
        query = query.filter(MedicineRecord.assigned_member_id == member_id)
    if q:
        search_pattern = f"%{q.strip()}%"
        query = query.filter(
            or_(
                MedicineRecord.medicine_name.ilike(search_pattern),
                MedicineRecord.brand.ilike(search_pattern),
                MedicineRecord.batch_number.ilike(search_pattern),
                MedicineRecord.category.ilike(search_pattern),
            )
        )

    records = query.order_by(MedicineRecord.printed_expiry_date.asc()).all()
    enriched = [enrich_medicine_response(m) for m in records]

    if status:
        status_upper = status.upper()
        enriched = [m for m in enriched if m["expiry_status"] == status_upper]

    if is_low_stock is not None:
        if is_low_stock:
            enriched = [m for m in enriched if m["quantity"] <= m["stock_threshold"]]
        else:
            enriched = [m for m in enriched if m["quantity"] > m["stock_threshold"]]

    return enriched


@router.get("/dashboard/summary", response_model=DashboardSummary)
def get_dashboard_summary(
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = resolve_household_access(
        db, user, requested_household_id=household_id, required_permission="can_view_medicines"
    )
    hh_id = ctx.household.id
    active_meds = (
        db.query(MedicineRecord)
        .filter(MedicineRecord.household_id == hh_id, MedicineRecord.is_disposed == False)
        .all()
    )

    expiring_soon_count = 0
    already_expired_count = 0
    low_stock_count = 0
    unconfirmed_count = 0

    for med in active_meds:
        days = calculate_days_until_expiry(med.printed_expiry_date)
        if days < 0:
            already_expired_count += 1
        elif days <= 10:
            expiring_soon_count += 1
        if med.quantity <= med.stock_threshold:
            low_stock_count += 1
        if not med.is_confirmed:
            unconfirmed_count += 1

    members_count = db.query(HouseholdMember).filter(HouseholdMember.household_id == hh_id).count()
    active_med_ids = [m.id for m in active_meds]
    reminders_count = (
        db.query(MedicationSchedule)
        .filter(MedicationSchedule.medicine_id.in_(active_med_ids), MedicationSchedule.status == "ACTIVE")
        .count()
        if active_med_ids
        else 0
    )
    upcoming_refills_count = (
        db.query(RefillPrediction)
        .filter(
            RefillPrediction.household_id == hh_id,
            RefillPrediction.remaining_days.isnot(None),
            RefillPrediction.remaining_days <= 7,
        )
        .count()
    )

    recent_events = (
        db.query(MedicineEventHistory)
        .filter(MedicineEventHistory.household_id == hh_id)
        .order_by(MedicineEventHistory.timestamp.desc())
        .limit(10)
        .all()
    )

    activity_list = [
        {
            "id": ev.id,
            "medicine_id": ev.medicine_id,
            "action": ev.action,
            "description": ev.description,
            "timestamp": ev.timestamp.isoformat(),
            "quantity_delta": ev.quantity_delta,
        }
        for ev in recent_events
    ]

    return {
        "total_active_medicines": len(active_meds),
        "expiring_soon_count": expiring_soon_count,
        "already_expired_count": already_expired_count,
        "low_stock_count": low_stock_count,
        "unconfirmed_count": unconfirmed_count,
        "upcoming_reminders_count": reminders_count,
        "upcoming_refills_count": upcoming_refills_count,
        "household_members_count": members_count,
        "recent_activity": activity_list,
    }


@router.get("/events/recent", response_model=List[dict])
def get_recent_medicine_events(
    limit: int = Query(50, ge=1, le=200),
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = resolve_household_access(
        db, user, requested_household_id=household_id, required_permission="can_view_medicines"
    )
    events = (
        db.query(MedicineEventHistory)
        .filter(MedicineEventHistory.household_id == ctx.household.id)
        .order_by(MedicineEventHistory.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": ev.id,
            "medicine_id": ev.medicine_id,
            "action": ev.action,
            "description": ev.description,
            "timestamp": ev.timestamp.isoformat(),
            "quantity_delta": ev.quantity_delta,
        }
        for ev in events
    ]


@router.get("/{medicine_id}/events", response_model=List[dict])
def get_medicine_events(
    medicine_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    med = db.query(MedicineRecord).filter(MedicineRecord.id == medicine_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medicine record not found")
    resolve_household_access(
        db, user, requested_household_id=med.household_id, required_permission="can_view_medicines"
    )

    events = (
        db.query(MedicineEventHistory)
        .filter(MedicineEventHistory.medicine_id == medicine_id)
        .order_by(MedicineEventHistory.timestamp.desc())
        .all()
    )
    return [
        {
            "id": ev.id,
            "medicine_id": ev.medicine_id,
            "action": ev.action,
            "description": ev.description,
            "timestamp": ev.timestamp.isoformat(),
            "quantity_delta": ev.quantity_delta,
        }
        for ev in events
    ]


@router.get("/{medicine_id}", response_model=MedicineResponse)
def get_medicine_by_id(
    medicine_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    med = db.query(MedicineRecord).filter(MedicineRecord.id == medicine_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medicine record not found")
    resolve_household_access(
        db, user, requested_household_id=med.household_id, required_permission="can_view_medicines"
    )
    return enrich_medicine_response(med)


@router.post("", response_model=MedicineResponse, status_code=201)
def create_medicine(
    data: MedicineCreate,
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = resolve_household_access(
        db, user, requested_household_id=household_id, required_permission="can_edit_medicines"
    )

    if data.assigned_member_id is not None:
        mem = (
            db.query(HouseholdMember)
            .filter(
                HouseholdMember.id == data.assigned_member_id,
                HouseholdMember.household_id == ctx.household.id,
            )
            .first()
        )
        if not mem:
            raise HTTPException(status_code=404, detail="Assigned household member not found in your household.")

    if data.prescription_id is not None:
        presc = (
            db.query(Prescription)
            .filter(
                Prescription.id == data.prescription_id,
                Prescription.household_id == ctx.household.id,
            )
            .first()
        )
        if not presc:
            raise HTTPException(status_code=404, detail="Linked prescription not found in your household.")

    payload = data.model_dump()
    med = MedicineRecord(
        **payload,
        household_id=ctx.household.id,
        passport_token=generate_passport_token(),
    )
    db.add(med)
    db.flush()

    evaluate_and_generate_notifications(db, med)

    now = utcnow_naive()
    ev = MedicineEventHistory(
        household_id=ctx.household.id,
        actor_user_id=user.id,
        medicine_id=med.id,
        action="CREATED",
        timestamp=now,
        description=f"Created via {med.data_source} entry with {med.quantity} {med.quantity_unit}.",
        quantity_delta=med.quantity,
    )
    db.add(ev)
    db.commit()
    db.refresh(med)
    db.refresh(ev)

    compute_medicine_refill_prediction(db, med)
    _sync_medicine_to_c_engine(med)
    c_engine.ll_append_event(
        ev.id,
        str(med.id),
        ev.action,
        ev.timestamp.isoformat(),
        ev.description,
        ev.quantity_delta,
        household_id=ctx.household.id,
    )

    return enrich_medicine_response(med)


@router.put("/{medicine_id}", response_model=MedicineResponse)
def update_medicine(
    medicine_id: int,
    data: MedicineUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    med = db.query(MedicineRecord).filter(MedicineRecord.id == medicine_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medicine record not found")

    ctx = resolve_household_access(
        db, user, requested_household_id=med.household_id, required_permission="can_edit_medicines"
    )

    update_dict = data.model_dump(exclude_unset=True)
    if "assigned_member_id" in update_dict and update_dict["assigned_member_id"] is not None:
        mem = (
            db.query(HouseholdMember)
            .filter(
                HouseholdMember.id == update_dict["assigned_member_id"],
                HouseholdMember.household_id == ctx.household.id,
            )
            .first()
        )
        if not mem:
            raise HTTPException(status_code=404, detail="Assigned household member not found in your household.")

    if "prescription_id" in update_dict and update_dict["prescription_id"] is not None:
        presc = (
            db.query(Prescription)
            .filter(
                Prescription.id == update_dict["prescription_id"],
                Prescription.household_id == ctx.household.id,
            )
            .first()
        )
        if not presc:
            raise HTTPException(status_code=404, detail="Linked prescription not found in your household.")

    prev_qty = med.quantity
    expiry_changed = (
        "printed_expiry_date" in update_dict
        and update_dict["printed_expiry_date"] != med.printed_expiry_date
    )

    for key, value in update_dict.items():
        setattr(med, key, value)

    now = utcnow_naive()
    med.updated_at = now
    qty_delta = med.quantity - prev_qty

    ev = MedicineEventHistory(
        household_id=ctx.household.id,
        actor_user_id=user.id,
        medicine_id=med.id,
        action="UPDATED",
        timestamp=now,
        description="Updated medicine details"
        + (f" (stock adjusted {qty_delta:+d})" if qty_delta != 0 else "."),
        quantity_delta=qty_delta,
    )
    db.add(ev)
    db.commit()

    if expiry_changed:
        recalculate_medicine_alerts(db, med.id)
    else:
        evaluate_and_generate_notifications(db, med)

    db.refresh(med)
    db.refresh(ev)
    compute_medicine_refill_prediction(db, med)
    _sync_medicine_to_c_engine(med)
    c_engine.ll_append_event(
        ev.id,
        str(med.id),
        ev.action,
        ev.timestamp.isoformat(),
        ev.description,
        ev.quantity_delta,
        household_id=ctx.household.id,
    )
    return enrich_medicine_response(med)


@router.delete("/{medicine_id}", status_code=204)
def delete_medicine(
    medicine_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    med = db.query(MedicineRecord).filter(MedicineRecord.id == medicine_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medicine record not found")

    resolve_household_access(
        db, user, requested_household_id=med.household_id, required_permission="can_edit_medicines"
    )

    c_engine.pq_remove_medicine(med.id, "")
    c_engine.ht_delete_medicine(str(med.id))
    db.delete(med)
    db.commit()
    return None
