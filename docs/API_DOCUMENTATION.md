# Medora REST API Specification

Base URL: `http://127.0.0.1:8000/api` (Interactive OpenAPI Swagger UI: `http://127.0.0.1:8000/docs`)

All household, caregiver, prescription, refill, notification, disposal, and order endpoints require `Authorization: Bearer <access_token>`. Pharmacy Staff Portal endpoints require a `PHARMACY_STAFF` user linked to a pharmacy; Platform Admin endpoints require `PLATFORM_ADMIN`.

---

## 1. System & Health
- `GET /api/health` — Returns API status, database connectivity, and C data structures engine readiness.

---

## 2. Authentication, Sessions & Household Profile (`/api/auth`)
- `POST /api/auth/register` — Creates user (`HOUSEHOLD_OWNER`, `CAREGIVER`, `HOUSEHOLD_MEMBER`, `PHARMACY_STAFF`), hashes password (`bcrypt`), provisions household for owners, issues `UserSession` bearer token.
- `POST /api/auth/login` — Rate-limited login issuing session token and user profile + active household access context.
- `POST /api/auth/logout` — Revokes active session token.
- `GET /api/auth/me` / `PUT /api/auth/me` — Fetch/update profile (`full_name`, `phone`, `preferred_language`), active `session_expires_at`, and list authorized households / permissions.
- `PUT /api/auth/household` — Update primary household name/location (owner).
- `POST /api/auth/forgot-password` — Rate-limited password recovery token request (`SMTP_HOST` or development preview token when `ENVIRONMENT=development`).
- `POST /api/auth/reset-password` — Resets password with valid token and invalidates prior sessions.

---

## 3. Household Members & Caregiver Access (`/api/household`, `/api/caregivers`)
- `GET /api/household/members` | `POST /api/household/members` | `PATCH /api/household/members/{member_id}/language` | `GET /api/household/summary`
- `POST /api/caregivers/invite` — Household owner invites caregiver by email with granular permission flags.
- `GET /api/caregivers/household` — List active caregivers and pending invitations for household.
- `GET /api/caregivers/invitations/mine` — List invitations addressed to signed-in user.
- `POST /api/caregivers/invitations/{invitation_id}/accept` | `/decline`
- `PUT /api/caregivers/{permission_id}/permissions` — Update caregiver's 7 granular permissions live.
- `DELETE /api/caregivers/{permission_id}` — Immediately revoke caregiver access.

---

## 4. Medicine Inventory & Redacted Passport Verification (`/api/medicines`)
- `GET /api/medicines` — Search & filter active/disposed medicines (`q`, `member_id`, `status`, `is_low_stock`, `include_disposed`, `household_id`).
- `POST /api/medicines` — Add medicine (preserves unconfirmed state for OCR/barcode drafts, assigns unique `passport_token`, generates alerts, updates C engine & refill predictions).
- `GET /api/medicines/{medicine_id}` | `PUT /api/medicines/{medicine_id}` | `DELETE /api/medicines/{medicine_id}`
- `GET /api/medicines/{medicine_id}/events` — Single medicine audit trail.
- `GET /api/medicines/events/recent` — Recent household medicine audit activity.
- `GET /api/medicines/dashboard/summary` — Live counts, unconfirmed drafts, alerts, refill urgency summary.
- `GET /api/medicines/passport/verify/{passport_token}` — **Public redacted verification** returning medicine batch, expiry status, and storage safety notice without patient or household PII.

---

## 5. Private Prescription Vault (`/api/prescriptions`)
- `GET /api/prescriptions` — List/filter prescriptions (`q`, `member_id`, `from_date`, `to_date`).
- `POST /api/prescriptions` — Multipart upload (PDF/JPEG/PNG/WEBP, MIME & size validated, stored outside static root in `PRIVATE_UPLOAD_DIR`).
- `GET /api/prescriptions/{prescription_id}/download` — Authenticated binary download gated by `can_view_prescriptions`.
- `POST /api/prescriptions/{prescription_id}/link-medicine/{medicine_id}` — Link prescription to household medicine.
- `DELETE /api/prescriptions/{prescription_id}` — Delete prescription & clean up stored file.

---

## 6. Schedules, Dose Tracking & Refill Predictions (`/api/schedules`, `/api/refill`)
- `GET /api/schedules` | `POST /api/schedules` | `POST /api/schedules/{schedule_id}/log` (`TAKEN`/`SKIPPED`/`SNOOZED`, 60-sec duplicate guard, stock deduction, adherence recalculation).
- `GET /api/refill/predictions` — List remaining days, daily consumption estimate, depletion/refill dates, adherence ratio, and confidence (`HIGH`, `MODERATE`, `LOW`, `PRN`).
- `POST /api/refill/recalculate` — Force household refill recalculation.
- `PATCH /api/refill/medicines/{medicine_id}/adjust-quantity` — Direct inventory quantity correction with audit logging & prediction refresh.

---

## 7. Notifications, Disposal, Education & OCR (`/api/notifications`, `/api/disposal`, `/api/education`)
- `GET /api/notifications` | `PATCH /api/notifications/{notification_id}/read` | `POST /api/notifications/mark-all-read` | `POST /api/notifications/evaluate-all`
- `GET /api/disposal/records` | `POST /api/disposal/dispose` | `GET /api/disposal/guidance`
- `GET /api/education/medicines` | `GET /api/education/symptoms` | `GET /api/education/barcode/{code}`
- `POST /api/education/ocr/parse` — Parse label text JSON into unconfirmed draft.
- `POST /api/education/ocr/upload` — Parse uploaded packaging image (`FormData`) via Tesseract (when configured) or Pillow metadata + regex adapter into unconfirmed draft.

---

## 8. Pharmacy Discovery, Geocoding, Portal & Ordering (`/api/pharmacies`, `/api/pharmacy-portal`, `/api/orders`)
- **Public / Verified Storefront & Geospatial Map APIs**:
  - `GET /api/pharmacies/geocode` — Resolve town, city, locality, or postal PIN (`q`, `limit`) via TTL cache -> OpenCage (optional key) -> OpenStreetMap Nominatim -> Indian regional fallback gazetteer (`is_fallback` flagged).
  - `GET /api/pharmacies/nearby` — Unified radius + inventory + NLP medicine search (`latitude`, `longitude`, `radius_km`, `location_query`, `medicine_query`, `medicine_id`, `verified_only`, `pickup_only`, `delivery_only`, `open_now`, `in_stock_only`, `sort`) returning matching stores, coordinates, `coordinates_verified`, `location_needs_verification`, parseable nullable `is_open_now`, and matching in-stock medicines.
  - `GET /api/pharmacies/search` — Filter verified active pharmacies by query, pickup/delivery, coordinates & Haversine radius.
  - `GET /api/pharmacies/medicines/search` — Search available pharmacy medicines (brand, generic, strength, NLP terms, fuzzy suggestions) with store distance, availability, and price sort.
  - `GET /api/pharmacies/{pharmacy_id}` — Pharmacy details + stocked medicine catalog.
- **Platform Admin**:
  - `GET /api/pharmacies/admin/list` | `PATCH /api/pharmacies/admin/{pharmacy_id}/verify` | `PATCH /api/pharmacies/admin/{pharmacy_id}/coordinates`
- **Household Ordering & Refill Requests**:
  - `GET /api/orders` | `POST /api/orders` | `POST /api/orders/{order_id}/cancel`
  - `GET /api/orders/refill-requests` | `POST /api/orders/refill-requests` | `POST /api/orders/refill-requests/{request_id}/cancel`
- **Pharmacy Staff Portal**:
  - `POST /api/pharmacy-portal/register` | `GET /api/pharmacy-portal/my-pharmacy` | `PUT /api/pharmacy-portal/my-pharmacy`
  - `GET /api/pharmacy-portal/inventory` | `POST /api/pharmacy-portal/inventory` | `PUT /api/pharmacy-portal/inventory/{item_id}`
  - `GET /api/pharmacy-portal/orders` | `PATCH /api/pharmacy-portal/orders/{order_id}/status`
  - `GET /api/pharmacy-portal/refill-requests` | `PATCH /api/pharmacy-portal/refill-requests/{request_id}/status`

---

## 9. C99 Data Structures Diagnostics (`/api/c-engine`)
- `GET /api/c-engine/status` | `GET /api/c-engine/priority-queue/urgent` | `GET /api/c-engine/hash-table/{key}` | `GET /api/c-engine/timeline`
- `POST /api/c-engine/repopulate` | `POST /api/c-engine/seed-demo`

---

## 10. Multilingual NLP Search, Catalog Governance & Controlled LLM (`/api/nlp`)
- `GET /api/nlp/supported-languages` — Returns metadata (`code`, `nativeName`, `englishName`, `script`, `direction`, `speechCode`, `voiceSupport`, `reviewStatus`) for all 13 supported languages (`default_language: "en"`).
- `POST /api/nlp/medicine-search` — Multilingual medicine/symptom query search (`query`, `preferred_language`, `limit`, `include_pharmacy_counts`, `use_llm_assist`) returning script detection, Indic-to-ASCII numeral normalization, ranked `results` (`status`: `HIGH_CONFIDENCE` / `AMBIGUOUS_CONFIRMATION_REQUIRED` / `NO_MATCH`), `requires_confirmation`, matched aliases, and `llm_assist_used`.
- `GET /api/nlp/search-suggestions` — Localized autocomplete suggestions (`q`, `lang`, `limit`).
- `GET /api/nlp/catalog` — Lists `APPROVED` canonical medicines with `aliases` (`include_unapproved_aliases` query flag).
- `POST /api/nlp/catalog/{medicine_id}/aliases` — Propose or add a regional alias (`PLATFORM_ADMIN` entries become `APPROVED`; `PHARMACY_STAFF`/`HOUSEHOLD_OWNER` entries enter as `PENDING_REVIEW`).
- `PATCH /api/nlp/aliases/{alias_id}/review` — `PLATFORM_ADMIN` approval/rejection (`APPROVED`, `PENDING_REVIEW`, `REJECTED`, `DRAFT_MACHINE`).
- `POST /api/nlp/llm/explain-term` — Controlled plain-language medical term explanation with PII privacy guard and deterministic `DETERMINISTIC_GLOSSARY` fallback when LLM is disabled/unavailable.
- `POST /api/nlp/llm/translation-draft` — `PLATFORM_ADMIN`-only non-binding translation draft generator (`approved_for_production: false`).
