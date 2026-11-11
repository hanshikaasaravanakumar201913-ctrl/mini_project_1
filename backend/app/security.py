import collections
import datetime
import hashlib
import secrets
import time
from dataclasses import dataclass
from typing import Deque, Dict, Optional

import bcrypt
from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.database import get_db
from backend.app.models import (
    CaregiverPermission,
    Household,
    HouseholdMember,
    Pharmacy,
    PharmacyStaff,
    User,
    UserSession,
)


def utcnow_naive() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def hash_password(password: str) -> str:
    if len(password.encode("utf-8")) > 72:
        # bcrypt operates on first 72 bytes; pre-check reasonable limit
        raise ValueError("Password must not exceed 72 bytes.")
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def create_user_session(db: Session, user: User, device_info: Optional[str] = None) -> tuple[str, UserSession]:
    raw_token = secrets.token_urlsafe(32)
    now = utcnow_naive()
    session = UserSession(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        device_info=(device_info or "Web Client")[:200],
        expires_at=now + datetime.timedelta(hours=settings.SESSION_TTL_HOURS),
        created_at=now,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return raw_token, session


class SlidingWindowRateLimiter:
    """In-memory rate limiter for auth & sensitive endpoints."""

    def __init__(self, max_requests: int = 20, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: Dict[str, Deque[float]] = collections.defaultdict(collections.deque)
        self.enabled = True

    def reset(self):
        self._hits.clear()

    def check(self, key: str):
        if not self.enabled:
            return
        now = time.monotonic()
        dq = self._hits[key]
        while dq and now - dq[0] > self.window_seconds:
            dq.popleft()
        if len(dq) >= self.max_requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please wait before retrying.",
            )
        dq.append(now)


auth_rate_limiter = SlidingWindowRateLimiter(max_requests=25, window_seconds=60)


def rate_limit_auth(request: Request):
    client_host = request.client.host if request.client else "unknown"
    auth_rate_limiter.check(f"auth:{client_host}")


def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.strip().split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


def get_optional_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    raw_token = _extract_bearer_token(authorization)
    if not raw_token:
        return None

    now = utcnow_naive()
    session = (
        db.query(UserSession)
        .filter(
            UserSession.token_hash == hash_token(raw_token),
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
        )
        .first()
    )
    if not session:
        return None

    user = db.query(User).filter(User.id == session.user_id, User.is_active == True).first()
    return user


def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> User:
    raw_token = _extract_bearer_token(authorization)
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide a valid Bearer session token.",
        )

    now = utcnow_naive()
    session = (
        db.query(UserSession)
        .filter(
            UserSession.token_hash == hash_token(raw_token),
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
        )
        .first()
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session is invalid, expired, or revoked.",
        )

    user = db.query(User).filter(User.id == session.user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is disabled or unavailable.",
        )
    return user


def require_roles(*allowed_roles: str):
    def _checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role}' is not authorized for this action.",
            )
        return user

    return _checker


@dataclass
class HouseholdAccessContext:
    household: Household
    access_role: str  # OWNER, MEMBER, CAREGIVER
    permissions: Dict[str, bool]


FULL_OWNER_PERMS = {
    "can_view_medicines": True,
    "can_edit_medicines": True,
    "can_view_prescriptions": True,
    "can_manage_schedules": True,
    "can_record_doses": True,
    "can_view_notifications": True,
    "can_manage_refills": True,
    "is_owner": True,
}

MEMBER_PERMS = {
    "can_view_medicines": True,
    "can_edit_medicines": False,
    "can_view_prescriptions": True,
    "can_manage_schedules": True,
    "can_record_doses": True,
    "can_view_notifications": True,
    "can_manage_refills": False,
    "is_owner": False,
}


def resolve_household_access(
    db: Session,
    user: User,
    requested_household_id: Optional[int] = None,
    required_permission: Optional[str] = None,
    require_owner: bool = False,
) -> HouseholdAccessContext:
    """
    Strictly resolves which household the authenticated user can access,
    enforcing owner, member, and granular caregiver permissions.
    Never exposes another household's records.
    """
    # 1. Check owned household(s)
    owned_query = db.query(Household).filter(Household.owner_user_id == user.id)
    if requested_household_id is not None:
        owned_hh = owned_query.filter(Household.id == requested_household_id).first()
    else:
        owned_hh = owned_query.order_by(Household.id.asc()).first()

    if owned_hh:
        return HouseholdAccessContext(
            household=owned_hh,
            access_role="OWNER",
            permissions=dict(FULL_OWNER_PERMS),
        )

    if require_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the household owner is authorized for this action.",
        )

    # 2. Check linked HouseholdMember profile
    member_links = db.query(HouseholdMember).filter(HouseholdMember.linked_user_id == user.id).all()
    for link in member_links:
        if requested_household_id is None or link.household_id == requested_household_id:
            hh = db.query(Household).filter(Household.id == link.household_id).first()
            if hh:
                if required_permission and not MEMBER_PERMS.get(required_permission, False):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Household member lacks permission '{required_permission}'.",
                    )
                return HouseholdAccessContext(
                    household=hh,
                    access_role="MEMBER",
                    permissions=dict(MEMBER_PERMS),
                )

    # 3. Check active CaregiverPermission
    cg_query = db.query(CaregiverPermission).filter(
        CaregiverPermission.caregiver_user_id == user.id,
        CaregiverPermission.is_active == True,
    )
    if requested_household_id is not None:
        cg_perm = cg_query.filter(CaregiverPermission.household_id == requested_household_id).first()
    else:
        cg_perm = cg_query.order_by(CaregiverPermission.id.asc()).first()

    if cg_perm:
        hh = db.query(Household).filter(Household.id == cg_perm.household_id).first()
        if hh:
            perms = {
                "can_view_medicines": cg_perm.can_view_medicines,
                "can_edit_medicines": cg_perm.can_edit_medicines,
                "can_view_prescriptions": cg_perm.can_view_prescriptions,
                "can_manage_schedules": cg_perm.can_manage_schedules,
                "can_record_doses": cg_perm.can_record_doses,
                "can_view_notifications": cg_perm.can_view_notifications,
                "can_manage_refills": cg_perm.can_manage_refills,
                "is_owner": False,
            }
            if required_permission and not perms.get(required_permission, False):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Caregiver permission '{required_permission}' is not granted for this household.",
                )
            return HouseholdAccessContext(
                household=hh,
                access_role="CAREGIVER",
                permissions=perms,
            )

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have authorized access to this household.",
    )


def resolve_user_pharmacy(
    db: Session,
    user: User,
    pharmacy_id: Optional[int] = None,
) -> Pharmacy:
    """Resolves a pharmacy managed by the authenticated PHARMACY_STAFF (or PLATFORM_ADMIN) user."""
    if user.role not in ("PHARMACY_STAFF", "PLATFORM_ADMIN"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Pharmacy staff privileges required.",
        )

    query = db.query(PharmacyStaff).filter(PharmacyStaff.user_id == user.id)
    if pharmacy_id is not None:
        membership = query.filter(PharmacyStaff.pharmacy_id == pharmacy_id).first()
    else:
        membership = query.order_by(PharmacyStaff.id.asc()).first()

    if not membership:
        if user.role == "PLATFORM_ADMIN" and pharmacy_id is not None:
            ph = db.query(Pharmacy).filter(Pharmacy.id == pharmacy_id).first()
            if ph:
                return ph
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No authorized pharmacy profile associated with this account.",
        )

    ph = db.query(Pharmacy).filter(Pharmacy.id == membership.pharmacy_id).first()
    if not ph:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pharmacy not found.")
    return ph
