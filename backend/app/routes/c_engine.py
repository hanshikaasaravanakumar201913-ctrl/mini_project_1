from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.c_engine_bridge import c_engine
from backend.app.config import settings
from backend.app.database import get_db
from backend.app.expiry_engine import calculate_days_until_expiry
from backend.app.models import MedicineEventHistory, MedicineRecord, RefillPrediction, User
from backend.app.security import get_current_user, resolve_household_access

router = APIRouter(prefix="/c-engine", tags=["C Data Structures Engine"])


def repopulate_c_structures(db: Session):
    """
    Synchronizes current database state into all three C data structures cleanly.
    Clears priority queue, hash table, and linked list first to avoid stale or duplicate entries.
    """
    c_engine.clear_all()
    meds = db.query(MedicineRecord).filter(MedicineRecord.is_disposed == False).all()

    for med in meds:
        days = calculate_days_until_expiry(med.printed_expiry_date)
        hh_id = med.household_id or 1
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

    preds = db.query(RefillPrediction).filter(RefillPrediction.remaining_days.isnot(None)).all()
    for pred in preds:
        if pred.remaining_days is not None and pred.remaining_days <= 30 and pred.medicine and not pred.medicine.is_disposed:
            c_engine.pq_insert_event(
                pred.medicine_id,
                f"[Refill] {pred.medicine.medicine_name}",
                pred.medicine.batch_number or "N/A",
                pred.remaining_days,
                pred.estimated_depletion_date or "",
                pred.medicine.assigned_member_id or 0,
                household_id=pred.household_id,
                event_type="REFILL",
            )

    events = db.query(MedicineEventHistory).order_by(MedicineEventHistory.timestamp.asc()).all()
    for ev in events:
        hh_id = ev.household_id or (ev.medicine.household_id if ev.medicine else 1) or 1
        c_engine.ll_append_event(
            ev.id,
            str(ev.medicine_id),
            ev.action,
            ev.timestamp.isoformat() if ev.timestamp else "",
            ev.description,
            ev.quantity_delta,
            household_id=hh_id,
        )

    return {
        "success": True,
        "engine_mode": c_engine.mode,
        "pq_size": c_engine.pq_size(),
        "ht_size": c_engine.ht_size(),
        "ll_size": c_engine.ll_size(),
    }


def _scope_household_id(db: Session, user: User, household_id: Optional[int]) -> Optional[int]:
    if user.role == "PLATFORM_ADMIN" and household_id is None:
        return None
    ctx = resolve_household_access(
        db, user, requested_household_id=household_id, required_permission="can_view_medicines"
    )
    return ctx.household.id


@router.get("/status")
def get_c_engine_status(
    user: User = Depends(get_current_user),
):
    ht_diag = c_engine.ht_stats()
    return {
        "engine_mode": c_engine.mode,
        "native_library_path": c_engine.loaded_lib_path,
        "priority_queue_size": c_engine.pq_size(),
        "hash_table_size": ht_diag["size"],
        "hash_table_buckets": ht_diag["buckets"],
        "hash_table_collisions": ht_diag["collisions"],
        "linked_list_event_count": c_engine.ll_size(),
        "academic_module": "C99 Min-Heap Priority Queue, Hash Table (djb2 Chaining), Singly Linked List",
        "complexities": {
            "min_heap": {"insert": "O(log n)", "peek": "O(1)", "extract_min": "O(log n)", "build_heap": "O(n)"},
            "hash_table": {"insert": "O(1) avg", "search": "O(1) avg", "delete": "O(1) avg"},
            "linked_list": {"append": "O(1)", "prepend": "O(1)", "search": "O(n)"},
        },
    }


@router.get("/priority-queue/urgent")
def peek_urgent_event(
    limit: int = Query(1, ge=1, le=50),
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scoped_hh = _scope_household_id(db, user, household_id)
    urgent = c_engine.pq_peek_urgent(household_id=scoped_hh)
    queue_preview = c_engine.pq_get_all_events(household_id=scoped_hh, limit=limit) if limit > 1 else ([urgent] if urgent else [])
    return {
        "most_urgent_expiry_event": urgent,
        "top_events": queue_preview,
        "algorithm": "Min-Heap root element O(1) peek (household-scoped)",
        "engine_mode": c_engine.mode,
    }


@router.get("/hash-table/{key}")
def search_hash_table(
    key: str,
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scoped_hh = _scope_household_id(db, user, household_id)
    res = c_engine.ht_search_medicine(key, household_id=scoped_hh)
    return {
        "found": res is not None,
        "record": res,
        "algorithm": "djb2 separate-chaining hash lookup O(1) avg (household-scoped)",
        "engine_mode": c_engine.mode,
    }


@router.get("/timeline")
def get_timeline_events(
    action: Optional[str] = None,
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scoped_hh = _scope_household_id(db, user, household_id)
    events = (
        c_engine.ll_search_action(action, household_id=scoped_hh)
        if action
        else c_engine.ll_get_all_events(household_id=scoped_hh)
    )
    return {
        "events": events,
        "total_nodes": len(events),
        "data_structure": "Singly Linked List with Head/Tail pointers (household-scoped)",
        "engine_mode": c_engine.mode,
    }


@router.post("/repopulate")
def repopulate_endpoint(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role not in ("HOUSEHOLD_OWNER", "PLATFORM_ADMIN"):
        raise HTTPException(status_code=403, detail="Only owners or platform administrators can resync C structures.")
    return repopulate_c_structures(db)


@router.post("/seed-demo")
def seed_demo_endpoint(
    reset: bool = True,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "PLATFORM_ADMIN" and settings.ENVIRONMENT.lower() != "development":
        raise HTTPException(status_code=403, detail="Demo reset is restricted to administrators in production.")
    if user.role not in ("HOUSEHOLD_OWNER", "PLATFORM_ADMIN"):
        raise HTTPException(status_code=403, detail="Not authorized to reset demo data.")

    from backend.app.seed_data import seed_demonstration_dataset

    seed_demonstration_dataset(db, reset=reset)
    stats = repopulate_c_structures(db)
    return {
        "success": True,
        "message": "Demonstration dataset seeded dynamically relative to current date.",
        **stats,
    }
