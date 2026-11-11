from typing import Optional
from sqlalchemy.orm import Session
from backend.app.models import ExpiryNotification, utcnow_naive


def emit_notification(
    db: Session,
    *,
    household_id: Optional[int],
    notification_type: str,
    message: str,
    severity: str = "INFO",
    user_id: Optional[int] = None,
    medicine_id: Optional[int] = None,
    reference_id: Optional[int] = None,
    threshold_days: int = 0,
    deduplicate: bool = False,
) -> ExpiryNotification:
    if deduplicate:
        q = db.query(ExpiryNotification).filter(
            ExpiryNotification.notification_type == notification_type,
            ExpiryNotification.threshold_days == threshold_days,
        )
        if household_id is not None:
            q = q.filter(ExpiryNotification.household_id == household_id)
        if medicine_id is not None:
            q = q.filter(ExpiryNotification.medicine_id == medicine_id)
        if reference_id is not None:
            q = q.filter(ExpiryNotification.reference_id == reference_id)
        if user_id is not None:
            q = q.filter(ExpiryNotification.user_id == user_id)
        existing = q.first()
        if existing:
            return existing

    notif = ExpiryNotification(
        household_id=household_id,
        user_id=user_id,
        medicine_id=medicine_id,
        notification_type=notification_type,
        reference_id=reference_id,
        severity=severity,
        threshold_days=threshold_days,
        message=message[:255],
        is_read=False,
        triggered_at=utcnow_naive(),
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif
