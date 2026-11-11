import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


# --- Auth & User Schemas ---
class UserRegisterRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=160)
    password: str = Field(..., min_length=8, max_length=72)
    full_name: str = Field(..., min_length=2, max_length=120)
    phone: Optional[str] = None
    role: str = "HOUSEHOLD_OWNER"
    household_name: Optional[str] = None
    preferred_language: str = "en"


class UserLoginRequest(BaseModel):
    email: str
    password: str
    device_info: Optional[str] = "Medora Web Client"


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=72)


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    preferred_language: Optional[str] = None


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    phone: Optional[str] = None
    role: str
    preferred_language: str
    is_active: bool
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class AuthSessionResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime.datetime
    user: UserResponse
    household_id: Optional[int] = None
    household_name: Optional[str] = None
    access_role: Optional[str] = None
    permissions: Optional[Dict[str, bool]] = None
    pharmacy_id: Optional[int] = None


# --- Household & Member Schemas ---
class HouseholdCreateOrUpdate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    address_city: Optional[str] = None
    postal_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class HouseholdResponse(BaseModel):
    id: int
    name: str
    owner_user_id: Optional[int] = None
    address_city: Optional[str] = None
    postal_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class HouseholdMemberBase(BaseModel):
    name: str
    relationship_role: str = "Self"
    age: Optional[int] = None
    allergies: Optional[str] = None
    notes: Optional[str] = None
    preferred_language: str = "en"


class HouseholdMemberCreate(HouseholdMemberBase):
    household_id: Optional[int] = None


class HouseholdMemberResponse(HouseholdMemberBase):
    id: int
    household_id: int
    linked_user_id: Optional[int] = None
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


# --- Caregiver Schemas ---
class CaregiverPermissionFlags(BaseModel):
    can_view_medicines: bool = True
    can_edit_medicines: bool = False
    can_view_prescriptions: bool = False
    can_manage_schedules: bool = True
    can_record_doses: bool = True
    can_view_notifications: bool = True
    can_manage_refills: bool = False


class CaregiverInviteCreate(CaregiverPermissionFlags):
    caregiver_email: str = Field(..., min_length=5, max_length=160)


class CaregiverInviteResponse(CaregiverPermissionFlags):
    id: int
    household_id: int
    caregiver_email: str
    status: str
    invite_token: str
    created_at: datetime.datetime
    responded_at: Optional[datetime.datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CaregiverAccessResponse(CaregiverPermissionFlags):
    id: int
    household_id: int
    caregiver_user_id: int
    caregiver_name: Optional[str] = None
    caregiver_email: Optional[str] = None
    is_active: bool
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


# --- Medicine Schemas ---
class MedicineBase(BaseModel):
    medicine_name: str
    brand: Optional[str] = None
    strength: Optional[str] = None
    dosage_form: str = "Tablet"
    manufacturer: Optional[str] = None
    category: str = "General"
    prescribed_dosage: Optional[str] = None
    prescription_required: bool = False
    batch_number: Optional[str] = None
    manufacturing_date: Optional[str] = None
    printed_expiry_date: str
    purchase_date: Optional[str] = None
    opened_date: Optional[str] = None
    quantity: int = Field(default=1, ge=0)
    quantity_unit: str = "units"
    stock_threshold: int = Field(default=5, ge=0)
    storage_instructions: Optional[str] = "Store in a cool, dry place below 25°C."
    notes: Optional[str] = None
    package_photo_url: Optional[str] = None
    prescription_url: Optional[str] = None
    prescription_id: Optional[int] = None
    assigned_member_id: Optional[int] = None
    data_source: str = "MANUAL"
    is_confirmed: bool = True


class MedicineCreate(MedicineBase):
    pass


class MedicineUpdate(BaseModel):
    medicine_name: Optional[str] = None
    brand: Optional[str] = None
    strength: Optional[str] = None
    dosage_form: Optional[str] = None
    manufacturer: Optional[str] = None
    category: Optional[str] = None
    prescribed_dosage: Optional[str] = None
    prescription_required: Optional[bool] = None
    batch_number: Optional[str] = None
    manufacturing_date: Optional[str] = None
    printed_expiry_date: Optional[str] = None
    purchase_date: Optional[str] = None
    opened_date: Optional[str] = None
    quantity: Optional[int] = Field(default=None, ge=0)
    quantity_unit: Optional[str] = None
    stock_threshold: Optional[int] = Field(default=None, ge=0)
    storage_instructions: Optional[str] = None
    notes: Optional[str] = None
    package_photo_url: Optional[str] = None
    prescription_url: Optional[str] = None
    prescription_id: Optional[int] = None
    assigned_member_id: Optional[int] = None
    is_confirmed: Optional[bool] = None


class MedicineResponse(MedicineBase):
    id: int
    household_id: Optional[int] = 1
    passport_token: Optional[str] = None
    is_disposed: bool
    created_at: datetime.datetime
    updated_at: datetime.datetime
    days_until_expiry: Optional[int] = None
    expiry_status: Optional[str] = None
    assigned_member: Optional[HouseholdMemberResponse] = None

    model_config = ConfigDict(from_attributes=True)


# --- Prescription Schemas ---
class PrescriptionResponse(BaseModel):
    id: int
    household_id: int
    member_id: Optional[int] = None
    member_name: Optional[str] = None
    title: str
    doctor_name: Optional[str] = None
    clinic_name: Optional[str] = None
    prescribed_date: str
    valid_until: Optional[str] = None
    days_until_expiry: Optional[int] = None
    notes: Optional[str] = None
    original_filename: str
    mime_type: str
    file_size_bytes: int
    ocr_extracted_text: Optional[str] = None
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


# --- Refill Prediction Schemas ---
class RefillPredictionResponse(BaseModel):
    id: int
    household_id: int
    medicine_id: int
    medicine_name: Optional[str] = None
    current_quantity: Optional[int] = None
    quantity_unit: Optional[str] = None
    schedule_id: Optional[int] = None
    frequency: Optional[str] = None
    estimated_daily_consumption: float
    remaining_days: Optional[int] = None
    estimated_depletion_date: Optional[str] = None
    suggested_refill_date: Optional[str] = None
    confidence_level: str
    adherence_ratio: Optional[float] = None
    calculation_notes: Optional[str] = None
    updated_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


# --- Notification Schemas ---
class NotificationResponse(BaseModel):
    id: int
    household_id: Optional[int] = 1
    medicine_id: Optional[int] = None
    notification_type: str = "EXPIRY"
    reference_id: Optional[int] = None
    severity: str = "WARNING"
    threshold_days: int = 0
    message: str
    is_read: bool
    triggered_at: datetime.datetime
    medicine_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# --- Schedule Schemas ---
class ScheduleCreate(BaseModel):
    medicine_id: int
    member_id: Optional[int] = None
    reminder_time: str
    frequency: str = "Daily"
    days_of_week: str = "Mon,Tue,Wed,Thu,Fri,Sat,Sun"
    dose_quantity: int = Field(default=1, ge=1)


class ScheduleResponse(BaseModel):
    id: int
    medicine_id: int
    member_id: Optional[int] = None
    reminder_time: str
    frequency: str
    days_of_week: str
    dose_quantity: int
    status: str
    created_at: datetime.datetime
    medicine_name: Optional[str] = None
    estimated_depletion_date: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ScheduleLogCreate(BaseModel):
    schedule_id: int
    status: str
    notes: Optional[str] = None


# --- Disposal Schemas ---
class DisposalCreate(BaseModel):
    medicine_id: int
    disposed_date: str
    disposal_method: str = "Pharmacy Take-Back Facility"
    reason: str = "Expired"
    notes: Optional[str] = None


class DisposalResponse(BaseModel):
    id: int
    medicine_id: int
    member_id: Optional[int] = None
    disposed_date: str
    disposal_method: str
    quantity_disposed: int = 0
    reason: Optional[str] = "Expired"
    notes: Optional[str] = None
    created_at: datetime.datetime
    medicine_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# --- Dashboard Summary Schema ---
class DashboardSummary(BaseModel):
    total_active_medicines: int
    expiring_soon_count: int
    already_expired_count: int
    low_stock_count: int
    unconfirmed_count: int
    upcoming_reminders_count: int
    upcoming_refills_count: int = 0
    household_members_count: int
    recent_activity: List[dict]


# --- Pharmacy Ecosystem Schemas ---
class PharmacyRegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    license_number: str = Field(..., min_length=3, max_length=80)
    address: str
    city: str
    state: Optional[str] = None
    postal_code: Optional[str] = None
    phone: str
    email: Optional[str] = None
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    business_hours: str = "08:00 AM - 10:00 PM"
    supports_pickup: bool = True
    supports_delivery: bool = True
    delivery_radius_km: float = 10.0
    estimated_fulfilment_note: str = "Usually ready in 30-45 mins"


class PharmacyCoordinateUpdate(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    coordinates_verified: bool = True


class PharmacyResponse(BaseModel):
    id: int
    name: str
    license_number: str
    address: str
    city: str
    state: Optional[str] = None
    postal_code: Optional[str] = None
    phone: str
    email: Optional[str] = None
    latitude: float
    longitude: float
    coordinates_verified: bool = False
    coordinates_valid: bool = True
    location_needs_verification: bool = False
    business_hours: Optional[str] = None
    supports_pickup: bool
    supports_delivery: bool
    delivery_radius_km: Optional[float] = None
    estimated_fulfilment_note: Optional[str] = None
    verification_status: str
    data_origin: str
    is_active: bool
    distance_km: Optional[float] = None
    is_open_now: Optional[bool] = None
    updated_at: Optional[datetime.datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PharmacyMedicineCreate(BaseModel):
    medicine_name: str
    generic_name: Optional[str] = None
    brand: Optional[str] = None
    strength: Optional[str] = None
    dosage_form: str = "Tablet"
    manufacturer: Optional[str] = None
    category: str = "General"
    prescription_required: bool = False
    unit_price: float = Field(..., ge=0)
    stock_quantity: int = Field(..., ge=0)
    is_available: bool = True
    inventory_source: str = "VERIFIED_LIVE"


class PharmacyMedicineUpdate(BaseModel):
    unit_price: Optional[float] = Field(default=None, ge=0)
    stock_quantity: Optional[int] = Field(default=None, ge=0)
    is_available: Optional[bool] = None
    prescription_required: Optional[bool] = None
    notes: Optional[str] = None


class PharmacyMedicineResponse(BaseModel):
    id: int
    pharmacy_id: int
    medicine_name: str
    generic_name: Optional[str] = None
    brand: Optional[str] = None
    strength: Optional[str] = None
    dosage_form: Optional[str] = None
    manufacturer: Optional[str] = None
    category: Optional[str] = None
    prescription_required: bool
    unit_price: float
    stock_quantity: int
    reserved_quantity: int
    available_quantity: int
    is_available: bool
    inventory_source: str
    pharmacy_name: Optional[str] = None
    pharmacy_city: Optional[str] = None
    pharmacy_address: Optional[str] = None
    verification_status: Optional[str] = None
    distance_km: Optional[float] = None
    supports_pickup: Optional[bool] = None
    supports_delivery: Optional[bool] = None
    updated_at: Optional[datetime.datetime] = None


class RefillRequestCreate(BaseModel):
    pharmacy_id: int
    medicine_record_id: Optional[int] = None
    pharmacy_medicine_id: Optional[int] = None
    prescription_id: Optional[int] = None
    medicine_name: str
    requested_quantity: int = Field(default=1, ge=1)
    fulfilment_type: str = "PICKUP"
    delivery_address: Optional[str] = None


class RefillRequestStatusUpdate(BaseModel):
    status: str
    pharmacist_notes: Optional[str] = None


class RefillRequestResponse(BaseModel):
    id: int
    household_id: int
    pharmacy_id: int
    pharmacy_name: Optional[str] = None
    medicine_record_id: Optional[int] = None
    pharmacy_medicine_id: Optional[int] = None
    prescription_id: Optional[int] = None
    medicine_name: str
    requested_quantity: int
    fulfilment_type: str
    delivery_address: Optional[str] = None
    status: str
    pharmacist_notes: Optional[str] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class OrderItemCreate(BaseModel):
    pharmacy_medicine_id: int
    quantity: int = Field(..., ge=1)


class PharmacyOrderCreate(BaseModel):
    pharmacy_id: int
    prescription_id: Optional[int] = None
    fulfilment_type: str = "PICKUP"
    delivery_address: Optional[str] = None
    payment_method: str = "PAY_AT_PICKUP"
    notes: Optional[str] = None
    items: List[OrderItemCreate] = Field(..., min_length=1)


class OrderStatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None


class PharmacyOrderItemResponse(BaseModel):
    id: int
    pharmacy_medicine_id: int
    medicine_name: str
    strength: Optional[str] = None
    quantity: int
    unit_price: float
    line_total: float


class PharmacyOrderResponse(BaseModel):
    id: int
    order_number: str
    household_id: int
    pharmacy_id: int
    pharmacy_name: Optional[str] = None
    prescription_id: Optional[int] = None
    fulfilment_type: str
    delivery_address: Optional[str] = None
    payment_method: str
    payment_status: str
    status: str
    total_amount: float
    notes: Optional[str] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime
    items: List[PharmacyOrderItemResponse]
    status_history: List[dict]


# --- Multilingual NLP Medicine Search & Controlled LLM Schemas ---
class NlpMedicineSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=250)
    preferred_language: str = "en"
    limit: int = Field(8, ge=1, le=25)
    include_pharmacy_counts: bool = True
    use_llm_assist: bool = False


class MedicineAliasCreateRequest(BaseModel):
    language_code: str
    alias_text: str = Field(..., min_length=1, max_length=220)
    alias_type: str = "SYMPTOM_OR_USE"
    notes: Optional[str] = None


class MedicineAliasReviewRequest(BaseModel):
    review_status: str  # APPROVED, REJECTED/PENDING_REVIEW
    notes: Optional[str] = None


class LlmTermExplainRequest(BaseModel):
    term: str = Field(..., min_length=1, max_length=150)
    target_language: str = "en"


class LlmTranslationDraftRequest(BaseModel):
    source_text: str = Field(..., min_length=1, max_length=400)
    target_language: str = "te"
    concept_domain: str = "pharmacy_ui"

