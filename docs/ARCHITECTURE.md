# Medora System Architecture & Technical Specification

## 1. Executive Summary
Medora is a multilingual household medicine management, caregiver coordination, refill forecasting, and pharmacy accessibility platform built on **React 18 + TypeScript + Tailwind CSS**, **FastAPI + Pydantic v2 + SQLAlchemy + Alembic**, and an academic **C99 data structures engine** (`ctypes` FFI).

---

## 2. High-Level Architecture

```
+-----------------------------------------------------------------------+
|                    Frontend Web App / PWA (React 18 + TS)             |
| 5 Primary Navigation Sections: Overview | My Medicines | Family Care  |
|                                Pharmacy | More                        |
| Languages: English (en) | Tamil (ta) | Hindi (hi)                     |
+-----------------------------------+-----------------------------------+
                                    | HTTPS/REST JSON (+ Bearer Session)
                                    | Graceful localStorage offline fallback
                                    v
+-----------------------------------------------------------------------+
|                       FastAPI Application (`backend/`)                |
|  - Security & RBAC (`security.py`): bcrypt, SHA-256 UserSession,      |
|    SlidingWindowRateLimiter (429), household/pharmacy tenant guards   |
|  - Domain Engines: ExpiryEngine, RefillEngine, OCRService,            |
|    BarcodeService, NotificationService, Haversine Discovery           |
|  - Private Storage: `backend/private_uploads` (no static URL exposure)|
+--------------------+-------------------------------+------------------+
                     | SQLAlchemy 2.x + Alembic      | ctypes FFI / Fallback
                     v                               v
+--------------------------------------+   +----------------------------+
| Relational DB (23 tables)            |   | C99 Data Structures Engine |
| SQLite (WAL + FK pragmas) / Postgres |   | - Min-Heap Priority Queue  |
+--------------------------------------+   | - djb2 Chaining Hash Table |
                                           | - Singly Linked List       |
                                           +----------------------------+
```

---

## 3. Relational Database Schema (23 Tables, Alembic Managed)

Alembic revisions (`alembic.ini`, `backend/alembic/versions/0001_initial_schema.py`, `0002_full_platform_schema.py`) manage schema evolution with SQLite batch compatibility and preserve pre-existing data on startup via `backend/app/migrations.py`:

- **Auth & Access Control**: `users`, `user_sessions`, `password_reset_tokens`, `households`, `household_members`, `caregiver_invitations`, `caregiver_permissions`
- **Household Clinical & Inventory Records**: `prescriptions`, `medicine_records`, `expiry_notifications`, `medication_schedules`, `schedule_logs`, `refill_predictions`, `medicine_event_history`, `disposal_records`
- **Pharmacy Discovery, Inventory & Ordering**: `pharmacies`, `pharmacy_staff`, `pharmacy_medicines`, `inventory_transactions`, `refill_requests`, `pharmacy_orders`, `pharmacy_order_items`, `order_status_history`

---

## 4. Core Subsystems & Security Controls

### A. Multi-Tenant Authentication & Role-Based Access Control
- `Users` authenticate with `bcrypt` hashes and receive random bearer tokens whose SHA-256 digests are persisted in `user_sessions`.
- Every household request passes through `resolve_household_access()`, enforcing ownership or active `CaregiverPermission` flags (`can_view_medicines`, `can_edit_medicines`, `can_view_prescriptions`, `can_manage_schedules`, `can_record_doses`, `can_view_notifications`, `can_manage_refills`).
- `PHARMACY_STAFF` accounts are isolated to their linked `Pharmacy` via `resolve_user_pharmacy()`; `PLATFORM_ADMIN` verifies pending pharmacies before public listing.

### B. Private Prescription Vault (`routes/prescriptions.py`)
- Uploads are validated for extension, declared/inspected MIME bytes, and `MAX_UPLOAD_SIZE_MB`, then stored outside web root under UUID filenames.
- Files are downloadable solely via authenticated `/api/prescriptions/{id}/download` after passing `can_view_prescriptions`.
- Prescription validity end dates (`valid_until`) feed proactive validity notifications.

### C. Refill Prediction Engine (`backend/app/refill_engine.py`)
- Analyzes remaining quantity, prescribed dose units, schedule frequency (`DAILY`, `WEEKLY`, `AS_NEEDED`/`PRN`, custom weekly days), and recent `ScheduleLog` adherence (`TAKEN` vs `SKIPPED`).
- Never fabricates daily burn rates for `PRN` / as-needed medicines (`confidence_level = "PRN"`).
- Emits urgent refill events (`event_type = "REFILL"`) into `ExpiryNotification` alerts and the C99 Min-Heap Priority Queue.

### D. Pharmacy Discovery & Concurrency-Safe Ordering (`routes/pharmacies.py`, `routes/orders.py`, `routes/pharmacy_portal.py`)
- Calculates great-circle distance in kilometers using `haversine_km()` and offers fuzzy string fallback (`difflib`) for medicine search typos.
- Order placement enforces valid non-expired `prescription_id` whenever any ordered medicine sets `prescription_required = True`.
- Uses an atomic conditional SQL update (`UPDATE pharmacy_medicines SET reserved_quantity = reserved_quantity + :qty ... WHERE (stock_quantity - reserved_quantity) >= :qty`) so concurrent checkouts never oversell inventory; cancellations release reserved stock and record an `InventoryTransaction` audit entry.
- Supports honest offline settlement (`PAY_AT_PICKUP`, `CASH_ON_DELIVERY`) without simulating card gateways.

### E. Scanning Safety & Redacted QR Passport
- Packaging uploads (`/api/education/ocr/upload`), text parsing (`/api/education/ocr/parse`), and barcode lookups (`/api/education/barcode/{code}`) always return unconfirmed drafts (`is_confirmed = False`, `requires_review = True`) for human inspection.
- Each `MedicineRecord` generates a unique `passport_token`. Scanning its QR hits `GET /api/medicines/passport/verify/{passport_token}`, returning medicine verification metadata (`brand`, `batch_number`, `printed_expiry_date`, `expiry_status`) while omitting patient/household PII.
