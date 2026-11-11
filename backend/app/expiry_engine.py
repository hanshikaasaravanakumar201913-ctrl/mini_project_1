import datetime
from typing import List, Optional
from sqlalchemy.orm import Session
from backend.app.models import ExpiryNotification, MedicineRecord, Prescription, utcnow_naive

EXPIRY_THRESHOLDS = [10, 5, 3, 1, 0]  # 0 represents expired (days <= 0)


def parse_iso_date(date_str: str) -> datetime.date:
    """
    Parses date string in YYYY-MM-DD or standard ISO formats safely.
    Handles potential month-end, leap years, and whitespace.
    """
    clean_str = date_str.strip().split("T")[0]
    parts = clean_str.split("-")
    if len(parts) == 3:
        year = int(parts[0])
        month = int(parts[1])
        day = int(parts[2])
        return datetime.date(year, month, day)
    raise ValueError(f"Invalid date format: {date_str}. Expected YYYY-MM-DD")


def calculate_days_until_expiry(expiry_date_str: str, reference_date: Optional[datetime.date] = None) -> int:
    if reference_date is None:
        reference_date = datetime.date.today()
    exp_date = parse_iso_date(expiry_date_str)
    return (exp_date - reference_date).days


def get_expiry_status_category(days: int) -> str:
    if days < 0:
        return "EXPIRED"
    elif days == 0:
        return "EXPIRES_TODAY"
    elif days == 1:
        return "CRITICAL_1D"
    elif days <= 3:
        return "URGENT_3D"
    elif days <= 5:
        return "APPROACHING_5D"
    elif days <= 10:
        return "NOTICE_10D"
    else:
        return "SAFE"


def evaluate_and_generate_notifications(
    db: Session,
    medicine: MedicineRecord,
    reference_date: Optional[datetime.date] = None,
) -> List[ExpiryNotification]:
    """
    Evaluates a medicine's printed expiry date against thresholds (10, 5, 3, 1, 0)
    and low-stock status, ensuring idempotency per (medicine_id, notification_type, threshold_days).
    """
    if medicine.is_disposed:
        return []

    days = calculate_days_until_expiry(medicine.printed_expiry_date, reference_date)
    hh_id = getattr(medicine, "household_id", 1) or 1
    new_notifications: List[ExpiryNotification] = []
    now = utcnow_naive()

    for threshold in EXPIRY_THRESHOLDS:
        should_trigger = False
        message = ""
        severity = "WARNING"

        if threshold == 0 and days <= 0:
            should_trigger = True
            severity = "CRITICAL"
            if days < 0:
                message = (
                    f"EXPIRED: '{medicine.medicine_name}' expired {abs(days)} day(s) ago "
                    f"({medicine.printed_expiry_date}). Do not use. Follow disposal guidance."
                )
            else:
                message = (
                    f"URGENT: '{medicine.medicine_name}' expires TODAY ({medicine.printed_expiry_date}). "
                    "Review safety guidance."
                )
        elif threshold > 0 and days <= threshold:
            should_trigger = True
            severity = "CRITICAL" if threshold <= 1 else "WARNING"
            message = (
                f"ALERT: '{medicine.medicine_name}' expires in {days} day(s) "
                f"({medicine.printed_expiry_date}). Plan review or disposal."
            )

        if should_trigger:
            existing = (
                db.query(ExpiryNotification)
                .filter(
                    ExpiryNotification.medicine_id == medicine.id,
                    ExpiryNotification.notification_type == "EXPIRY",
                    ExpiryNotification.threshold_days == threshold,
                )
                .first()
            )
            if not existing:
                notif = ExpiryNotification(
                    household_id=hh_id,
                    medicine_id=medicine.id,
                    notification_type="EXPIRY",
                    reference_id=medicine.id,
                    severity=severity,
                    threshold_days=threshold,
                    message=message,
                    is_read=False,
                    triggered_at=now,
                )
                db.add(notif)
                new_notifications.append(notif)

    # Low-stock check (idempotent per medicine)
    if medicine.quantity <= medicine.stock_threshold:
        existing_low = (
            db.query(ExpiryNotification)
            .filter(
                ExpiryNotification.medicine_id == medicine.id,
                ExpiryNotification.notification_type == "LOW_STOCK",
            )
            .first()
        )
        if not existing_low:
            low_notif = ExpiryNotification(
                household_id=hh_id,
                medicine_id=medicine.id,
                notification_type="LOW_STOCK",
                reference_id=medicine.id,
                severity="WARNING",
                threshold_days=0,
                message=(
                    f"LOW STOCK: '{medicine.medicine_name}' has {medicine.quantity} "
                    f"{medicine.quantity_unit or 'units'} left (threshold <= {medicine.stock_threshold})."
                ),
                is_read=False,
                triggered_at=now,
            )
            db.add(low_notif)
            new_notifications.append(low_notif)
    else:
        # Clear obsolete low-stock alert if restocked
        db.query(ExpiryNotification).filter(
            ExpiryNotification.medicine_id == medicine.id,
            ExpiryNotification.notification_type == "LOW_STOCK",
        ).delete()

    if new_notifications:
        db.commit()

    return new_notifications


def evaluate_prescription_validity_notifications(
    db: Session,
    prescription: Prescription,
    reference_date: Optional[datetime.date] = None,
) -> List[ExpiryNotification]:
    if not prescription.valid_until:
        return []
    days = calculate_days_until_expiry(prescription.valid_until, reference_date)
    if days > 7:
        return []

    threshold = 0 if days <= 0 else 7
    existing = (
        db.query(ExpiryNotification)
        .filter(
            ExpiryNotification.household_id == prescription.household_id,
            ExpiryNotification.notification_type == "PRESCRIPTION_VALIDITY",
            ExpiryNotification.reference_id == prescription.id,
            ExpiryNotification.threshold_days == threshold,
        )
        .first()
    )
    if existing:
        return []

    msg = (
        f"PRESCRIPTION EXPIRED: '{prescription.title}' validity ended on {prescription.valid_until}."
        if days <= 0
        else f"PRESCRIPTION EXPIRING: '{prescription.title}' is valid for {days} more day(s) until {prescription.valid_until}."
    )
    notif = ExpiryNotification(
        household_id=prescription.household_id,
        medicine_id=None,
        notification_type="PRESCRIPTION_VALIDITY",
        reference_id=prescription.id,
        severity="CRITICAL" if days <= 0 else "WARNING",
        threshold_days=threshold,
        message=msg,
        is_read=False,
        triggered_at=utcnow_naive(),
    )
    db.add(notif)
    db.commit()
    return [notif]


def recalculate_medicine_alerts(db: Session, medicine_id: int):
    medicine = db.query(MedicineRecord).filter(MedicineRecord.id == medicine_id).first()
    if not medicine:
        return []

    db.query(ExpiryNotification).filter(
        ExpiryNotification.medicine_id == medicine_id,
        ExpiryNotification.notification_type == "EXPIRY",
        ExpiryNotification.is_read == False,
    ).delete()
    db.commit()

    return evaluate_and_generate_notifications(db, medicine)
