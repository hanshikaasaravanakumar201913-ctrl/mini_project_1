import datetime
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.database import get_db
from backend.app.language_registry import sanitize_language_code
from backend.app.models import (
    CaregiverPermission,
    Household,
    HouseholdMember,
    PasswordResetToken,
    PharmacyStaff,
    User,
    UserSession,
)
from backend.app.schemas import (
    AuthSessionResponse,
    ForgotPasswordRequest,
    HouseholdCreateOrUpdate,
    HouseholdResponse,
    ResetPasswordRequest,
    UserLoginRequest,
    UserProfileUpdate,
    UserRegisterRequest,
    UserResponse,
)
from backend.app.security import (
    create_user_session,
    get_current_user,
    hash_password,
    hash_token,
    rate_limit_auth,
    resolve_household_access,
    utcnow_naive,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["Authentication & Profiles"])

ALLOWED_SELF_REGISTER_ROLES = {"HOUSEHOLD_OWNER", "CAREGIVER", "HOUSEHOLD_MEMBER", "PHARMACY_STAFF"}


def _build_session_payload(db: Session, user: User, raw_token: str, session: UserSession) -> dict:
    household_id = None
    household_name = None
    access_role = None
    permissions = None
    pharmacy_id = None

    try:
        ctx = resolve_household_access(db, user)
        household_id = ctx.household.id
        household_name = ctx.household.name
        access_role = ctx.access_role
        permissions = ctx.permissions
    except HTTPException:
        pass

    ph_staff = db.query(PharmacyStaff).filter(PharmacyStaff.user_id == user.id).first()
    if ph_staff:
        pharmacy_id = ph_staff.pharmacy_id

    return {
        "access_token": raw_token,
        "token_type": "bearer",
        "expires_at": session.expires_at,
        "user": user,
        "household_id": household_id,
        "household_name": household_name,
        "access_role": access_role,
        "permissions": permissions,
        "pharmacy_id": pharmacy_id,
    }


@router.post("/register", response_model=AuthSessionResponse, status_code=201, dependencies=[Depends(rate_limit_auth)])
def register_user(data: UserRegisterRequest, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Invalid email address format.")

    role = data.role.strip().upper()
    if role not in ALLOWED_SELF_REGISTER_ROLES:
        raise HTTPException(status_code=400, detail=f"Unsupported registration role: {role}")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user = User(
        email=email,
        full_name=data.full_name.strip(),
        phone=data.phone.strip() if data.phone else None,
        password_hash=hash_password(data.password),
        role=role,
        preferred_language=sanitize_language_code(data.preferred_language),
        is_active=True,
    )
    db.add(user)
    db.flush()

    if role == "HOUSEHOLD_OWNER":
        hh_name = (data.household_name or f"{user.full_name.split()[0]}'s Household").strip()
        hh = Household(name=hh_name, owner_user_id=user.id)
        db.add(hh)
        db.flush()

        member = HouseholdMember(
            household_id=hh.id,
            linked_user_id=user.id,
            name=user.full_name,
            relationship_role="Self",
            notes="Primary household owner",
        )
        db.add(member)

    db.commit()
    db.refresh(user)

    raw_token, session = create_user_session(db, user, device_info="Registration Session")
    return _build_session_payload(db, user, raw_token, session)


@router.post("/login", response_model=AuthSessionResponse, dependencies=[Depends(rate_limit_auth)])
def login_user(data: UserLoginRequest, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="This user account is deactivated.")

    raw_token, session = create_user_session(db, user, device_info=data.device_info)
    return _build_session_payload(db, user, raw_token, session)


@router.post("/logout")
def logout_user(
    authorization: Optional[str] = Header(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if authorization and " " in authorization:
        raw_token = authorization.split(" ", 1)[1].strip()
        session = (
            db.query(UserSession)
            .filter(UserSession.user_id == user.id, UserSession.token_hash == hash_token(raw_token))
            .first()
        )
        if session and session.revoked_at is None:
            session.revoked_at = utcnow_naive()
            db.commit()
    return {"success": True, "message": "Session logged out and revoked."}


@router.get("/me", response_model=dict)
def get_my_profile(
    authorization: Optional[str] = Header(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    household_id = None
    household_name = None
    access_role = None
    permissions = None
    authorized_households = []
    session_expires_at = None

    if authorization and " " in authorization:
        raw_token = authorization.split(" ", 1)[1].strip()
        active_session = (
            db.query(UserSession)
            .filter(UserSession.user_id == user.id, UserSession.token_hash == hash_token(raw_token))
            .first()
        )
        if active_session:
            session_expires_at = active_session.expires_at.isoformat()

    owned = db.query(Household).filter(Household.owner_user_id == user.id).all()
    for h in owned:
        authorized_households.append({"id": h.id, "name": h.name, "access_role": "OWNER"})

    cg_perms = (
        db.query(CaregiverPermission)
        .filter(CaregiverPermission.caregiver_user_id == user.id, CaregiverPermission.is_active == True)
        .all()
    )
    for perm in cg_perms:
        hh = db.query(Household).filter(Household.id == perm.household_id).first()
        if hh:
            authorized_households.append({"id": hh.id, "name": hh.name, "access_role": "CAREGIVER"})

    try:
        ctx = resolve_household_access(db, user)
        household_id = ctx.household.id
        household_name = ctx.household.name
        access_role = ctx.access_role
        permissions = ctx.permissions
    except HTTPException:
        pass

    ph_staff = db.query(PharmacyStaff).filter(PharmacyStaff.user_id == user.id).first()

    return {
        "user": UserResponse.model_validate(user).model_dump(),
        "household_id": household_id,
        "household_name": household_name,
        "access_role": access_role,
        "permissions": permissions,
        "authorized_households": authorized_households,
        "pharmacy_id": ph_staff.pharmacy_id if ph_staff else None,
        "session_expires_at": session_expires_at,
    }


@router.put("/me", response_model=UserResponse)
def update_my_profile(
    data: UserProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.full_name is not None and data.full_name.strip():
        user.full_name = data.full_name.strip()
    if data.phone is not None:
        user.phone = data.phone.strip() or None
    if data.preferred_language is not None:
        user.preferred_language = sanitize_language_code(data.preferred_language)
    user.updated_at = utcnow_naive()
    db.commit()
    db.refresh(user)
    return user


@router.put("/household", response_model=HouseholdResponse)
def update_my_household(
    data: HouseholdCreateOrUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = resolve_household_access(db, user, require_owner=True)
    hh = ctx.household
    hh.name = data.name.strip()
    hh.address_city = data.address_city
    hh.postal_code = data.postal_code
    hh.latitude = data.latitude
    hh.longitude = data.longitude
    db.commit()
    db.refresh(hh)
    return hh


@router.post("/forgot-password", dependencies=[Depends(rate_limit_auth)])
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    user = db.query(User).filter(User.email == email, User.is_active == True).first()

    response_payload = {
        "success": True,
        "message": "If an account exists for that email, a password reset instruction has been issued.",
    }

    if user:
        raw_reset_token = secrets.token_urlsafe(24)
        now = utcnow_naive()
        reset_rec = PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(raw_reset_token),
            expires_at=now + datetime.timedelta(minutes=30),
            created_at=now,
        )
        db.add(reset_rec)
        db.commit()

        if settings.ENVIRONMENT.lower() == "development":
            response_payload["dev_reset_token"] = raw_reset_token
            response_payload["dev_notice"] = (
                "Development mode preview token returned because SMTP email transport is not configured."
            )

    return response_payload


@router.post("/reset-password", dependencies=[Depends(rate_limit_auth)])
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    now = utcnow_naive()
    rec = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.token_hash == hash_token(data.token.strip()),
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
        .first()
    )
    if not rec:
        raise HTTPException(status_code=400, detail="Invalid or expired password reset token.")

    user = db.query(User).filter(User.id == rec.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")

    user.password_hash = hash_password(data.new_password)
    user.updated_at = now
    rec.used_at = now

    # Revoke all active sessions on password reset
    db.query(UserSession).filter(
        UserSession.user_id == user.id,
        UserSession.revoked_at.is_(None),
    ).update({"revoked_at": now})

    db.commit()
    return {"success": True, "message": "Password updated and previous sessions revoked. Please log in."}
