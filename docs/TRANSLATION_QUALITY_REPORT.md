# Medora Multilingual Localization & NLP Quality Report

This report documents the Phase 1–10 audit, fixes, architecture, automated checks, and honest readiness classification of Medora's 13-language system.

---

## 1. Phase 1 Audit Summary & Transliteration Remediation

During the initial localization audit of `frontend/src/i18n/translations.ts`, `LanguageContext.tsx`, `index.html`, `index.css`, and page components:
1. **Removed Transliterated English Labels in Tamil (`ta`) & Hindi (`hi`)**:
   - Replaced Hindi transliterations (`डैशबोर्ड`, `एक्सपायरी`, `टाइमलाइन`, `प्रिस्क्रिप्शन वॉल्ट`, `शेड्यूल`, `डेमो`, `स्कैन`) with idiomatic Hindi terms (`नियंत्रण फलक`, `समाप्ति`, `समय-रेखा`, `सुरक्षित पर्चा संग्रह`, `खुराक समय-सारणी`, `नमूना`, `चित्र-पठन व सत्यापन`).
   - Replaced Tamil transliterations (`டாஷ்போர்டு`, `ஸ்கேன்`, `பாஸ்போர்ட்`, `ஆர்டர்கள்`, `டெமோ`, `பிராண்ட்`) with idiomatic Tamil terms (`கட்டுப்பாட்டுப் பலகம்`, `வருடல் மற்றும் சரிபார்ப்பு`, `மருந்து அடையாளச் சான்று`, `ஆணைகள்`, `மாதிரி`, `மருந்து வணிகப் பெயர்`).
2. **Removed Hardcoded English UI & Physical LTR Positioning**:
   - Eliminated hardcoded JSX labels, placeholders, error messages, and modal titles across pages/components in favor of `t(key, params)`.
   - Replaced physical directional Tailwind classes (`pl-`, `pr-`, `ml-`, `mr-`, `left-`, `right-`, `text-left`, `border-l-`) with RTL-logical CSS classes (`ps-`, `pe-`, `ms-`, `me-`, `start-`, `end-`, `text-start`, `border-s-`, `rtl:rotate-180`).
3. **Per-User Language Isolation**:
   - Bound `useLanguage().bindUserLanguageScope` in `MedicineContext.tsx` to the authenticated `currentUser.id` so switching users or household members keeps independent UI and member language preferences cleanly isolated.

---

## 2. Live 13-Language Coverage & Readiness Matrix

Generated via `backend/scripts/export_translations_for_review.py` -> [translation_review_export.json](file:///C:/Users/Adox/Desktop/medora_mp/docs/translation_review_export.json) (`288` keys per locale, verified in `frontend/tests/verify_frontend.mjs`):

| Code | Native Name | English Name | Script | Dir | Keys | Coverage | Speech BCP-47 (`voiceSupport`) | Review Status |
| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| `en` | English | English | Latin | `ltr` | 288 / 288 | 100% | `en-IN` (`browser_tested`) | `AUDITED_BASELINE` |
| `ta` | தமிழ் | Tamil | Tamil | `ltr` | 288 / 288 | 100% | `ta-IN` (`browser_tested`) | `AUDITED_BASELINE` |
| `hi` | हिन्दी | Hindi | Devanagari | `ltr` | 288 / 288 | 100% | `hi-IN` (`browser_tested`) | `AUDITED_BASELINE` |
| `te` | తెలుగు | Telugu | Telugu | `ltr` | 288 / 288 | 100% | `te-IN` (`experimental_bcp47`) | `AUTHORED_AWAITING_NATIVE_REVIEW` |
| `kn` | ಕನ್ನಡ | Kannada | Kannada | `ltr` | 288 / 288 | 100% | `kn-IN` (`experimental_bcp47`) | `AUTHORED_AWAITING_NATIVE_REVIEW` |
| `ml` | മലയാളം | Malayalam | Malayalam | `ltr` | 288 / 288 | 100% | `ml-IN` (`experimental_bcp47`) | `AUTHORED_AWAITING_NATIVE_REVIEW` |
| `bn` | বাংলা | Bengali | Bengali | `ltr` | 288 / 288 | 100% | `bn-IN` (`experimental_bcp47`) | `AUTHORED_AWAITING_NATIVE_REVIEW` |
| `mr` | मराठी | Marathi | Devanagari | `ltr` | 288 / 288 | 100% | `mr-IN` (`experimental_bcp47`) | `AUTHORED_AWAITING_NATIVE_REVIEW` |
| `gu` | ગુજરાતી | Gujarati | Gujarati | `ltr` | 288 / 288 | 100% | `gu-IN` (`experimental_bcp47`) | `AUTHORED_AWAITING_NATIVE_REVIEW` |
| `pa` | ਪੰਜਾਬੀ | Punjabi | Gurmukhi | `ltr` | 288 / 288 | 100% | `pa-IN` (`experimental_bcp47`) | `AUTHORED_AWAITING_NATIVE_REVIEW` |
| `or` | ଓଡ଼ିଆ | Odia | Odia | `ltr` | 288 / 288 | 100% | `or-IN` (`text_fallback`) | `AUTHORED_AWAITING_NATIVE_REVIEW` |
| `ur` | اردو | Urdu | Nastaliq / Arabic | `rtl` | 288 / 288 | 100% | `ur-IN` (`experimental_bcp47`) | `AUTHORED_AWAITING_NATIVE_REVIEW` |
| `as` | অসমীয়া | Assamese | Assamese / Eastern Nagari | `ltr` | 288 / 288 | 100% | `as-IN` (`text_fallback`) | `AUTHORED_AWAITING_NATIVE_REVIEW` |

> [!IMPORTANT]
> **Classification Transparency**:
> - **Implemented & Codebase Audited (`AUDITED_BASELINE`)**: `en`, `ta`, and `hi` have undergone structured repository audit and regression checks against transliterated English strings.
> - **Authored In-Repo, Awaiting External Native Review (`AUTHORED_AWAITING_NATIVE_REVIEW`)**: `te`, `kn`, `ml`, `bn`, `mr`, `gu`, `pa`, `or`, `ur`, and `as` were authored directly in native Indian/Urdu scripts with zero placeholder mismatches (`0`) and automated Unicode block verification, and have not yet been signed off by external native speakers or licensed clinical translators.
> - **AI/LLM Drafts**: Any translation drafts created via `POST /api/nlp/llm/translation-draft` carry `approved_for_production: false` and `DRAFT_MACHINE` status and are never auto-published.

---

## 3. Script Typography, RTL Layout & Voice Support

1. **Google Fonts & Fallback Stacks (`frontend/index.html`, `frontend/src/index.css`)**:
   - Loaded `Noto Sans Tamil`, `Noto Sans Devanagari`, `Noto Sans Telugu`, `Noto Sans Kannada`, `Noto Sans Malayalam`, `Noto Sans Bengali`, `Noto Sans Gujarati`, `Noto Sans Gurmukhi`, `Noto Sans Oriya`, `Noto Nastaliq Urdu`, and `Noto Sans Arabic`.
   - Configured per-`html[lang]` font stacks and elevated line height (`1.95` for `ur` Nastaliq descenders/ascenders; `1.62–1.65` for Indic matras).
2. **Urdu RTL Support (`LanguageContext.tsx`, `index.css`)**:
   - Selecting `ur` sets `document.documentElement.dir = "rtl"` and `lang = "ur"` immediately without page reload.
   - `.font-mono { direction: ltr; unicode-bidi: isolate; }` keeps dosage numbers, barcodes, timestamps, and passport tokens readable in LTR inside RTL Urdu cards.
   - Visual orbital illustration (`OrbitHero.tsx`) retains an isolated `dir="ltr"` container so radial icon coordinates do not distort in RTL mode.
3. **Voice Recognition (`VoiceSearchBar.tsx`)**:
   - `en-IN`, `ta-IN`, and `hi-IN` use standard Web Speech API locales (`browser_tested`).
   - Regional BCP-47 tags (`te-IN`, `kn-IN`, `ml-IN`, `bn-IN`, `mr-IN`, `gu-IN`, `pa-IN`, `ur-IN`) display an explicit notice when a browser's speech engine lacks support for that locale; `or` and `as` surface manual text + phonetic search (`text_fallback`) alongside clean error guidance.

---

## 4. Python Multilingual NLP Engine Summary

Implemented in `backend/app/nlp_search_service.py` and seeded via `backend/app/nlp_catalog_seed.py` (10 canonical medicines + multilingual aliases across all 13 languages):
- Preserves Unicode Indic combining vowel signs (`Mc`/`Mn`) during normalization (`NFKC`), unlike naive ASCII regex cleaners.
- Converts Indic & Arabic-Indic numerals into ASCII digits (`unicodedata.digit`).
- Disambiguates Assamese (`as`: `ৰ`/`ৱ` and lexical markers) from Bengali (`bn`) and Marathi (`mr`) from Hindi (`hi`) inside shared Unicode script blocks.
- Ranks exact & canonical matches ahead of prefix, alias, phonetic Latin (`transliteration`), and character n-gram cosine similarity (`strength_boost` / conflict penalty).
- Returns `AMBIGUOUS_CONFIRMATION_REQUIRED` when top matches score closely and `NO_MATCH` without fabricating medicines on unknown queries.
- Integrates optional provider-independent `ControlledLLMService` (`backend/app/llm_service.py`) with PII/prescription leak prevention (`assert_privacy_safe_input`) and automatic deterministic fallback (`DETERMINISTIC_GLOSSARY`).

---

## 5. Known Limitations

- External native-speaker clinical review of Telugu, Kannada, and the other 8 newly authored regional languages remains recommended prior to public medical deployment.
- Live Web Speech API recognition accuracy depends on client browser/OS vendor speech models (Chromium/Chrome/Edge vs. Firefox/Safari).
- Packaging OCR uses configured local Tesseract (`TESSERACT_CMD`) or development filename/regex adapters rather than a cloud vision service unless configured.
