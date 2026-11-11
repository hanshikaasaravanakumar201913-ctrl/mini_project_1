import json
import re
from abc import ABC, abstractmethod
from typing import Any, Dict, List

import httpx

from backend.app.config import settings
from backend.app.language_registry import LANGUAGE_BY_CODE, sanitize_language_code

# Privacy safeguard: reject accidental transmission of PII/private household medical records
SENSITIVE_PATTERNS = [
    re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+"),  # email addresses
    re.compile(r"\+?\d[\d\s-]{8,}\d"),  # phone numbers
    re.compile(r"\b(prescription_id|household_id|passport_token|batch_number)\b", re.I),
]

DETERMINISTIC_GLOSSARY: Dict[str, Dict[str, str]] = {
    "antipyretic": {
        "en": "A medicine used to reduce fever.",
        "ta": "காய்ச்சலைக் குறைக்க உதவும் மருந்து.",
        "hi": "बुखार कम करने वाली दवा।",
        "te": "జ్వరాన్ని తగ్గించడానికి ఉపయోగించే మందు.",
        "kn": "ಜ್ವರವನ್ನು ಕಡಿಮೆ ಮಾಡಲು ಬಳಸುವ ಔಷಧ.",
    },
    "analgesic": {
        "en": "A medicine that helps relieve mild to moderate physical pain.",
        "ta": "உடல் வலியைக் குறைக்க உதவும் மருந்து.",
        "hi": "शारीरिक दर्द से राहत देने वाली दवा।",
        "te": "శరీర నొప్పిని తగ్గించడానికి సహాయపడే మందు.",
        "kn": "ದೇಹದ ನೋವನ್ನು ಕಡಿಮೆ ಮಾಡಲು ಸಹಾಯ ಮಾಡುವ ಔಷಧ.",
    },
    "antihistamine": {
        "en": "A medicine that helps calm allergy symptoms such as sneezing, itching, or runny nose.",
        "ta": "தும்மல், அரிப்பு போன்ற ஒவ்வாமை அறிகுறிகளைக் குறைக்கும் மருந்து.",
        "hi": "छींक या खुजली जैसे एलर्जी लक्षणों को शांत करने वाली दवा।",
        "te": "తుమ్ములు, దురద వంటి ఎలర్జీ లక్షణాలను తగ్గించే మందు.",
        "kn": "ಸೀನು, ತುರಿಕೆ ಮುಂತಾದ ಅಲರ್ಜಿ ಲಕ್ಷಣಗಳನ್ನು ಶಮನಗೊಳಿಸುವ ಔಷಧ.",
    },
    "antibiotic": {
        "en": "An antibacterial medicine for bacterial infections; always complete only as prescribed by a doctor.",
        "ta": "பாக்டீரியா தொற்றுக்கு எதிரான மருந்து; மருத்துவர் பரிந்துரைப்படி மட்டுமே முழுமையாக எடுக்க வேண்டும்.",
        "hi": "जीवाणु संक्रमण के लिए दवा; इसे केवल चिकित्सक के परामर्श के अनुसार ही लें।",
        "te": "బ్యాక్టీరియా సంక్రమణలకు వాడే మందు; వైద్యుల సూచన మేరకు మాత్రమే తీసుకోవాలి.",
        "kn": "ಬ್ಯಾಕ್ಟೀರಿಯಾ ಸೋಂಕುಗಳಿಗೆ ಬಳಸುವ ಔಷಧ; ವೈದ್ಯರ ಸಲಹೆಯಂತೆ ಮಾತ್ರ ತೆಗೆದುಕೊಳ್ಳಬೇಕು.",
    },
    "antidiabetic": {
        "en": "A medicine that helps control blood glucose levels in diabetes under medical supervision.",
        "ta": "மருத்துவ ஆலோசனையின் கீழ் இரத்த சர்க்கரை அளவைக் கட்டுப்படுத்த உதவும் மருந்து.",
        "hi": "चिकित्सीय देखरेख में रक्त शर्करा स्तर को नियंत्रित रखने की दवा।",
        "te": "వైద్య పర్యవేక్షణలో రక్తంలో చక్కెర స్థాయిని నియంత్రించే మందు.",
        "kn": "ವೈದ್ಯರ ಮೇಲ್ವಿಚಾರಣೆಯಲ್ಲಿ ರಕ್ತದ ಸಕ್ಕರೆ ಮಟ್ಟವನ್ನು ನಿಯಂತ್ರಿಸುವ ಔಷಧ.",
    },
    "expiry date": {
        "en": "The final printed date after which the manufacturer does not guarantee full strength or safety.",
        "ta": "மருந்தின் முழுத் திறனும் பாதுகாப்பும் உத்தரவாதம் செய்யப்படும் இறுதி அச்சிடப்பட்ட தேதி.",
        "hi": "वह अंतिम मुद्रित तिथि जिसके बाद दवा की पूर्ण गुणवत्ता और सुरक्षा सुनिश्चित नहीं होती।",
        "te": "మందు పూర్తి సామర్థ్యం మరియు భద్రతకు తయారీదారు హామీ ఇచ్చే చివరి తేదీ.",
        "kn": "ಔಷಧದ ಸಂಪೂರ್ಣ ಸಾಮರ್ಥ್ಯ ಮತ್ತು ಸುರಕ್ಷತೆಗೆ ತಯಾರಕರು ಖಾತರಿ ನೀಡುವ ಅಂತಿಮ ದಿನಾಂಕ.",
    },
}


def assert_privacy_safe_input(text: str) -> None:
    for pat in SENSITIVE_PATTERNS:
        if pat.search(text or ""):
            raise ValueError("Outbound text blocked by privacy guard: contains potential PII or private identifiers.")


class BaseLLMProvider(ABC):
    provider_name: str = "base"

    @abstractmethod
    def complete_json(self, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
        raise NotImplementedError


class DisabledLLMProvider(BaseLLMProvider):
    provider_name = "disabled"

    def complete_json(self, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
        raise RuntimeError("External LLM provider is disabled or not configured.")


class OpenAICompatibleLLMProvider(BaseLLMProvider):
    provider_name = "openai_compatible"

    def __init__(self, api_key: str, base_url: str, model: str, timeout_sec: float = 8.0):
        self.api_key = api_key
        self.base_url = base_url
        self.model = model
        self.timeout_sec = timeout_sec

    def complete_json(self, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
        if not self.api_key:
            raise RuntimeError("LLM_API_KEY is not configured.")
        assert_privacy_safe_input(user_prompt)

        payload = {
            "model": self.model,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        with httpx.Client(timeout=self.timeout_sec) as client:
            res = client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
            res.raise_for_status()
            data = res.json()

        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        if not isinstance(parsed, dict):
            raise ValueError("LLM response did not parse into a JSON object.")
        return parsed


def build_llm_provider() -> BaseLLMProvider:
    if settings.LLM_PROVIDER == "openai_compatible" and settings.LLM_API_KEY:
        return OpenAICompatibleLLMProvider(
            api_key=settings.LLM_API_KEY,
            base_url=settings.LLM_BASE_URL,
            model=settings.LLM_MODEL,
            timeout_sec=settings.LLM_TIMEOUT_SEC,
        )
    return DisabledLLMProvider()


class ControlledLLMService:
    """
    Provider-independent controlled LLM enhancement service with:
    - Privacy guards blocking PII or private prescriptions
    - Strict non-prescriptive medical guardrails
    - Deterministic offline fallbacks whenever credentials are absent or external calls fail
    """

    def __init__(self, provider: BaseLLMProvider | None = None):
        self._override_provider = provider

    @property
    def provider(self) -> BaseLLMProvider:
        return self._override_provider or build_llm_provider()

    def explain_medical_term(self, term: str, target_language: str = "en") -> Dict[str, Any]:
        lang = sanitize_language_code(target_language)
        lang_meta = LANGUAGE_BY_CODE[lang]
        clean_term = (term or "").strip()
        assert_privacy_safe_input(clean_term)

        term_key = clean_term.lower()
        deterministic_hit = DETERMINISTIC_GLOSSARY.get(term_key)

        try:
            sys_prompt = (
                "You are a cautious medical terminology educator. Explain the requested medical term in "
                f"{lang_meta['english_name']} ({lang_meta['native_name']}) in plain, everyday non-diagnostic language. "
                "NEVER recommend dosages, diagnoses, or drug substitutions. "
                "Return JSON strictly with keys: {\"explanation\": string, \"caution_note\": string}."
            )
            out = self.provider.complete_json(sys_prompt, f"Term: {clean_term}")
            explanation = str(out.get("explanation", "")).strip()
            if not explanation:
                raise ValueError("Empty explanation from LLM.")
            return {
                "term": clean_term,
                "target_language": lang,
                "explanation": explanation,
                "caution_note": str(out.get("caution_note", "")).strip()
                or "Educational summary only. Consult a doctor or pharmacist for clinical advice.",
                "source_mode": "LLM_ASSISTED_DRAFT",
                "requires_human_review": True,
            }
        except Exception:
            if deterministic_hit:
                fallback_text = deterministic_hit.get(lang) or deterministic_hit["en"]
            else:
                fallback_text = (
                    f"Verified local explanation for '{clean_term}' is not yet localized into {lang_meta['native_name']}. "
                    "Consult your pharmacist or physician for clinical meaning."
                )
            return {
                "term": clean_term,
                "target_language": lang,
                "explanation": fallback_text,
                "caution_note": "Deterministic reference glossary fallback. Educational only, never a prescription.",
                "source_mode": "DETERMINISTIC_FALLBACK",
                "requires_human_review": False,
            }

    def extract_search_candidates(self, query: str, detected_language: str = "en") -> List[str]:
        """
        Optionally expands natural-language symptom/medicine queries into generic English keywords
        ONLY to query the verified canonical database. Returns [] silently on failure or block.
        """
        clean_q = (query or "").strip()
        if not clean_q:
            return []
        try:
            assert_privacy_safe_input(clean_q)
            sys_prompt = (
                "Extract up to 3 standard generic medicine names or symptom search keywords from the query "
                "for database lookup ONLY. Never invent dosages or prescribe. "
                "Return JSON strictly as {\"search_keywords\": [string]}."
            )
            out = self.provider.complete_json(
                sys_prompt, f"Language hint: {detected_language}. Query: {clean_q}"
            )
            kws = out.get("search_keywords", [])
            if not isinstance(kws, list):
                return []
            return [str(k).strip() for k in kws[:3] if isinstance(k, str) and k.strip()]
        except Exception:
            return []

    def generate_translation_draft(
        self, source_text: str, target_language: str, concept_domain: str = "pharmacy_ui"
    ) -> Dict[str, Any]:
        lang = sanitize_language_code(target_language)
        lang_meta = LANGUAGE_BY_CODE[lang]
        clean_src = (source_text or "").strip()
        assert_privacy_safe_input(clean_src)

        try:
            sys_prompt = (
                f"Translate this {concept_domain} UI string into natural {lang_meta['english_name']} "
                f"({lang_meta['native_name']}, script: {lang_meta['script']}). "
                "Do NOT transliterate English words into Indian script. Keep drug brand names intact. "
                "Return JSON strictly as {\"draft_translation\": string, \"terminology_notes\": string}."
            )
            out = self.provider.complete_json(sys_prompt, clean_src)
            draft = str(out.get("draft_translation", "")).strip()
            if not draft:
                raise ValueError("Missing draft_translation in LLM output.")
            return {
                "source_text": clean_src,
                "target_language": lang,
                "draft_translation": draft,
                "terminology_notes": str(out.get("terminology_notes", "")).strip(),
                "review_status": "DRAFT_MACHINE",
                "approved_for_production": False,
                "source_mode": "LLM_TRANSLATION_DRAFT",
            }
        except Exception:
            return {
                "source_text": clean_src,
                "target_language": lang,
                "draft_translation": "",
                "terminology_notes": (
                    "External LLM unavailable or unconfigured. Draft must be authored and reviewed by a bilingual reviewer."
                ),
                "review_status": "NEEDS_HUMAN_AUTHORING",
                "approved_for_production": False,
                "source_mode": "DETERMINISTIC_FALLBACK",
            }


llm_service = ControlledLLMService()
