# Medora Multilingual Medical & UI Translation Glossary

This glossary documents the standardized domain vocabulary used across Medora's 13-language interface (`en`, `ta`, `hi`, `te`, `kn`, `ml`, `bn`, `mr`, `gu`, `pa`, `or`, `ur`, `as`) and canonical medicine search aliases.

---

## 1. Guiding Terminology Principles

1. **Native Semantics First**: Interface concepts (Dashboard, Vault, Scan, Passport, Expiry Date, Storage, Refill, Disposal) must use natural, idiomatic regional vocabulary rather than English words written in Indian scripts.
2. **Scientific & Brand Preservation**: Registered brand names (e.g., *Dolo 650*, *Crocin Advance*, *Augmentin 625*, *Pantocid 40*, *Telma 40*) and internationally recognized generic molecules (*Paracetamol*, *Metformin*, *Cetirizine*, *Amoxicillin*) retain their scientific identity, paired with accurate regional script forms and plain-language therapeutic explanations where appropriate.
3. **Preserve Units, Numbers & Warnings**: Dosage strengths (`500 mg`, `650 mg`, `5 ml`), dates, red-flag medical warnings, and format placeholders (`{count}`, `{name}`, `{days}`) must never be distorted during translation.
4. **Urdu (`ur`) Script & Punctuation**: Urdu uses Perso-Arabic / Nastaliq script (`dir="rtl"`), while chemical strengths, barcodes, phone numbers, and batch codes render in isolated LTR spans (`.font-mono`).

---

## 2. Core UI & Medical Concepts (Priority Audit Languages)

| Concept | English (`en`) | Tamil (`ta`) | Hindi (`hi`) | Telugu (`te`) | Kannada (`kn`) | Urdu (`ur`, RTL) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Medicine / My Medicines** | My Medicines (`section.medicines`) | என் மருந்துகள் | मेरी दवाइयाँ | నా మందులు | ನನ್ನ ಔಷಧಗಳು | میری دوائیں |
| **Prescription (Vault)** | Prescription Vault (`nav.prescriptions`) | மருந்துச் சீட்டு காப்பகம் | सुरक्षित पर्चा संग्रह | మందుల చీటీల భాండాగారం | ಸುರಕ್ಷಿತ ಚೀಟಿ ಸಂಗ್ರಹ | محفوظ طبی نسخوں کا خزانہ |
| **Expiry Date** | Printed Expiry Date (`cabinet.field_expiry`) | அச்சிடப்பட்ட காலாவதி தேதி | मुद्रित समाप्ति तिथि | ముద్రించిన గడువు తేదీ | ಮುದ್ರಿತ ಅವಧಿ ದಿನಾಂಕ | چھپی ہوئی میعاد کی تاریخ |
| **Dosage** | Prescribed Dosage (`cabinet.field_dosage`) | பரிந்துரைக்கப்பட்ட அளவு | निर्धारित खुराक | సూచించిన మోతాదు | ಸೂಚಿಸಿದ ಪ್ರಮಾಣ | تجویز کردہ خوراک |
| **Active Ingredient / Generic** | `Paracetamol` (canonical asset) | பாராசிட்டமால் | पैरासिटामोल | పారాసెటమాల్ | ಪ್ಯಾರಾಸಿಟಮಾಲ್ | پیراسیٹامول |
| **Pharmacy** | Pharmacy & Orders (`nav.pharmacy`) | மருந்தகம் மற்றும் ஆணைகள் | औषधालय व आदेश | ఔషధశాల & అభ్యర్థనలు | ಔಷಧಾಲಯ ಮತ್ತು ಬೇಡಿಕೆಗಳು | دواخانہ اور سفارشات |
| **Refill** | Upcoming Refills (`dashboard.stat_refills`) | வரவிருக்கும் மறுநிரப்பல்கள் | आगामी पुनःपूर्ति | రాబోయే మరుసరఫరాలు | ಮುಂಬರುವ ಮರುಭರ್ತಿಗಳು | متوقع دوبارہ فراہمی |
| **Caregiver** | Caregiver Access (`nav.caregivers`) | பராமரிப்பாளர் அணுகல் | देखभालकर्ता पहुंच नियंत्रण | సంరక్షకుల అనుమతులు | ಆರೈಕೆದಾರರ ಅನುಮತಿ ನಿಯಂತ್ರಣ | نگہداشت کنندہ کے اختیارات |
| **Allergy** | Known Allergies (`family.allergies`) | அறியப்பட்ட ஒவ்வாமைகள் | ज्ञात एलर्जी | తెలిసిన ప్రతికూల స్పందనలు (అసహనాలు) | ತಿಳಿದಿರುವ ಅಸಹಿಷ್ಣುತೆಗಳು (ಅಲರ್ಜಿ) | معلوم حساسیت (الرجی) |
| **Storage** | Storage Instructions (`cabinet.field_storage`) | சேமிப்பு வழிமுறைகள் | भंडारण निर्देश | భద్రపరచే సూచనలు | ಸಂಗ್ರಹಣಾ ಸೂಚನೆಗಳು | محفوظ رکھنے کی ہدایات |
| **Disposal** | Responsible Disposal (`nav.disposal`) | பொறுப்பான அகற்றல் | जिम्मेदार दवा निपटान | సురక్షిత మందుల విసర్జన | ಜವಾಬ್ದಾರಿಯುತ ಔಷಧ ವಿಲೇವಾರಿ | ذمہ دارانہ تلفی |
| **Available Stock** | Stock (`cabinet.label_stock`) | இருப்பு | भंडार | నిల్వ | ದಾಸ್ತಾನು | ذخیرہ |
| **Order Confirmation** | Submit Order (`pharmacy.place_order`) | ஆணையைச் சமர்ப்பி | आदेश दर्ज करें | అభ్యర్థన పంపండి | ಬೇಡಿಕೆ ಸಲ್ಲಿಸಿ | سفارش بھیجیں |

---

## 3. Additional Core Concept Equivalents Across Remaining 7 Languages (`ml`, `bn`, `mr`, `gu`, `pa`, `or`, `as`)

| Concept | Malayalam (`ml`) | Bengali (`bn`) | Marathi (`mr`) | Gujarati (`gu`) | Punjabi (`pa`) | Odia (`or`) | Assamese (`as`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Medicine Cabinet** | മരുന്ന് ശേഖരം | ওষুধের সংগ্রহ | औषध संग्रह पेटी | દવાનો સંગ્રહ | ਦਵਾਈਆਂ ਦੀ ਅਲਮਾਰੀ | ଔଷଧ ସଂଗ୍ରହ ପେଟିକା | ঔষধ সংগ্ৰহ পেৰা |
| **Prescription Vault** | സുരക്ഷിത കുറിപ്പടി ശേഖരം | সুরক্ষিত ব্যবস্থাপত্র ভান্ডার | सुरक्षित वैद्यकीय चिठ्ठी संग्रह | સુરક્ષિત તબીબી ચિઠ્ઠી સંગ્રહ | ਸੁਰੱਖਿਅਤ ਡਾਕਟਰੀ ਪਰਚੀ ਭੰਡਾਰ | ସୁରକ୍ଷିତ ଡାକ୍ତରୀ ଚିଠା ଭଣ୍ଡାର | সুৰক্ষিত চিকিৎসক পত্ৰ ভঁৰাল |
| **Expiry Date** | അച്ചടിച്ച കാലാവധി തീയതി | মুদ্রিত মেয়াদোত্তীর্ণ তারিখ | छापलेली मुदत तारीख | છાપેલી મુદત તારીખ | ਛਪੀ ਮਿਆਦ ਮਿਤੀ | ମୁଦ୍ରିତ ମିଆଦ ଶେଷ ତାରିଖ | ছপা হোৱা ম্যাদ তাৰিখ |
| **Dosage** | നിർദ്ദേശിച്ച അളവ് | নির্দেশিত মাত্রা | सांगितलेली मात्रा | સૂચવેલ માત્રા | ਦੱਸੀ ਖੁਰਾਕ | ନିର୍ଦ୍ଦେଶିତ ମାତ୍ରା | নিৰ্দেশিত মাত্ৰা |
| **Storage** | സൂക്ഷിക്കേണ്ട വിധം | সংরক্ষণ নির্দেশিকা | साठवणूक सूचना | સંગ્રહ સૂચનાઓ | ਸਾਂਭ-ਸੰਭਾਲ ਦੀਆਂ ਹਦਾਇਤਾਂ | ସଂରକ୍ଷଣ ନିର୍ଦ୍ଦେଶାବଳୀ | সংৰক্ষণৰ নিৰ্দেশনা |
| **Responsible Disposal** | ഉത്തരവാദിത്ത നിർമാർജനം | দায়িত্বশীল নিষ্পত্তি | जबाबदार औषध विल्हेवाट | જવાબદાર દવા નિકાલ | ਜ਼ਿੰਮੇਵਾਰ ਦਵਾਈ ਨਿਪਟਾਰਾ | ଦାୟିତ୍ୱପୂର୍ଣ୍ଣ ଔଷଧ ବିସର୍ଜନ | দায়িত্বশীল ঔষধ নিষ্পত্তি |

---

## 4. Deterministic Medical Term Definitions (`backend/app/llm_service.py`)

When an external LLM provider is disabled, unreachable, or times out, `/api/nlp/llm/explain-term` returns pre-authored deterministic glossary explanations (`DETERMINISTIC_GLOSSARY`) for core pharmacological classes (`antipyretic`, `analgesic`, `antihistamine`, `antibiotic`, `antidiabetic`, `expiry date`), e.g.:

- **`antipyretic`**:
  - `en`: *A medicine used to reduce fever.*
  - `ta`: `காய்ச்சலைக் குறைக்க உதவும் மருந்து.`
  - `hi`: `बुखार कम करने वाली दवा।`
  - `te`: `జ్వరాన్ని తగ్గించడానికి ఉపయోగించే మందు.`
  - `kn`: `ಜ್ವರವನ್ನು ಕಡಿಮೆ ಮಾಡಲು ಬಳಸುವ ಔಷಧ.`
- **`expiry date`**:
  - `en`: *The final printed date after which the manufacturer does not guarantee full strength or safety.*
  - `ta`: `மருந்தின் முழுத் திறனும் பாதுகாப்பும் உத்தரவாதம் செய்யப்படும் இறுதி அச்சிடப்பட்ட தேதி.`
  - `hi`: `वह अंतिम मुद्रित तिथि जिसके बाद दवा की पूर्ण गुणवत्ता और सुरक्षा सुनिश्चित नहीं होती।`
  - `te`: `మందు పూర్తి సామర్థ్యం మరియు భద్రతకు తయారీదారు హామీ ఇచ్చే చివరి తేదీ.`
  - `kn`: `ಔಷಧದ ಸಂಪೂರ್ಣ ಸಾಮರ್ಥ್ಯ ಮತ್ತು ಸುರಕ್ಷತೆಗೆ ತಯಾರಕರು ಖಾತರಿ ನೀಡುವ ಅಂತಿಮ ದಿನಾಂಕ.`

---

## 5. Terminology Governance & Native Reviewer Workflow

1. Run `backend\.venv\Scripts\python.exe backend/scripts/export_translations_for_review.py` to regenerate [translation_review_export.json](file:///C:/Users/Adox/Desktop/medora_mp/docs/translation_review_export.json) (all `288` keys × `13` languages).
2. Domain reviewers mark `"approved_by_native_reviewer"` per language after confirming grammatical accuracy and native vocabulary compliance.
3. Dynamic medicine search aliases submitted via `POST /api/nlp/catalog/{medicine_id}/aliases` enter as `PENDING_REVIEW` unless created by a `PLATFORM_ADMIN`, and require admin approval (`PATCH /api/nlp/aliases/{alias_id}/review`) before live search ranking.
