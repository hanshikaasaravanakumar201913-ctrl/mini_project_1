from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.app.database import Base
from backend.app.models import (
    HouseholdMember,
    MedicationSchedule,
    MedicineEventHistory,
    MedicineRecord,
    User,
)
from backend.app.seed_data import seed_demonstration_dataset
from backend.app.expiry_engine import calculate_days_until_expiry, evaluate_and_generate_notifications


def setup_test_db():
    test_engine = create_engine("sqlite:///:memory:", echo=False)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    return TestingSessionLocal()


def test_full_database_lifecycle():
    db = setup_test_db()
    try:
        seed_demonstration_dataset(db, reset=True)

        members = db.query(HouseholdMember).all()
        assert len(members) >= 3
        roles = [m.relationship_role for m in members]
        assert "Self" in roles
        assert "Mother" in roles
        assert "Child" in roles

        meds = db.query(MedicineRecord).filter(MedicineRecord.is_disposed == False).all()
        assert len(meds) >= 7

        days_list = [calculate_days_until_expiry(m.printed_expiry_date) for m in meds]
        assert any(d < 0 for d in days_list), "Expired item present"
        assert any(d == 1 for d in days_list), "1-day item present"
        assert any(d == 3 for d in days_list), "3-day item present"
        assert any(d == 5 for d in days_list), "5-day item present"
        assert any(d == 10 for d in days_list), "10-day item present"
        assert any(d > 10 for d in days_list), "Safe inventory item present"

        med1 = meds[0]
        evaluate_and_generate_notifications(db, med1)
        duplicate_notifs = evaluate_and_generate_notifications(db, med1)
        assert len(duplicate_notifs) == 0, "Evaluation must be idempotent"

        disposed_meds = db.query(MedicineRecord).filter(MedicineRecord.is_disposed == True).all()
        assert len(disposed_meds) == 1
        assert disposed_meds[0].quantity == 0
    finally:
        db.close()


def test_dose_logging_duplicate_prevention():
    db = setup_test_db()
    try:
        seed_demonstration_dataset(db, reset=True)
        owner = db.query(User).filter(User.email == "owner@medora.demo").first()
        sched = db.query(MedicationSchedule).first()
        assert owner is not None and sched is not None
        med = sched.medicine
        initial_qty = med.quantity

        from backend.app.routes.schedules import log_schedule_dose
        from backend.app.schemas import ScheduleLogCreate

        res1 = log_schedule_dose(sched.id, ScheduleLogCreate(schedule_id=sched.id, status="TAKEN"), owner, db)
        assert res1["success"] is True
        assert med.quantity == initial_qty - sched.dose_quantity

        res2 = log_schedule_dose(sched.id, ScheduleLogCreate(schedule_id=sched.id, status="TAKEN"), owner, db)
        assert res2["success"] is True
        assert res2.get("duplicate_prevented") is True
        assert med.quantity == initial_qty - sched.dose_quantity
    finally:
        db.close()


def test_disposal_quantity_delta_preservation():
    db = setup_test_db()
    try:
        seed_demonstration_dataset(db, reset=True)
        owner = db.query(User).filter(User.email == "owner@medora.demo").first()
        med = db.query(MedicineRecord).filter(MedicineRecord.is_disposed == False, MedicineRecord.quantity > 5).first()
        assert owner is not None and med is not None
        orig_qty = med.quantity

        from backend.app.routes.disposal import mark_medicine_disposed
        from backend.app.schemas import DisposalCreate

        disp_data = DisposalCreate(
            medicine_id=med.id,
            disposed_date="2026-10-14",
            disposal_method="Community Pharmacy Take-Back Kiosk",
            notes="Expired batch surrendered",
        )
        mark_medicine_disposed(disp_data, owner, db)

        assert med.is_disposed is True
        assert med.quantity == 0

        ev = (
            db.query(MedicineEventHistory)
            .filter(MedicineEventHistory.medicine_id == med.id, MedicineEventHistory.action == "DISPOSED")
            .first()
        )
        assert ev is not None
        assert ev.quantity_delta == -orig_qty
    finally:
        db.close()
