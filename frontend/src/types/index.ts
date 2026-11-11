export type Language =
  | 'en'
  | 'ta'
  | 'hi'
  | 'te'
  | 'kn'
  | 'ml'
  | 'bn'
  | 'mr'
  | 'gu'
  | 'pa'
  | 'or'
  | 'ur'
  | 'as';

export interface LanguageMetadata {
  code: Language;
  nativeName: string;
  englishName: string;
  script: string;
  direction: 'ltr' | 'rtl';
  speechCode: string;
  voiceSupport: 'browser_tested' | 'experimental_bcp47' | 'text_fallback';
  reviewStatus: 'AUDITED_BASELINE' | 'AUTHORED_AWAITING_NATIVE_REVIEW';
}

export type ExpiryStatus =
  | 'EXPIRED'
  | 'EXPIRES_TODAY'
  | 'CRITICAL_1D'
  | 'URGENT_3D'
  | 'APPROACHING_5D'
  | 'NOTICE_10D'
  | 'SAFE';

export type DataSource = 'MANUAL' | 'OCR' | 'BARCODE';

export type UserRole =
  | 'HOUSEHOLD_OWNER'
  | 'CAREGIVER'
  | 'HOUSEHOLD_MEMBER'
  | 'PHARMACY_STAFF'
  | 'PLATFORM_ADMIN';

export interface UserProfile {
  id: number;
  email: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  preferred_language: Language;
  is_active: boolean;
  created_at?: string;
}

export interface CaregiverPermissions {
  can_view_medicines: boolean;
  can_edit_medicines: boolean;
  can_view_prescriptions: boolean;
  can_manage_schedules: boolean;
  can_record_doses: boolean;
  can_view_notifications: boolean;
  can_manage_refills: boolean;
  is_owner?: boolean;
}

export interface AuthorizedHouseholdSummary {
  id: number;
  name: string;
  access_role: 'OWNER' | 'CAREGIVER' | 'MEMBER';
}

export interface HouseholdMember {
  id: number;
  household_id: number;
  linked_user_id?: number;
  name: string;
  relationship_role: string;
  age?: number;
  allergies?: string;
  notes?: string;
  preferred_language?: Language;
  created_at?: string;
}

export interface MedicineRecord {
  id: number;
  household_id?: number;
  medicine_name: string;
  brand?: string;
  strength?: string;
  dosage_form: string;
  manufacturer?: string;
  category?: string;
  prescribed_dosage?: string;
  prescription_required?: boolean;
  batch_number?: string;
  manufacturing_date?: string;
  printed_expiry_date: string;
  purchase_date?: string;
  opened_date?: string;
  quantity: number;
  quantity_unit?: string;
  stock_threshold: number;
  storage_instructions?: string;
  notes?: string;
  package_photo_url?: string;
  prescription_url?: string;
  prescription_id?: number | null;
  assigned_member_id?: number;
  passport_token?: string;
  data_source: DataSource;
  is_confirmed: boolean;
  is_disposed: boolean;
  created_at?: string;
  updated_at?: string;
  days_until_expiry?: number;
  expiry_status?: ExpiryStatus;
  assigned_member?: HouseholdMember;
}

export interface PrescriptionRecord {
  id: number;
  household_id: number;
  member_id?: number;
  member_name?: string;
  title: string;
  doctor_name?: string;
  clinic_name?: string;
  prescribed_date: string;
  valid_until?: string;
  days_until_expiry?: number | null;
  notes?: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  ocr_extracted_text?: string;
  created_at: string;
}

export interface RefillPrediction {
  id: number;
  household_id: number;
  medicine_id: number;
  medicine_name?: string;
  current_quantity?: number;
  quantity_unit?: string;
  schedule_id?: number;
  frequency?: string;
  estimated_daily_consumption: number;
  remaining_days?: number | null;
  estimated_depletion_date?: string | null;
  suggested_refill_date?: string | null;
  confidence_level: 'HIGH' | 'MEDIUM' | 'LOW' | 'AS_NEEDED_ESTIMATE';
  adherence_ratio?: number | null;
  calculation_notes?: string;
  updated_at?: string;
}

export interface CaregiverAccess extends CaregiverPermissions {
  id: number;
  household_id: number;
  caregiver_user_id: number;
  caregiver_name?: string;
  caregiver_email?: string;
  is_active: boolean;
  created_at: string;
}

export interface CaregiverInvitation extends CaregiverPermissions {
  id: number;
  household_id: number;
  household_name?: string;
  caregiver_email: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED';
  invite_token: string;
  created_at: string;
  responded_at?: string;
}

export interface ExpiryNotification {
  id: number;
  household_id?: number;
  medicine_id?: number | null;
  notification_type?: string;
  reference_id?: number | null;
  severity?: string;
  threshold_days: number;
  message: string;
  is_read: boolean;
  triggered_at: string;
  medicine_name?: string;
}

export interface MedicationSchedule {
  id: number;
  medicine_id: number;
  member_id?: number;
  reminder_time: string;
  frequency: string;
  days_of_week: string;
  dose_quantity: number;
  status: 'ACTIVE' | 'PAUSED';
  created_at?: string;
  medicine_name?: string;
  estimated_depletion_date?: string;
}

export interface DisposalRecord {
  id: number;
  medicine_id: number;
  member_id?: number;
  disposed_date: string;
  disposal_method: string;
  quantity_disposed?: number;
  reason?: string;
  notes?: string;
  created_at?: string;
  medicine_name?: string;
}

export interface MedicineEventHistory {
  id: number;
  medicine_id: number;
  action: string;
  description: string;
  timestamp: string;
  quantity_delta: number;
}

export interface DashboardSummary {
  total_active_medicines: number;
  expiring_soon_count: number;
  already_expired_count: number;
  low_stock_count: number;
  unconfirmed_count: number;
  upcoming_reminders_count: number;
  upcoming_refills_count?: number;
  household_members_count: number;
  recent_activity: {
    id: number;
    medicine_id: number;
    action: string;
    description: string;
    timestamp: string;
  }[];
}

export interface PharmacyInfo {
  id: number;
  name: string;
  license_number: string;
  address: string;
  city: string;
  state?: string;
  postal_code?: string;
  phone: string;
  email?: string;
  latitude: number;
  longitude: number;
  coordinates_verified?: boolean;
  coordinates_valid?: boolean;
  location_needs_verification?: boolean;
  business_hours?: string;
  is_open_now?: boolean | null;
  supports_pickup: boolean;
  supports_delivery: boolean;
  delivery_radius_km?: number;
  estimated_fulfilment_note?: string;
  verification_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  data_origin: 'SAMPLE_DEMO' | 'PARTNER_REGISTERED';
  is_active: boolean;
  distance_km?: number | null;
  updated_at?: string | null;
}

export interface PharmacyMedicineItem {
  id: number;
  pharmacy_id: number;
  medicine_name: string;
  generic_name?: string;
  brand?: string;
  strength?: string;
  dosage_form?: string;
  manufacturer?: string;
  category?: string;
  prescription_required: boolean;
  unit_price: number;
  stock_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  is_available: boolean;
  inventory_source: 'SAMPLE_DEMO' | 'VERIFIED_LIVE';
  pharmacy_name?: string;
  pharmacy_city?: string;
  pharmacy_address?: string;
  verification_status?: string;
  distance_km?: number | null;
  supports_pickup?: boolean;
  supports_delivery?: boolean;
  updated_at?: string | null;
}

export interface GeocodeCandidate {
  display_name: string;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  latitude: number;
  longitude: number;
  provider: string;
  is_fallback: boolean;
}

export interface NearbyPharmacyResult extends PharmacyInfo {
  matching_medicines_count: number;
  matching_medicines: PharmacyMedicineItem[];
  lowest_price?: number | null;
}

export interface NearbyPharmaciesResponse {
  center: { latitude: number; longitude: number; radius_km: number } | null;
  resolved_medicine_terms: string[];
  total: number;
  pharmacies: NearbyPharmacyResult[];
}

export interface RefillRequestRecord {
  id: number;
  household_id: number;
  pharmacy_id: number;
  pharmacy_name?: string;
  medicine_record_id?: number;
  pharmacy_medicine_id?: number;
  prescription_id?: number;
  medicine_name: string;
  requested_quantity: number;
  fulfilment_type: 'PICKUP' | 'DELIVERY';
  delivery_address?: string;
  status: string;
  pharmacist_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PharmacyOrderRecord {
  id: number;
  order_number: string;
  household_id: number;
  pharmacy_id: number;
  pharmacy_name?: string;
  prescription_id?: number;
  fulfilment_type: 'PICKUP' | 'DELIVERY';
  delivery_address?: string;
  payment_method: 'PAY_AT_PICKUP' | 'CASH_ON_DELIVERY';
  payment_status: string;
  status: string;
  total_amount: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  items: {
    id: number;
    pharmacy_medicine_id: number;
    medicine_name: string;
    strength?: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }[];
  status_history: {
    status: string;
    notes?: string;
    created_at?: string;
  }[];
}

export type PrimarySection = 'overview' | 'medicines' | 'family_care' | 'pharmacy' | 'more';

export type NavigationTab =
  | 'landing'
  | 'dashboard'
  | 'cabinet'
  | 'scan'
  | 'timeline'
  | 'passport'
  | 'family'
  | 'caregivers'
  | 'prescriptions'
  | 'schedule'
  | 'pharmacy'
  | 'notifications'
  | 'disposal'
  | 'education'
  | 'settings';

export interface NlpMatchedAlias {
  language_code: Language | string;
  alias_text: string;
  alias_type: string;
  review_status: string;
}

export interface NlpMedicineMatch {
  medicine_id: number;
  canonical_code: string;
  canonical_name: string;
  generic_name: string;
  active_ingredient: string;
  brand_names: string[];
  strength: string;
  dosage_form: string;
  therapeutic_category: string;
  score: number;
  match_type: 'EXACT' | 'PREFIX' | 'PHONETIC_FUZZY' | 'TOKEN_SIMILARITY' | 'MULTILINGUAL_ALIAS';
  matched_alias?: NlpMatchedAlias | null;
  localized_explanation?: string;
  pharmacy_offer_count?: number;
}

export interface NlpSearchResponse {
  query: string;
  normalized_query: string;
  detected_language: string;
  status: 'HIGH_CONFIDENCE' | 'AMBIGUOUS_CONFIRMATION_REQUIRED' | 'NO_MATCH';
  requires_confirmation: boolean;
  llm_assist_used: boolean;
  results: NlpMedicineMatch[];
  clarification_prompt?: string | null;
}
