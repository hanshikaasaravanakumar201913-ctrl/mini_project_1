import difflib
import json
import math
import re
import unicodedata
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from backend.app.language_registry import SUPPORTED_LANGUAGES, sanitize_language_code
from backend.app.models import (
    CanonicalMedicineCatalog,
    MedicineMultilingualAlias,
    Pharmacy,
    PharmacyMedicine,
)

# Unicode block ranges for Indian scripts and Urdu
SCRIPT_RANGES: List[Tuple[str, int, int]] = [
    ("ta", 0x0B80, 0x0BFF),  # Tamil
    ("te", 0x0C00, 0x0C7F),  # Telugu
    ("kn", 0x0C80, 0x0CFF),  # Kannada
    ("ml", 0x0D00, 0x0D7F),  # Malayalam
    ("gu", 0x0A80, 0x0AFF),  # Gujarati
    ("pa", 0x0A00, 0x0A7F),  # Gurmukhi (Punjabi)
    ("or", 0x0B00, 0x0B7F),  # Odia
    ("ur", 0x0600, 0x06FF),  # Arabic / Nastaliq Urdu
    ("bn", 0x0980, 0x09FF),  # Bengali / Assamese (refined below)
    ("hi", 0x0900, 0x097F),  # Devanagari Hindi / Marathi (refined below)
]

ASSAMESE_HINT_CHARS = {"ৰ", "ৱ"}
ASSAMESE_HINT_WORDS = {"দৰৱ", "জ্বৰ", "বিষ", "চিকিৎসা", "খোৰাক", "প্ৰেছক্ৰিপশ্বন"}
MARATHI_HINT_WORDS = {"औषध", "औषधे", "ताप", "डोकेदुखी", "गोळी", "मधुमेह", "मुदत"}


def normalize_unicode_and_digits(text: str) -> str:
    """
    Applies NFKC normalization, removes invisible zero-width BOM/SP marks,
    and converts regional Indic / Arabic-Indic numerals into ASCII digits.
    Combining vowel signs (matras/viramas) are intentionally preserved.
    """
    nfkc = unicodedata.normalize("NFKC", text or "")
    out_chars: List[str] = []
    for ch in nfkc:
        if ch in ("\u200b", "\ufeff"):
            continue
        if unicodedata.category(ch) == "Nd":
            try:
                out_chars.append(str(unicodedata.digit(ch)))
                continue
            except (TypeError, ValueError):
                pass
        out_chars.append(ch)
    return "".join(out_chars)


def detect_query_language(text: str, preferred_fallback: str = "en") -> str:
    """Identifies the primary script/language of a query using Unicode blocks and lexical markers."""
    clean = normalize_unicode_and_digits(text)
    counts: Dict[str, int] = {}
    for ch in clean:
        cp = ord(ch)
        for lang_code, start, end in SCRIPT_RANGES:
            if start <= cp <= end:
                counts[lang_code] = counts.get(lang_code, 0) + 1
                break

    if not counts:
        # Latin script: keep fallback if non-Indic or default to 'en'
        fb = sanitize_language_code(preferred_fallback)
        return "en" if fb != "en" and any("a" <= c.lower() <= "z" for c in clean) else fb

    dominant = max(counts.items(), key=lambda item: item[1])[0]
    if dominant == "bn":
        if any(ch in clean for ch in ASSAMESE_HINT_CHARS) or any(w in clean for w in ASSAMESE_HINT_WORDS):
            return "as"
        if preferred_fallback == "as":
            return "as"
        return "bn"

    if dominant == "hi":
        if any(w in clean for w in MARATHI_HINT_WORDS) or preferred_fallback == "mr":
            return "mr"
        return "hi"

    return dominant


def clean_text_for_matching(text: str) -> str:
    """
    Normalizes Unicode, converts digits, lowercases Latin characters, and replaces
    punctuation/symbols with spaces while keeping Unicode word letters & combining marks.
    """
    normalized = normalize_unicode_and_digits(text).lower()
    cleaned_chars: List[str] = []
    for ch in normalized:
        cat = unicodedata.category(ch)
        if cat.startswith(("L", "M", "N")) or ch in ("\u200c", "\u200d"):
            cleaned_chars.append(ch)
        else:
            cleaned_chars.append(" ")
    collapsed = re.sub(r"\s+", " ", "".join(cleaned_chars)).strip()
    return collapsed


def normalize_phonetic_latin(token: str) -> str:
    """Reduces common spelling and phonetic variations for Latin medicine terms."""
    if not token or not token.isascii():
        return token
    t = token.lower()
    t = re.sub(r"ph", "f", t)
    t = re.sub(r"ae|oe", "e", t)
    t = re.sub(r"([a-z])\1+", r"\1", t)
    t = re.sub(r"(tablets?|capsules?|syrup|drops?|inhaler|medicine|meds?)", "", t)
    return t.strip()


def tokenize_query(text: str) -> Tuple[List[str], List[str]]:
    """
    Tokenizes cleaned text and separates dosage strength numeric tokens (e.g. '650', '500', '40').
    """
    cleaned = clean_text_for_matching(text)
    expanded = re.sub(r"(\d+)(mg|mcg|ml|g|iu)\b", r"\1 \2", cleaned)
    raw_tokens = [tok for tok in expanded.split(" ") if tok and tok not in {"mg", "mcg", "ml", "iu"}]
    strength_tokens = [tok for tok in raw_tokens if tok.isdigit()]
    return raw_tokens, strength_tokens


def char_ngram_cosine(a: str, b: str, n: int = 3) -> float:
    """Pure-Python character n-gram cosine similarity that works across all Indic and Latin scripts."""
    if not a or not b:
        return 0.0
    a_pad = f" {a} "
    b_pad = f" {b} "
    if len(a_pad) < n or len(b_pad) < n:
        return 1.0 if a == b else difflib.SequenceMatcher(None, a, b).ratio()

    va = Counter(a_pad[i : i + n] for i in range(len(a_pad) - n + 1))
    vb = Counter(b_pad[i : i + n] for i in range(len(b_pad) - n + 1))
    dot = sum(va[k] * vb[k] for k in va.keys() & vb.keys())
    if dot == 0:
        return 0.0
    norm_a = math.sqrt(sum(v * v for v in va.values()))
    norm_b = math.sqrt(sum(v * v for v in vb.values()))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _score_candidate_strings(
    query_clean: str,
    query_tokens: List[str],
    query_strengths: List[str],
    target_text: str,
    target_strength: Optional[str],
) -> Tuple[float, str]:
    target_clean = clean_text_for_matching(target_text)
    if not target_clean or not query_clean:
        return 0.0, "NONE"

    # 1. Exact full string match
    if query_clean == target_clean:
        return 1.0, "EXACT"

    # 2. Exact token match (ignoring trailing dosage tokens like '650' or 'mg')
    q_non_num = " ".join(t for t in query_tokens if not t.isdigit())
    target_tokens, _ = tokenize_query(target_clean)
    t_non_num = " ".join(t for t in target_tokens if not t.isdigit())

    if q_non_num and t_non_num and q_non_num == t_non_num:
        base = 0.96
        match_kind = "EXACT"
    elif target_clean.startswith(query_clean) and len(query_clean) >= 3:
        base = 0.91
        match_kind = "PREFIX"
    elif len(query_clean) >= 3 and (query_clean in target_clean or target_clean in query_clean):
        base = 0.87
        match_kind = "PREFIX"
    else:
        # 3. Token Jaccard + Character 3-gram cosine + Phonetic fuzzy similarity
        q_set = set(query_tokens)
        t_set = set(target_tokens)
        jaccard = (len(q_set & t_set) / len(q_set | t_set)) if (q_set and t_set) else 0.0

        ngram = char_ngram_cosine(query_clean, target_clean, n=3)
        q_phon = " ".join(normalize_phonetic_latin(t) for t in query_tokens if not t.isdigit()).strip()
        t_phon = " ".join(normalize_phonetic_latin(t) for t in target_tokens if not t.isdigit()).strip()
        phon_sim = (
            difflib.SequenceMatcher(None, q_phon, t_phon).ratio()
            if (q_phon and t_phon and q_phon.isascii() and t_phon.isascii())
            else 0.0
        )

        # Evaluate best individual token-to-token fuzzy similarity for single typo tolerance
        best_tok_sim = 0.0
        for qt in query_tokens:
            if qt.isdigit() or len(qt) < 3:
                continue
            qp = normalize_phonetic_latin(qt)
            for tt in target_tokens:
                if tt.isdigit() or len(tt) < 3:
                    continue
                tp = normalize_phonetic_latin(tt)
                sim = difflib.SequenceMatcher(None, qp if (qp.isascii() and tp.isascii()) else qt, tp if (qp.isascii() and tp.isascii()) else tt).ratio()
                if sim > best_tok_sim:
                    best_tok_sim = sim

        base = max(ngram * 0.86, jaccard * 0.88, phon_sim * 0.85, best_tok_sim * 0.84)
        if base < 0.48:
            return 0.0, "NONE"
        match_kind = "PHONETIC_FUZZY" if phon_sim >= ngram or best_tok_sim >= ngram else "TOKEN_SIMILARITY"

    # Strength alignment bonus/penalty ensures 'Dolo 650' ranks above 'Calpol 500' when 650 given
    if query_strengths and target_strength:
        ts_clean = clean_text_for_matching(target_strength)
        ts_nums = set(re.findall(r"\d+", ts_clean))
        if ts_nums:
            if set(query_strengths) & ts_nums:
                base = min(1.0, base + 0.05)
            else:
                base = max(0.35, base - 0.12)

    return round(min(1.0, base), 4), match_kind


class MultilingualMedicineNLPService:
    """
    Deterministic, explainable Python NLP search engine over canonical medicine records
    and verified multilingual aliases across 13 Indian languages.
    """

    @staticmethod
    def _pharmacy_counts(db: Session) -> Dict[str, int]:
        rows = (
            db.query(PharmacyMedicine)
            .join(Pharmacy)
            .filter(
                Pharmacy.is_active == True,
                Pharmacy.verification_status == "VERIFIED",
                PharmacyMedicine.is_available == True,
            )
            .all()
        )
        counts: Dict[str, int] = {}
        for r in rows:
            key = clean_text_for_matching(r.generic_name or r.medicine_name)
            if key:
                counts[key] = counts.get(key, 0) + 1
        return counts

    @classmethod
    def search_medicines(
        cls,
        db: Session,
        query: str,
        preferred_language: str = "en",
        limit: int = 8,
        include_pharmacy_counts: bool = True,
        extra_candidate_terms: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        raw_query = (query or "").strip()
        normalized_query = clean_text_for_matching(raw_query)
        detected_lang = detect_query_language(raw_query, preferred_fallback=preferred_language)
        query_tokens, query_strengths = tokenize_query(raw_query)

        if not normalized_query:
            return {
                "query": raw_query,
                "normalized_query": "",
                "detected_language": detected_lang,
                "status": "NO_MATCH",
                "requires_confirmation": False,
                "results": [],
                "clarification_prompt": "Enter a medicine name, generic compound, strength, or symptom description.",
            }

        catalog = (
            db.query(CanonicalMedicineCatalog)
            .filter(CanonicalMedicineCatalog.review_status == "APPROVED")
            .all()
        )
        ph_counts = cls._pharmacy_counts(db) if include_pharmacy_counts else {}

        search_queries = [(normalized_query, query_tokens, query_strengths, False)]
        for extra in extra_candidate_terms or []:
            ex_clean = clean_text_for_matching(extra)
            if ex_clean and ex_clean != normalized_query:
                ex_tok, ex_str = tokenize_query(extra)
                search_queries.append((ex_clean, ex_tok, ex_str, True))

        ranked: List[Dict[str, Any]] = []

        for med in catalog:
            brands: List[str] = []
            try:
                brands = json.loads(med.brand_names_json or "[]")
            except Exception:
                brands = []

            best_score = 0.0
            best_kind = "NONE"
            best_alias_info: Optional[Dict[str, Any]] = None

            # Core canonical strings
            core_candidates = [
                (med.canonical_name, "CANONICAL", med.canonical_name),
                (med.generic_name, "GENERIC", med.generic_name),
                (med.active_ingredient, "ACTIVE_INGREDIENT", med.active_ingredient),
            ] + [(b, "BRAND", b) for b in brands]

            for q_clean, q_tok, q_str, is_assisted in search_queries:
                penalty = 0.90 if is_assisted else 1.0
                for cand_text, cand_type, display_text in core_candidates:
                    sc, mk = _score_candidate_strings(q_clean, q_tok, q_str, cand_text, med.strength)
                    sc = round(sc * penalty, 4)
                    if sc > best_score:
                        best_score = sc
                        best_kind = mk
                        best_alias_info = {
                            "language_code": "en",
                            "alias_text": display_text,
                            "alias_type": cand_type,
                            "review_status": med.review_status,
                        }

                # Approved multilingual aliases only (machine drafts are never auto-trusted)
                for al in med.aliases:
                    if al.review_status != "APPROVED":
                        continue
                    sc, mk = _score_candidate_strings(q_clean, q_tok, q_str, al.alias_text, med.strength)
                    # Slight boost when matching user's active script/language
                    if sc > 0 and al.language_code == detected_lang:
                        sc = min(1.0, round(sc + 0.02, 4))
                    sc = round(sc * penalty, 4)
                    if sc > best_score:
                        best_score = sc
                        best_kind = "MULTILINGUAL_ALIAS" if mk == "TOKEN_SIMILARITY" else mk
                        best_alias_info = {
                            "language_code": al.language_code,
                            "alias_text": al.alias_text,
                            "alias_type": al.alias_type,
                            "review_status": al.review_status,
                        }

            if best_score >= 0.50:
                gen_key = clean_text_for_matching(med.generic_name)
                offer_count = ph_counts.get(gen_key, 0)
                ranked.append(
                    {
                        "medicine_id": med.id,
                        "canonical_code": med.canonical_code,
                        "canonical_name": med.canonical_name,
                        "generic_name": med.generic_name,
                        "active_ingredient": med.active_ingredient,
                        "brand_names": brands,
                        "strength": med.strength or "",
                        "dosage_form": med.dosage_form or "",
                        "therapeutic_category": med.therapeutic_category or "",
                        "score": round(best_score, 3),
                        "match_type": best_kind,
                        "matched_alias": best_alias_info,
                        "localized_explanation": med.simple_explanation or "",
                        "pharmacy_offer_count": offer_count,
                    }
                )

        # Rank strictly by score desc, exact/prefix first, generic name asc
        kind_priority = {
            "EXACT": 4,
            "PREFIX": 3,
            "MULTILINGUAL_ALIAS": 2,
            "TOKEN_SIMILARITY": 2,
            "PHONETIC_FUZZY": 1,
        }
        ranked.sort(
            key=lambda r: (
                -r["score"],
                -kind_priority.get(r["match_type"], 0),
                r["canonical_name"],
            )
        )
        ranked = ranked[:limit]

        if not ranked:
            return {
                "query": raw_query,
                "normalized_query": normalized_query,
                "detected_language": detected_lang,
                "status": "NO_MATCH",
                "requires_confirmation": False,
                "results": [],
                "clarification_prompt": "No verified medicine matched your query. Try brand, generic name, or strength.",
            }

        top = ranked[0]
        is_exact_clear = top["score"] >= 0.94 and (
            len(ranked) == 1 or (top["score"] - ranked[1]["score"]) >= 0.08
        )

        # Require explicit human confirmation when confidence is moderate or top matches tie closely
        close_tie = len(ranked) > 1 and (top["score"] - ranked[1]["score"]) < 0.07
        needs_confirm = (not is_exact_clear) and (top["score"] < 0.85 or close_tie or top["match_type"] == "PHONETIC_FUZZY")

        status_str = "AMBIGUOUS_CONFIRMATION_REQUIRED" if needs_confirm else "HIGH_CONFIDENCE"
        clarification = None
        if needs_confirm:
            top_names = ", ".join(r["canonical_name"] for r in ranked[:3])
            clarification = f"Please confirm the intended medicine before continuing: {top_names}"

        return {
            "query": raw_query,
            "normalized_query": normalized_query,
            "detected_language": detected_lang,
            "status": status_str,
            "requires_confirmation": needs_confirm,
            "results": ranked,
            "clarification_prompt": clarification,
        }

    @classmethod
    def get_suggestions(
        cls,
        db: Session,
        prefix: str = "",
        language_code: str = "en",
        limit: int = 10,
    ) -> List[Dict[str, str]]:
        lang = sanitize_language_code(language_code)
        pref_clean = clean_text_for_matching(prefix)

        suggestions: List[Dict[str, str]] = []
        seen = set()

        aliases = (
            db.query(MedicineMultilingualAlias)
            .filter(
                MedicineMultilingualAlias.review_status == "APPROVED",
                MedicineMultilingualAlias.language_code.in_([lang, "en"]),
            )
            .all()
        )
        # Prefer target language aliases first
        aliases.sort(key=lambda a: (0 if a.language_code == lang else 1, a.alias_text))

        for al in aliases:
            al_clean = clean_text_for_matching(al.alias_text)
            if pref_clean and pref_clean not in al_clean:
                continue
            key = (al.alias_text.lower(), al.canonical_medicine_id)
            if key in seen:
                continue
            seen.add(key)
            canon = al.canonical_medicine
            suggestions.append(
                {
                    "text": al.alias_text,
                    "language_code": al.language_code,
                    "canonical_name": canon.canonical_name if canon else "",
                    "alias_type": al.alias_type,
                }
            )
            if len(suggestions) >= limit:
                return suggestions

        return suggestions


nlp_search_service = MultilingualMedicineNLPService()
