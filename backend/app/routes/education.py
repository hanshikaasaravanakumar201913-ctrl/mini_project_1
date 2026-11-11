from typing import Optional
from fastapi import APIRouter, Body, File, Form, Query, UploadFile
from backend.app.education_data import MEDICINE_INFO_CATALOG, SYMPTOM_GUIDANCE_CATALOG
from backend.app.ocr_service import ocr_service
from backend.app.barcode_service import barcode_service

router = APIRouter(prefix="/education", tags=["Education & Scanning"])


@router.get("/medicines")
def search_medicine_info(q: Optional[str] = Query(None, description="Search term")):
    if not q:
        return MEDICINE_INFO_CATALOG

    query_str = q.strip().lower()
    matches = []
    for item in MEDICINE_INFO_CATALOG:
        in_generic = query_str in item["generic_name"].lower()
        in_brand = any(query_str in b.lower() for b in item["common_brands"])
        in_class = query_str in item["therapeutic_class"].lower()
        in_purpose = query_str in item["general_purpose"].lower()

        if in_generic or in_brand or in_class or in_purpose:
            matches.append(item)

    return matches


@router.get("/symptoms")
def get_symptom_guidance(q: Optional[str] = None):
    if not q:
        return SYMPTOM_GUIDANCE_CATALOG

    query_str = q.strip().lower()
    return [
        s
        for s in SYMPTOM_GUIDANCE_CATALOG
        if query_str in s["symptom"].lower() or query_str in s["general_overview"].lower()
    ]


@router.post("/ocr/parse")
def parse_ocr_input(
    raw_text: Optional[str] = Body(None, embed=True),
    filename: Optional[str] = Body(None, embed=True),
):
    return ocr_service.parse_text_or_image(raw_text=raw_text or "", filename=filename or "")


@router.post("/ocr/upload")
async def parse_ocr_upload(
    file: UploadFile = File(...),
    raw_text: Optional[str] = Form(None),
):
    data = await file.read()
    return ocr_service.parse_text_or_image(
        raw_text=raw_text or "",
        filename=file.filename or "",
        image_bytes=data,
    )


@router.get("/barcode/{code}")
def lookup_barcode(code: str):
    return barcode_service.lookup_barcode(code)
