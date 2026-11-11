# Medora Verification & Quality Assurance Report

This document records verified checks, fixed defects, test results, and environment limitations observed on the current codebase.

---

## 1. Automated Verification Summary

| Check Suite | Command | Outcome | Scope & Observed Details |
| :--- | :--- | :---: | :--- |
| **Backend Automated Tests (`pytest`)** | `backend\.venv\Scripts\python.exe -m pytest backend/tests -v` | **40 PASSED** | Covers lifecycle CRUD, 60s duplicate dose protection, disposal delta preservation, expiry boundary calculations, C engine bridge semantics, auth/RBAC isolation, password reset, **session expiry (`401`) & logout revocation**, **geocoding + `/api/pharmacies/nearby` Haversine radius/NLP/stock filtering + partner `(0,0)` coordinate rejection + admin coordinate verification + nullable `evaluate_is_open_now`**, caregiver revocation, private prescription upload/download + expiry, refill predictions (Daily/Weekly/PRN), `OCR` image upload (`PNG 32x32`), rate limiter (`HTTP 429`), order cancellation stock release, concurrent checkout (`[201, 409]`), 13-language NLP search, and LLM PII/fallback guards. |
| **Frontend TypeScript Check (`tsc`)** | `cd frontend && npx tsc --noEmit` | **PASSED (0 errors)** | Strictly checks all React 18 components, `AuthContext`, `ThemeContext`, `MedicineContext`, `PharmacyMap` (`leaflet`), `PharmacyPage`, 13-language i18n types, RTL support, `NlpMedicineFinder`, QR passport, Voice search, and API payloads. |
| **Frontend Build (`vite build`)** | `cd frontend && npm run build` | **PASSED (5.38s)** | Uses official pure-WASM `rollup@npm:@rollup/wasm-node@4.68.2` override in `frontend/package.json` so Vite bundles cleanly (`1607 modules transformed`, `60.57 kB` CSS / `802.05 kB` JS) without native `.node` addons. |
| **Frontend Unit Logic Suite (Node)** | `cd frontend && node --test tests/verify_frontend.mjs` | **6 PASSED** | Verifies `dateUtils` calculations & 10/5/3/1/0 thresholds, **100% key & placeholder parity (`295` keys each) across all 13 languages** (`en`, `ta`, `hi`, `te`, `kn`, `ml`, `bn`, `mr`, `gu`, `pa`, `or`, `ur`, `as`), **Urdu RTL flag**, native Unicode script checks, **absence of legacy Tamil/Hindi English transliterations**, `normalizeVoiceQuery`, PNG QR generation, `ThemeContext` preference validation, and `AuthContext` storage cleanup. |
| **Alembic Database Migration** | `backend\.venv\Scripts\python.exe -m alembic current` | **PASSED (`0004 (head)`)** | Upgraded existing `medora.db` cleanly to include `household_members.preferred_language`, `canonical_medicines`, `medicine_multilingual_aliases`, and `pharmacies.coordinates_verified` while preserving pre-existing medicine & household records. |
| **Browser E2E (Headless Chrome CDP)** | `node browser_auth_and_map_e2e.mjs` | **PASSED (0 errors)** | Verified signed-out header Sign-In consistency across routes, unified modal login (`owner@medora.demo`) + reload session persistence, `HTTP 401` mid-session expiry banner + private cache scrubbing, `PHARMACY_STAFF` role isolation, Leaflet/OSM real map (`Pollachi`, `Coimbatore` + `Paracetamol`, radius `50 km` <-> `10 km`, popup inspect, `Erode` geolocation, empty search, Dark + Light + mobile `390x844` zero-overflow rendering, and offline tile-error banner) with `PAGE/CONSOLE ERRORS: []`. |

---

## 2. Host Environment Constraints (Verified Observed Blockers)

1. **C99 Native Compilation & `.dll` Loading**:
   - No host C compiler (`gcc`, `clang`, `cl`) is installed on PATH, and Windows Application Control (WDAC) on this workstation blocks unsigned newly compiled executables/shared libraries. Consequently, live execution on this machine runs `backend/app/c_engine_bridge.py` in synchronized `FALLBACK_PYTHON_SIMULATION` mode rather than loading `medora_ds.dll`. Native builds via `c_src/Makefile` / `CMakeLists.txt` require a host permitting local compiler binaries.
2. **Rollup Native Binary Mitigation (`@rollup/wasm-node`)**:
   - Native `@rollup/rollup-win32-x64-msvc/rollup.win32-x64-msvc.node` is blocked by Windows Application Control on this host (`ERR_DLOPEN_FAILED`); switching `rollup` via `"overrides"` in `frontend/package.json` to the official WebAssembly package `@rollup/wasm-node@4.68.2` enables `npm run dev` and `npm run build` cleanly.

---

## 3. Defects Fixed During Full-Platform Engineering

1. **OCR Batch Extraction Regex Bug (`backend/app/ocr_service.py`, `frontend/src/pages/ScanPage.tsx`)**:
   - *Defect*: Pattern `(?:B(?:atch)?\.?\s*(?:No|#)?|Lot|B/No)` matched the substring `"blets"` inside `"Tablets"` -> extracted `"lets"` as a batch number.
   - *Fix*: Added word boundary `\b` and explicit token requirement `\b(?:Batch(?:\s*(?:No\.?|#))?|B\.?\s*(?:No\.?|#)|B/No|Lot(?:\s*(?:No\.?|#))?)`.
2. **SQLite Concurrency Locking (`backend/app/database.py`)**:
   - *Defect*: Default SQLite connection without `WAL` mode or busy timeout risked contention under parallel requests.
   - *Fix*: Configured `timeout=30`, `PRAGMA journal_mode=WAL`, and `PRAGMA foreign_keys=ON` on SQLite connections.
3. **Weekly & PRN Refill Prediction Accuracy (`backend/app/refill_engine.py`, `routes/schedules.py`)**:
   - Avoided assuming fixed daily burn rates for weekly or as-needed (`PRN`) medications; exposed `confidence_level` and `adherence_ratio`.
4. **C Engine State Desynchronization (`backend/app/routes/c_engine.py`, `c_engine_bridge.py`)**:
   - Cleared priority queue, hash table, and linked list together on repopulate, added `pq_remove_by_medicine` and `household_id` scoping so disposed/deleted records do not linger or cross households.
5. **FastAPI Route Shadowing, Dose Duplicate Guard & Disposal Quantity Delta** (preserved and regression-tested in `backend/tests/test_api.py`).
6. **Multilingual Audit, Script Combining Marks & RTL Positioning**:
   - *Fix*: Replaced Tamil/Hindi transliterated labels (`डैशबोर्ड`, `एक्सपायरी`, `டாஷ்போர்டு`, `பாஸ்போர்ட்`) with idiomatic equivalents, preserved Unicode `Mc`/`Mn` vowel combining marks in Python NLP text cleaning, converted physical LTR Tailwind spacing to RTL-logical properties (`ps-`, `pe-`, `start-`, `end-`, `text-start`) for Urdu (`ur`), and documented readiness honestly in [TRANSLATION_QUALITY_REPORT.md](file:///C:/Users/Adox/Desktop/medora_mp/docs/TRANSLATION_QUALITY_REPORT.md) and [TRANSLATION_GLOSSARY.md](file:///C:/Users/Adox/Desktop/medora_mp/docs/TRANSLATION_GLOSSARY.md).

---

## 4. Production Readiness & External Dependencies Checklist

Before deploying beyond development/academic demonstration:
- Provide real `SECRET_KEY` and set `ENVIRONMENT=production` in `backend/.env`.
- Configure SMTP (`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`) for password recovery email delivery and VAPID Web Push keys if real background browser push notifications are required.
- Install Tesseract (`TESSERACT_CMD`) for optical image OCR text extraction beyond development packaging presets.
- Integrate licensed payment gateway and e-pharmacy regulatory compliance checks (DPDP Act, Drugs & Cosmetics Act) if processing live commercial prescriptions or payments.
