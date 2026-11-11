import datetime
import uuid
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from backend.app.database import Base


def utcnow_naive() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def generate_passport_token() -> str:
    return f"MDP-{uuid.uuid4().hex[:16].upper()}"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(160), unique=True, nullable=False, index=True)
    full_name = Column(String(120), nullable=False)
    phone = Column(String(30), nullable=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(40), nullable=False, default="HOUSEHOLD_OWNER", index=True)
    # Roles: HOUSEHOLD_OWNER, CAREGIVER, HOUSEHOLD_MEMBER, PHARMACY_STAFF, PLATFORM_ADMIN
    preferred_language = Column(String(10), nullable=False, default="en")
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow_naive)
    updated_at = Column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)

    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    owned_households = relationship("Household", back_populates="owner_user")
    pharmacy_memberships = relationship("PharmacyStaff", back_populates="user", cascade="all, delete-orphan")


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(128), unique=True, nullable=False, index=True)
    device_info = Column(String(200), nullable=True)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow_naive)

    user = relationship("User", back_populates="sessions")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(128), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow_naive)


class Household(Base):
    __tablename__ = "households"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    address_city = Column(String(100), nullable=True)
    postal_code = Column(String(20), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    created_at = Column(DateTime, default=utcnow_naive)

    owner_user = relationship("User", back_populates="owned_households")
    members = relationship("HouseholdMember", back_populates="household", cascade="all, delete-orphan")
    medicines = relationship("MedicineRecord", back_populates="household", cascade="all, delete-orphan")
    prescriptions = relationship("Prescription", back_populates="household", cascade="all, delete-orphan")
    caregiver_permissions = relationship(
        "CaregiverPermission", back_populates="household", cascade="all, delete-orphan"
    )


class HouseholdMember(Base):
    __tablename__ = "household_members"

    id = Column(Integer, primary_key=True, index=True)
    household_id = Column(Integer, ForeignKey("households.id"), nullable=False, index=True)
    linked_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    name = Column(String(100), nullable=False)
    relationship_role = Column(String(50), default="Self")
    age = Column(Integer, nullable=True)
    allergies = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    preferred_language = Column(String(10), nullable=False, default="en")
    created_at = Column(DateTime, default=utcnow_naive)

    household = relationship("Household", back_populates="members")
    medicines = relationship("MedicineRecord", back_populates="assigned_member")
    schedules = relationship("MedicationSchedule", back_populates="member")
    prescriptions = relationship("Prescription", back_populates="member")


class CaregiverInvitation(Base):
    __tablename__ = "caregiver_invitations"

    id = Column(Integer, primary_key=True, index=True)
    household_id = Column(Integer, ForeignKey("households.id"), nullable=False, index=True)
    invited_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    caregiver_email = Column(String(160), nullable=False, index=True)
    caregiver_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    invite_token = Column(String(64), unique=True, nullable=False, index=True)
    status = Column(String(30), default="PENDING", nullable=False)  # PENDING, ACCEPTED, DECLINED, REVOKED
    can_view_medicines = Column(Boolean, default=True, nullable=False)
    can_edit_medicines = Column(Boolean, default=False, nullable=False)
    can_view_prescriptions = Column(Boolean, default=False, nullable=False)
    can_manage_schedules = Column(Boolean, default=True, nullable=False)
    can_record_doses = Column(Boolean, default=True, nullable=False)
    can_view_notifications = Column(Boolean, default=True, nullable=False)
    can_manage_refills = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utcnow_naive)
    responded_at = Column(DateTime, nullable=True)


class CaregiverPermission(Base):
    __tablename__ = "caregiver_permissions"
    __table_args__ = (
        UniqueConstraint("household_id", "caregiver_user_id", name="uq_caregiver_household"),
    )

    id = Column(Integer, primary_key=True, index=True)
    household_id = Column(Integer, ForeignKey("households.id"), nullable=False, index=True)
    caregiver_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    can_view_medicines = Column(Boolean, default=True, nullable=False)
    can_edit_medicines = Column(Boolean, default=False, nullable=False)
    can_view_prescriptions = Column(Boolean, default=False, nullable=False)
    can_manage_schedules = Column(Boolean, default=True, nullable=False)
    can_record_doses = Column(Boolean, default=True, nullable=False)
    can_view_notifications = Column(Boolean, default=True, nullable=False)
    can_manage_refills = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow_naive)
    updated_at = Column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)

    household = relationship("Household", back_populates="caregiver_permissions")
    caregiver_user = relationship("User")


class Prescription(Base):
    __tablename__ = "prescriptions"

    id = Column(Integer, primary_key=True, index=True)
    household_id = Column(Integer, ForeignKey("households.id"), nullable=False, index=True)
    member_id = Column(Integer, ForeignKey("household_members.id"), nullable=True, index=True)
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    title = Column(String(160), nullable=False)
    doctor_name = Column(String(120), nullable=True)
    clinic_name = Column(String(150), nullable=True)
    prescribed_date = Column(String(20), nullable=False, index=True)
    valid_until = Column(String(20), nullable=True, index=True)
    notes = Column(Text, nullable=True)
    original_filename = Column(String(255), nullable=False)
    mime_type = Column(String(80), nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    storage_key = Column(String(255), unique=True, nullable=False)
    ocr_extracted_text = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow_naive)

    household = relationship("Household", back_populates="prescriptions")
    member = relationship("HouseholdMember", back_populates="prescriptions")
    medicines = relationship("MedicineRecord", back_populates="prescription")


class MedicineRecord(Base):
    __tablename__ = "medicine_records"

    id = Column(Integer, primary_key=True, index=True)
    household_id = Column(Integer, ForeignKey("households.id"), nullable=True, default=1, index=True)
    medicine_name = Column(String(150), nullable=False, index=True)
    brand = Column(String(100), nullable=True)
    strength = Column(String(50), nullable=True)
    dosage_form = Column(String(50), default="Tablet")
    manufacturer = Column(String(120), nullable=True)
    category = Column(String(60), default="General")
    prescribed_dosage = Column(String(120), nullable=True)
    prescription_required = Column(Boolean, default=False)
    batch_number = Column(String(50), nullable=True)
    manufacturing_date = Column(String(20), nullable=True)
    printed_expiry_date = Column(String(20), nullable=False, index=True)
    purchase_date = Column(String(20), nullable=True)
    opened_date = Column(String(20), nullable=True)
    quantity = Column(Integer, default=1)
    quantity_unit = Column(String(30), default="units")
    stock_threshold = Column(Integer, default=5)
    storage_instructions = Column(
        String(255), default="Store in a cool, dry place below 25°C away from direct sunlight."
    )
    notes = Column(Text, nullable=True)
    package_photo_url = Column(Text, nullable=True)
    prescription_url = Column(Text, nullable=True)
    prescription_id = Column(Integer, ForeignKey("prescriptions.id"), nullable=True)
    assigned_member_id = Column(Integer, ForeignKey("household_members.id"), nullable=True)
    passport_token = Column(String(64), unique=True, nullable=True, default=generate_passport_token, index=True)
    data_source = Column(String(30), default="MANUAL")
    is_confirmed = Column(Boolean, default=True)
    is_disposed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow_naive)
    updated_at = Column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)

    household = relationship("Household", back_populates="medicines")
    assigned_member = relationship("HouseholdMember", back_populates="medicines")
    prescription = relationship("Prescription", back_populates="medicines")
    notifications = relationship("ExpiryNotification", back_populates="medicine", cascade="all, delete-orphan")
    schedules = relationship("MedicationSchedule", back_populates="medicine", cascade="all, delete-orphan")
    event_history = relationship("MedicineEventHistory", back_populates="medicine", cascade="all, delete-orphan")
    disposal_record = relationship(
        "DisposalRecord", back_populates="medicine", uselist=False, cascade="all, delete-orphan"
    )
    refill_prediction = relationship(
        "RefillPrediction", back_populates="medicine", uselist=False, cascade="all, delete-orphan"
    )


class ExpiryNotification(Base):
    __tablename__ = "expiry_notifications"

    id = Column(Integer, primary_key=True, index=True)
    household_id = Column(Integer, ForeignKey("households.id"), nullable=True, default=1, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    medicine_id = Column(Integer, ForeignKey("medicine_records.id"), nullable=True)
    notification_type = Column(String(40), default="EXPIRY", nullable=False, index=True)
    # Types: EXPIRY, LOW_STOCK, REFILL, PRESCRIPTION_VALIDITY, CAREGIVER, REFILL_REQUEST, ORDER
    reference_id = Column(Integer, nullable=True)
    severity = Column(String(20), default="WARNING")  # INFO, WARNING, CRITICAL
    threshold_days = Column(Integer, nullable=False, default=0)
    message = Column(String(255), nullable=False)
    is_read = Column(Boolean, default=False)
    triggered_at = Column(DateTime, default=utcnow_naive)

    medicine = relationship("MedicineRecord", back_populates="notifications")


class MedicationSchedule(Base):
    __tablename__ = "medication_schedules"

    id = Column(Integer, primary_key=True, index=True)
    medicine_id = Column(Integer, ForeignKey("medicine_records.id"), nullable=False)
    member_id = Column(Integer, ForeignKey("household_members.id"), nullable=True)
    reminder_time = Column(String(10), nullable=False)
    frequency = Column(String(50), default="Daily")
    days_of_week = Column(String(50), default="Mon,Tue,Wed,Thu,Fri,Sat,Sun")
    dose_quantity = Column(Integer, default=1)
    status = Column(String(20), default="ACTIVE")
    created_at = Column(DateTime, default=utcnow_naive)

    medicine = relationship("MedicineRecord", back_populates="schedules")
    member = relationship("HouseholdMember", back_populates="schedules")
    logs = relationship("ScheduleLog", back_populates="schedule", cascade="all, delete-orphan")


class ScheduleLog(Base):
    __tablename__ = "schedule_logs"

    id = Column(Integer, primary_key=True, index=True)
    schedule_id = Column(Integer, ForeignKey("medication_schedules.id"), nullable=False)
    logged_at = Column(DateTime, default=utcnow_naive)
    status = Column(String(20), nullable=False)  # TAKEN, SKIPPED, SNOOZED
    notes = Column(String(255), nullable=True)

    schedule = relationship("MedicationSchedule", back_populates="logs")


class RefillPrediction(Base):
    __tablename__ = "refill_predictions"

    id = Column(Integer, primary_key=True, index=True)
    household_id = Column(Integer, ForeignKey("households.id"), nullable=False, index=True)
    medicine_id = Column(Integer, ForeignKey("medicine_records.id"), unique=True, nullable=False)
    schedule_id = Column(Integer, ForeignKey("medication_schedules.id"), nullable=True)
    estimated_daily_consumption = Column(Float, nullable=False, default=0.0)
    remaining_days = Column(Integer, nullable=True)
    estimated_depletion_date = Column(String(20), nullable=True)
    suggested_refill_date = Column(String(20), nullable=True)
    confidence_level = Column(String(30), nullable=False, default="LOW")
    # HIGH, MEDIUM, LOW, AS_NEEDED_ESTIMATE
    adherence_ratio = Column(Float, nullable=True)
    calculation_notes = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)

    medicine = relationship("MedicineRecord", back_populates="refill_prediction")


class MedicineEventHistory(Base):
    __tablename__ = "medicine_event_history"

    id = Column(Integer, primary_key=True, index=True)
    household_id = Column(Integer, ForeignKey("households.id"), nullable=True, default=1, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    medicine_id = Column(Integer, ForeignKey("medicine_records.id"), nullable=False)
    action = Column(String(50), nullable=False)
    timestamp = Column(DateTime, default=utcnow_naive)
    description = Column(String(255), nullable=False)
    quantity_delta = Column(Integer, default=0)

    medicine = relationship("MedicineRecord", back_populates="event_history")


class DisposalRecord(Base):
    __tablename__ = "disposal_records"

    id = Column(Integer, primary_key=True, index=True)
    household_id = Column(Integer, ForeignKey("households.id"), nullable=True, default=1, index=True)
    medicine_id = Column(Integer, ForeignKey("medicine_records.id"), nullable=False, unique=True)
    member_id = Column(Integer, ForeignKey("household_members.id"), nullable=True)
    disposed_date = Column(String(20), nullable=False)
    disposal_method = Column(String(100), default="Returned to Pharmacy Take-Back Facility")
    quantity_disposed = Column(Integer, default=0)
    reason = Column(String(120), default="Expired")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow_naive)

    medicine = relationship("MedicineRecord", back_populates="disposal_record")


class Pharmacy(Base):
    __tablename__ = "pharmacies"

    id = Column(Integer, primary_key=True, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(150), nullable=False, index=True)
    license_number = Column(String(80), nullable=False)
    address = Column(String(255), nullable=False)
    city = Column(String(80), nullable=False, index=True)
    state = Column(String(80), nullable=True)
    postal_code = Column(String(20), nullable=True)
    phone = Column(String(30), nullable=False)
    email = Column(String(160), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    coordinates_verified = Column(Boolean, default=False, nullable=False)
    business_hours = Column(String(120), default="08:00 AM - 10:00 PM")
    supports_pickup = Column(Boolean, default=True, nullable=False)
    supports_delivery = Column(Boolean, default=True, nullable=False)
    delivery_radius_km = Column(Float, default=10.0)
    estimated_fulfilment_note = Column(String(160), default="Usually ready in 30-45 mins")
    verification_status = Column(String(30), default="PENDING", nullable=False, index=True)
    # PENDING, VERIFIED, REJECTED
    data_origin = Column(String(30), default="PARTNER_REGISTERED", nullable=False)
    # SAMPLE_DEMO or PARTNER_REGISTERED
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow_naive)
    updated_at = Column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)

    staff = relationship("PharmacyStaff", back_populates="pharmacy", cascade="all, delete-orphan")
    medicines = relationship("PharmacyMedicine", back_populates="pharmacy", cascade="all, delete-orphan")


class PharmacyStaff(Base):
    __tablename__ = "pharmacy_staff"
    __table_args__ = (
        UniqueConstraint("pharmacy_id", "user_id", name="uq_pharmacy_staff_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    pharmacy_id = Column(Integer, ForeignKey("pharmacies.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    staff_role = Column(String(30), default="OWNER", nullable=False)
    created_at = Column(DateTime, default=utcnow_naive)

    pharmacy = relationship("Pharmacy", back_populates="staff")
    user = relationship("User", back_populates="pharmacy_memberships")


class PharmacyMedicine(Base):
    __tablename__ = "pharmacy_medicines"

    id = Column(Integer, primary_key=True, index=True)
    pharmacy_id = Column(Integer, ForeignKey("pharmacies.id"), nullable=False, index=True)
    medicine_name = Column(String(150), nullable=False, index=True)
    generic_name = Column(String(150), nullable=True, index=True)
    brand = Column(String(100), nullable=True)
    strength = Column(String(50), nullable=True)
    dosage_form = Column(String(50), default="Tablet")
    manufacturer = Column(String(120), nullable=True)
    category = Column(String(60), default="General")
    prescription_required = Column(Boolean, default=False, nullable=False)
    unit_price_paise = Column(Integer, nullable=False, default=0)
    stock_quantity = Column(Integer, nullable=False, default=0)
    reserved_quantity = Column(Integer, nullable=False, default=0)
    is_available = Column(Boolean, default=True, nullable=False)
    inventory_source = Column(String(30), default="SAMPLE_DEMO", nullable=False)
    # SAMPLE_DEMO or VERIFIED_LIVE
    updated_at = Column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)

    pharmacy = relationship("Pharmacy", back_populates="medicines")
    transactions = relationship(
        "InventoryTransaction", back_populates="pharmacy_medicine", cascade="all, delete-orphan"
    )


class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"

    id = Column(Integer, primary_key=True, index=True)
    pharmacy_medicine_id = Column(Integer, ForeignKey("pharmacy_medicines.id"), nullable=False, index=True)
    pharmacy_id = Column(Integer, ForeignKey("pharmacies.id"), nullable=False, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    tx_type = Column(String(30), nullable=False)  # RESTOCK, ADJUSTMENT, RESERVE, RELEASE, FULFILL
    quantity_change = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    reference_type = Column(String(40), nullable=True)
    reference_id = Column(Integer, nullable=True)
    notes = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=utcnow_naive)

    pharmacy_medicine = relationship("PharmacyMedicine", back_populates="transactions")


class RefillRequest(Base):
    __tablename__ = "refill_requests"

    id = Column(Integer, primary_key=True, index=True)
    household_id = Column(Integer, ForeignKey("households.id"), nullable=False, index=True)
    requested_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    pharmacy_id = Column(Integer, ForeignKey("pharmacies.id"), nullable=False, index=True)
    medicine_record_id = Column(Integer, ForeignKey("medicine_records.id"), nullable=True)
    pharmacy_medicine_id = Column(Integer, ForeignKey("pharmacy_medicines.id"), nullable=True)
    prescription_id = Column(Integer, ForeignKey("prescriptions.id"), nullable=True)
    medicine_name = Column(String(150), nullable=False)
    requested_quantity = Column(Integer, nullable=False, default=1)
    fulfilment_type = Column(String(20), default="PICKUP", nullable=False)  # PICKUP, DELIVERY
    delivery_address = Column(String(255), nullable=True)
    status = Column(String(30), default="PENDING", nullable=False, index=True)
    pharmacist_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow_naive)
    updated_at = Column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)


class PharmacyOrder(Base):
    __tablename__ = "pharmacy_orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String(40), unique=True, nullable=False, index=True)
    household_id = Column(Integer, ForeignKey("households.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    pharmacy_id = Column(Integer, ForeignKey("pharmacies.id"), nullable=False, index=True)
    prescription_id = Column(Integer, ForeignKey("prescriptions.id"), nullable=True)
    fulfilment_type = Column(String(20), default="PICKUP", nullable=False)  # PICKUP, DELIVERY
    delivery_address = Column(String(255), nullable=True)
    payment_method = Column(String(30), default="PAY_AT_PICKUP", nullable=False)
    payment_status = Column(String(40), default="UNPAID_PAY_AT_PICKUP", nullable=False)
    status = Column(String(30), default="PENDING", nullable=False, index=True)
    total_amount_paise = Column(Integer, nullable=False, default=0)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow_naive)
    updated_at = Column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)

    items = relationship("PharmacyOrderItem", back_populates="order", cascade="all, delete-orphan")
    status_history = relationship("OrderStatusHistory", back_populates="order", cascade="all, delete-orphan")


class PharmacyOrderItem(Base):
    __tablename__ = "pharmacy_order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("pharmacy_orders.id"), nullable=False, index=True)
    pharmacy_medicine_id = Column(Integer, ForeignKey("pharmacy_medicines.id"), nullable=False)
    medicine_name = Column(String(150), nullable=False)
    strength = Column(String(50), nullable=True)
    quantity = Column(Integer, nullable=False)
    unit_price_paise = Column(Integer, nullable=False)
    line_total_paise = Column(Integer, nullable=False)

    order = relationship("PharmacyOrder", back_populates="items")


class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("pharmacy_orders.id"), nullable=False, index=True)
    status = Column(String(30), nullable=False)
    changed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=utcnow_naive)

    order = relationship("PharmacyOrder", back_populates="status_history")


class CanonicalMedicineCatalog(Base):
    __tablename__ = "canonical_medicines"

    id = Column(Integer, primary_key=True, index=True)
    canonical_code = Column(String(60), unique=True, nullable=False, index=True)
    canonical_name = Column(String(180), nullable=False, index=True)
    generic_name = Column(String(180), nullable=False, index=True)
    active_ingredient = Column(String(180), nullable=False)
    brand_names_json = Column(Text, nullable=False, default="[]")
    strength = Column(String(80), nullable=True)
    dosage_form = Column(String(60), nullable=True)
    therapeutic_category = Column(String(100), nullable=True)
    simple_explanation = Column(Text, nullable=True)
    review_status = Column(String(30), nullable=False, default="APPROVED")  # APPROVED, NEEDS_REVIEW
    verified_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow_naive)
    updated_at = Column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)

    aliases = relationship(
        "MedicineMultilingualAlias",
        back_populates="canonical_medicine",
        cascade="all, delete-orphan",
    )


class MedicineMultilingualAlias(Base):
    __tablename__ = "medicine_multilingual_aliases"

    id = Column(Integer, primary_key=True, index=True)
    canonical_medicine_id = Column(
        Integer, ForeignKey("canonical_medicines.id"), nullable=False, index=True
    )
    language_code = Column(String(10), nullable=False, index=True)
    alias_text = Column(String(220), nullable=False, index=True)
    normalized_alias = Column(String(220), nullable=False, index=True)
    alias_type = Column(String(40), nullable=False, default="SYMPTOM_OR_USE")
    # Types: GENERIC, BRAND, SYMPTOM_OR_USE, INDICATION, PHONETIC_VARIANT
    script_name = Column(String(40), nullable=True)
    review_status = Column(String(30), nullable=False, default="APPROVED", index=True)
    # Statuses: APPROVED, DRAFT_MACHINE, PENDING_REVIEW
    notes = Column(String(255), nullable=True)
    approved_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow_naive)

    canonical_medicine = relationship("CanonicalMedicineCatalog", back_populates="aliases")
