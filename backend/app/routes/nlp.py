from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.language_registry import LANGUAGE_BY_CODE, SUPPORTED_LANGUAGES, sanitize_language_code
from backend.app.llm_service import llm_service
from backend.app.models import CanonicalMedicineCatalog, MedicineMultilingualAlias, User
from backend.app.nlp_search_service import clean_text_for_matching, nlp_search_service
from backend.app.schemas import (
    LlmTermExplainRequest,
    LlmTranslationDraftRequest,
    MedicineAliasCreateRequest,
    MedicineAliasReviewRequest,
    NlpMedicineSearchRequest,
)
from backend.app.security import get_current_user, require_roles

router = APIRouter(prefix="/nlp", tags=["Multilingual NLP Search & Assisted LLM"])


@router.get("/supported-languages")
def get_supported_languages():
    return {
        "default_language": "en",
        "count": len(SUPPORTED_LANGUAGES),
        "languages": SUPPORTED_LANGUAGES,
    }


@router.post("/medicine-search")
def multilingual_medicine_search(
    payload: NlpMedicineSearchRequest,
    db: Session = Depends(get_db),
):
    pref_lang = sanitize_language_code(payload.preferred_language)
    res = nlp_search_service.search_medicines(
        db=db,
        query=payload.query,
        preferred_language=pref_lang,
        limit=payload.limit,
        include_pharmacy_counts=payload.include_pharmacy_counts,
    )

    llm_used = False
    if payload.use_llm_assist and res["status"] == "NO_MATCH":
        extra_terms = llm_service.extract_search_candidates(
            payload.query, detected_language=res["detected_language"]
        )
        if extra_terms:
            llm_used = True
            res = nlp_search_service.search_medicines(
                db=db,
                query=payload.query,
                preferred_language=pref_lang,
                limit=payload.limit,
                include_pharmacy_counts=payload.include_pharmacy_counts,
                extra_candidate_terms=extra_terms,
            )

    res["llm_assist_used"] = llm_used
    return res


@router.get("/search-suggestions")
def get_search_suggestions(
    q: str = Query("", max_length=120),
    lang: str = Query("en"),
    limit: int = Query(10, ge=1, le=25),
    db: Session = Depends(get_db),
):
    clean_lang = sanitize_language_code(lang)
    suggestions = nlp_search_service.get_suggestions(
        db=db, prefix=q, language_code=clean_lang, limit=limit
    )
    return {
        "language_code": clean_lang,
        "prefix": q,
        "suggestions": suggestions,
    }


@router.get("/catalog")
def list_canonical_catalog(
    include_unapproved_aliases: bool = Query(False),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(CanonicalMedicineCatalog)
        .filter(CanonicalMedicineCatalog.review_status == "APPROVED")
        .order_by(CanonicalMedicineCatalog.canonical_name.asc())
        .all()
    )
    output: List[dict] = []
    for med in rows:
        aliases = [
            {
                "id": a.id,
                "language_code": a.language_code,
                "alias_text": a.alias_text,
                "alias_type": a.alias_type,
                "script_name": a.script_name,
                "review_status": a.review_status,
                "notes": a.notes,
            }
            for a in med.aliases
            if include_unapproved_aliases or a.review_status == "APPROVED"
        ]
        output.append(
            {
                "id": med.id,
                "canonical_code": med.canonical_code,
                "canonical_name": med.canonical_name,
                "generic_name": med.generic_name,
                "active_ingredient": med.active_ingredient,
                "strength": med.strength,
                "dosage_form": med.dosage_form,
                "therapeutic_category": med.therapeutic_category,
                "review_status": med.review_status,
                "aliases": aliases,
            }
        )
    return output


@router.post("/catalog/{medicine_id}/aliases", status_code=201)
def propose_or_add_medicine_alias(
    medicine_id: int,
    payload: MedicineAliasCreateRequest,
    user: User = Depends(require_roles("PLATFORM_ADMIN", "PHARMACY_STAFF", "HOUSEHOLD_OWNER")),
    db: Session = Depends(get_db),
):
    med = db.query(CanonicalMedicineCatalog).filter(CanonicalMedicineCatalog.id == medicine_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Canonical medicine not found.")

    lang = sanitize_language_code(payload.language_code)
    norm = clean_text_for_matching(payload.alias_text)
    if not norm:
        raise HTTPException(status_code=400, detail="Alias text cannot be empty after normalization.")

    initial_status = "APPROVED" if user.role == "PLATFORM_ADMIN" else "PENDING_REVIEW"
    alias = MedicineMultilingualAlias(
        canonical_medicine_id=med.id,
        language_code=lang,
        alias_text=payload.alias_text.strip(),
        normalized_alias=norm,
        alias_type=payload.alias_type.strip().upper(),
        script_name=LANGUAGE_BY_CODE[lang]["script"],
        review_status=initial_status,
        notes=payload.notes,
        approved_by_user_id=user.id if initial_status == "APPROVED" else None,
    )
    db.add(alias)
    db.commit()
    db.refresh(alias)
    return {
        "id": alias.id,
        "canonical_medicine_id": alias.canonical_medicine_id,
        "language_code": alias.language_code,
        "alias_text": alias.alias_text,
        "review_status": alias.review_status,
    }


@router.patch("/aliases/{alias_id}/review")
def review_medicine_alias(
    alias_id: int,
    payload: MedicineAliasReviewRequest,
    user: User = Depends(require_roles("PLATFORM_ADMIN")),
    db: Session = Depends(get_db),
):
    alias = db.query(MedicineMultilingualAlias).filter(MedicineMultilingualAlias.id == alias_id).first()
    if not alias:
        raise HTTPException(status_code=404, detail="Multilingual alias not found.")

    target_status = payload.review_status.strip().upper()
    if target_status not in ("APPROVED", "PENDING_REVIEW", "REJECTED", "DRAFT_MACHINE"):
        raise HTTPException(status_code=400, detail="Invalid review status.")

    alias.review_status = target_status
    if payload.notes:
        alias.notes = payload.notes.strip()
    if target_status == "APPROVED":
        alias.approved_by_user_id = user.id
    db.commit()
    db.refresh(alias)
    return {
        "id": alias.id,
        "alias_text": alias.alias_text,
        "language_code": alias.language_code,
        "review_status": alias.review_status,
    }


@router.post("/llm/explain-term")
def explain_medical_term(payload: LlmTermExplainRequest):
    try:
        return llm_service.explain_medical_term(
            term=payload.term,
            target_language=payload.target_language,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/llm/translation-draft")
def draft_translation_suggestion(
    payload: LlmTranslationDraftRequest,
    _user: User = Depends(require_roles("PLATFORM_ADMIN")),
):
    try:
        return llm_service.generate_translation_draft(
            source_text=payload.source_text,
            target_language=payload.target_language,
            concept_domain=payload.concept_domain,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
