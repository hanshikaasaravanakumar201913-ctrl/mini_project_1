# Medora — Multilingual Household Medicine Management & Pharmacy Accessibility Platform

[![Stack](https://img.shields.io/badge/Stack-React%2018%20%7C%20FastAPI%20%7C%20C99-195A5F.svg)](#)
[![Database](https://img.shields.io/badge/Database-SQLite%20WAL%20%7C%20PostgreSQL%20via%20Alembic-12B8B0.svg)](#)
[![Languages](https://img.shields.io/badge/Languages-13%20Indian%20Languages%20%2B%20Urdu%20RTL-D97F6C.svg)](#)

Medora is a full-stack, multilingual household medicine management, family care, and pharmacy discovery web platform built with **React 18 + TypeScript + Tailwind CSS**, **FastAPI + Pydantic v2 + SQLAlchemy + Alembic**, and an integrated **C99 data structures engine** (`ctypes` FFI with synchronized dual-engine Python simulation fallback).

---

## 1. Visual Identity & Design System (Dual Theme: Dark Mode + Light Mode)

- **Deep Teal (`#195A5F` Dark / `#E6F2EE` Light tint)** & **Canvas Base (`#0E393D` Dark / `#F7F9F7` Light)**: Semantic CSS variable design system (`--color-canvas-rgb`, `--color-surface-rgb`, `--color-ink-rgb`, etc.) with `ThemeProvider` supporting **Dark Mode**, **Light Mode**, and **System Default** (`prefers-color-scheme`) without pre-paint flash.
- **Care Teal (`#12B8B0` Dark / `#087F7A` Light)**: Primary interactive CTAs, OCR highlights, voice mic states, and progress badges.
- **Coral (`#D97F6C` Dark / `#BD4631` Light)**: Expiry urgency badges, prescription warnings, and critical alerts.
- **Warm White / Crisp Surface (`#F3EDE6` / `#FFFFFF`)**: High-contrast text and selective contrasting panels (`Plus Jakarta Sans` + `Space Grotesk`).

---

## 2. Core Platform Capabilities

1. **Centralized Authentication, Sessions & Household Isolation**:
   - `bcrypt` password hashing, SHA-256 database-backed `UserSession` bearer tokens, password reset token workflow, sliding-window auth rate limiting (`HTTP 429`), and role-based access control (`HOUSEHOLD_OWNER`, `CAREGIVER`, `HOUSEHOLD_MEMBER`, `PHARMACY_STAFF`, `PLATFORM_ADMIN`).
   - Single centralized React `AuthProvider` (`initializing | authenticated | unauthenticated | expired`) synchronizing header Sign-In controls across all routes, reloading sessions via `/api/auth/me`, intercepting `HTTP 401` expirations, and clearing private caches on sign-out.
2. **Household Medicine Inventory & Smart Expiry Engine**:
   - Persistent medicine cabinet with batch/expiry/storage tracking, idempotent 10/5/3/1/0-day threshold alerts, draft confirmation workflow for OCR/barcode scans, and responsible disposal audit logs.
3. **Private Prescription Vault**:
   - Authenticated local private storage (`backend/private_uploads`), MIME/magic-byte & size validation, prescription validity expiration monitoring, and linking prescriptions to medicines/refill orders (never exposed via public URLs).
4. **Python Refill Prediction Engine**:
   - Computes estimated daily consumption, depletion date, remaining days, adherence ratio, and confidence level (`HIGH`, `MODERATE`, `LOW`, `PRN`) across daily, weekly, and as-needed schedules, feeding urgent refill warnings into notifications and the C99 Min-Heap.
5. **Granular Caregiver Access**:
   - Household owners invite caregivers and configure 7 granular permission flags (`can_view_medicines`, `can_edit_medicines`, `can_view_prescriptions`, `can_manage_schedules`, `can_record_doses`, `can_view_notifications`, `can_manage_refills`) with immediate revocation.
6. **13-Language Interface, Urdu RTL & Python Multilingual NLP Search**:
   - Supports 13 languages (`en`, `ta`, `hi`, `te`, `kn`, `ml`, `bn`, `mr`, `gu`, `pa`, `or`, `ur` with `dir="rtl"`, and `as`) with Google Fonts script typography, per-user & per-household-member language scoping, Web Speech voice search + text fallback, Python Unicode/phonetic/cosine NLP medicine matching (`/api/nlp/medicine-search`), and optional controlled LLM fallback (`DisabledLLMProvider` by default).
7. **Interactive Pharmacy Map, Geospatial Discovery & Transaction-Safe Ordering**:
   - Real **Leaflet + OpenStreetMap** interactive map connected to `/api/pharmacies/geocode` (OpenCage when key configured, OSM Nominatim live HTTP, and Indian regional fallback gazetteer) and `/api/pharmacies/nearby` (Haversine radius search, NLP symptom-to-generic resolution, live inventory filtering, verified coordinate & parseable operating-hour status, Light/Dark map tile theming, and offline tile fallback notice).
   - Side-by-side store comparison, Pharmacy Staff Portal (with coordinate validation), Platform Admin pharmacy & coordinate verification, atomic conditional stock reservation preventing concurrent overselling, and honest offline settlement modes (`PAY_AT_PICKUP`, `CASH_ON_DELIVERY`).
   - *Data Origin Transparency*: Built-in seed pharmacies (Chennai, Pollachi, Coimbatore, Erode) are explicitly flagged `data_origin = "SAMPLE_DEMO"`; pharmacies onboarded by live staff/admin accounts carry `PARTNER_REGISTERED` and `VERIFIED` status upon approval.
8. **Scannable Redacted Digital Medicine Passport (`QRCode`)**:
   - Real scannable QR codes linking to `/api/medicines/passport/verify/{passport_token}`, returning verified batch/expiry status without exposing household or patient PII.
9. **Academic C99 Data Structures Engine (`c_src/`)**:
   - Min-Heap Priority Queue (expiry + refill urgency), Separate-Chaining djb2 Hash Table (fast ID/barcode indexing), and Singly Linked List (chronological audit log) with household scoping.

---

## 3. Quick Start & Running Locally

### Option A: FastAPI Backend (Recommended Python 3.10–3.13)
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
cd ..
python run_backend.py
```
- Startup automatically runs Alembic migrations (`alembic upgrade head` up to revision `0004`), seeds sample data, regional demo pharmacies, canonical multilingual NLP medicine aliases & demo accounts on empty tables (preserving existing user records), recalculates refill predictions, and populates the C data structures engine.
- API Base: `http://127.0.0.1:8000/api`
- OpenAPI Swagger Docs: `http://127.0.0.1:8000/docs`

### Option B: React + TypeScript Frontend
```powershell
cd frontend
npm install
npm run dev
```
- Runs at `http://localhost:5173` (Vite proxies `/api` to `http://127.0.0.1:8000`).

### Option C: Compile Native C99 Data Structures Library
On a host with `gcc` or `cmake` permitted to execute unsigned binaries:
```bash
cd c_src
make && make run_tests
```
If `medora_ds.dll` (or `libmedora_ds.so`) is built into `c_src/bin/`, `backend/app/c_engine_bridge.py` loads it automatically via `ctypes`; otherwise it runs the synchronized `FALLBACK_PYTHON_SIMULATION` engine.

### Option D: Zero-Install Static Preview
Open `medora_preview.html` directly in any browser for an offline UI walkthrough (note: multi-page platform features such as Auth/RBAC, Prescription Vault, Caregiver invites, and Pharmacy Ordering run on the full React + FastAPI app).

---

## 4. Development Demo Accounts (`ENVIRONMENT=development`)

| Role | Email | Password |
| :--- | :--- | :--- |
| Household Owner | `owner@medora.demo` | `MedoraOwner!2026` |
| Caregiver | `caregiver@medora.demo` | `MedoraCare!2026` |
| Pharmacy Staff | `pharmacy@medora.demo` | `MedoraPharm!2026` |
| Platform Admin | `admin@medora.demo` | `MedoraAdmin!2026` |

---

## 5. Configuration & Production Adapters

Copy `backend/.env.example` to `backend/.env` and configure:
- `DATABASE_URL`: Defaults to local SQLite `medora.db` (`WAL` mode + foreign keys). Supports PostgreSQL / Supabase connection strings.
- `SECRET_KEY` & `ENVIRONMENT=production`: Set strong secret and disable `ALLOW_DEV_FALLBACK_AUTH` before production deployment.
- `PRIVATE_UPLOAD_DIR` & `MAX_UPLOAD_SIZE_MB`: Private directory for prescription PDF/image uploads.
- **Optional External Integrations** (development/deterministic adapters are used when omitted):
  - `TESSERACT_CMD`: Path to Tesseract OCR binary for real image text extraction in `OCRService`.
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`: Required to send password reset tokens by email instead of logging/dev preview.
  - `OPENCAGE_API_KEY`: Optional geocoding API key if extending beyond manual/browser geolocation coordinates.
  - `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_TIMEOUT_SEC`: Optional provider-independent OpenAI-compatible LLM endpoint (`disabled` by default; falls back cleanly to `DETERMINISTIC_GLOSSARY` and deterministic NLP with PII redaction checks).

---

## 6. Running Automated Verification Tests

```powershell
# Backend API, security, concurrency, expiry, refill & C-bridge tests
backend\.venv\Scripts\python.exe -m pytest backend/tests -v

# Frontend TypeScript check & Node unit tests (no native Rollup addon required)
cd frontend
npx tsc --noEmit
npm run test:unit
# Export 288 keys x 13 languages for native reviewer verification
backend\.venv\Scripts\python.exe backend/scripts/export_translations_for_review.py
```

See [docs/TESTING_REPORT.md](docs/TESTING_REPORT.md), [docs/TRANSLATION_QUALITY_REPORT.md](docs/TRANSLATION_QUALITY_REPORT.md), and [docs/TRANSLATION_GLOSSARY.md](docs/TRANSLATION_GLOSSARY.md) for latest observed test results, glossary standards, and language review readiness.

---

## 7. Clinical & Regulatory Disclaimer

Medora is a household medicine tracking and academic/reference pharmacy platform. It does not perform clinical diagnosis, prescribe medication, process live card/UPI payments, or replace licensed medical/pharmacist judgment. Production deployment with real patient records must satisfy applicable healthcare data privacy and pharmacy laws (e.g., India's DPDP Act and Drugs & Cosmetics Act / e-pharmacy rules).
