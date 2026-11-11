import io
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from PIL import Image
from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.app.c_engine_bridge import c_engine
from backend.app.config import settings
from backend.app.database import get_db
from backend.app.expiry_engine import (
    calculate_days_until_expiry,
    evaluate_prescription_validity_notifications,
)
from backend.app.models import HouseholdMember, MedicineRecord, Prescription, User
from backend.app.ocr_service import ocr_service
from backend.app.schemas import PrescriptionResponse
from backend.app.security import get_current_user, resolve_household_access

router = APIRouter(prefix="/prescriptions", tags=["Prescription Vault"])

ALLOWED_MIME_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}


def _validate_upload_bytes(content: bytes, content_type: str, filename: str) -> str:
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(content) > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Uploaded file exceeds 10 MB safety limit.")

    ct = (content_type or "").lower().strip()
    ext = Path(filename or "").suffix.lower()

    if ct in ALLOWED_MIME_TYPES:
        target_ext = ALLOWED_MIME_TYPES[ct]
    elif ext in (".jpg", ".jpeg"):
        target_ext = ".jpg"
    elif ext == ".png":
        target_ext = ".png"
    elif ext == ".webp":
        target_ext = ".webp"
    elif ext == ".pdf":
        target_ext = ".pdf"
    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Only JPEG, PNG, WEBP images and PDF documents are allowed.",
        )

    # Verify magic bytes / image structure
    if target_ext == ".pdf":
        if not content.startswith(b"%PDF-"):
            raise HTTPException(status_code=400, detail="File header does not match a valid PDF document.")
    else:
        try:
            with Image.open(io.BytesIO(content)) as img:
                img.verify()
        except Exception:
            raise HTTPException(status_code=400, detail="Uploaded image could not be verified as a valid image.")

    return target_ext


def _serialize_prescription(p: Prescription) -> dict:
    days_left = None
    if p.valid_until:
        try:
            days_left = calculate_days_until_expiry(p.valid_until)
        except ValueError:
            days_left = None

    return {
        "id": p.id,
        "household_id": p.household_id,
        "member_id": p.member_id,
        "member_name": p.member.name if p.member else None,
        "title": p.title,
        "doctor_name": p.doctor_name,
        "clinic_name": p.clinic_name,
        "prescribed_date": p.prescribed_date,
        "valid_until": p.valid_until,
        "days_until_expiry": days_left,
        "notes": p.notes,
        "original_filename": p.original_filename,
        "mime_type": p.mime_type,
        "file_size_bytes": p.file_size_bytes,
        "ocr_extracted_text": p.ocr_extracted_text,
        "created_at": p.created_at,
    }


@router.get("", response_model=List[PrescriptionResponse])
def list_prescriptions(
    q: Optional[str] = Query(None),
    member_id: Optional[int] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = resolve_household_access(
        db, user, requested_household_id=household_id, required_permission="can_view_prescriptions"
    )
    query = db.query(Prescription).filter(Prescription.household_id == ctx.household.id)

    if member_id is not None:
        query = query.filter(Prescription.member_id == member_id)
    if from_date:
        query = query.filter(Prescription.prescribed_date >= from_date.strip())
    if to_date:
        query = query.filter(Prescription.prescribed_date <= to_date.strip())
    if q and q.strip():
        pat = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Prescription.title.ilike(pat),
                Prescription.doctor_name.ilike(pat),
                Prescription.clinic_name.ilike(pat),
                Prescription.notes.ilike(pat),
            )
        )

    rows = query.order_by(Prescription.prescribed_date.desc(), Prescription.id.desc()).all()
    return [_serialize_prescription(r) for r in rows]


@router.post("", response_model=PrescriptionResponse, status_code=201)
async def upload_prescription(
    title: str = Form(...),
    prescribed_date: str = Form(...),
    doctor_name: Optional[str] = Form(None),
    clinic_name: Optional[str] = Form(None),
    valid_until: Optional[str] = Form(None),
    member_id: Optional[int] = Form(None),
    notes: Optional[str] = Form(None),
    household_id: Optional[int] = Form(None),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = resolve_household_access(
        db, user, requested_household_id=household_id, required_permission="can_edit_medicines"
    )

    if member_id is not None:
        member = (
            db.query(HouseholdMember)
            .filter(HouseholdMember.id == member_id, HouseholdMember.household_id == ctx.household.id)
            .first()
        )
        if not member:
            raise HTTPException(status_code=404, detail="Selected household member not found in your household.")

    content = await file.read()
    safe_orig_name = Path(file.filename or "prescription").name
    target_ext = _validate_upload_bytes(content, file.content_type or "", safe_orig_name)

    hh_dir = settings.PRIVATE_UPLOAD_DIR / f"household_{ctx.household.id}"
    hh_dir.mkdir(parents=True, exist_ok=True)
    storage_key = f"household_{ctx.household.id}/{uuid.uuid4().hex}{target_ext}"
    dest_path = settings.PRIVATE_UPLOAD_DIR / storage_key

    # Prevent path traversal outside PRIVATE_UPLOAD_DIR
    if not dest_path.resolve().is_relative_to(settings.PRIVATE_UPLOAD_DIR.resolve()):
        raise HTTPException(status_code=400, detail="Invalid upload storage path.")

    dest_path.write_bytes(content)

    # Draft OCR preview text (non-authoritative)
    draft_ocr = ocr_service.parse_text_or_image(raw_text="", filename=safe_orig_name)
    ocr_summary = (
        f"OCR Draft Preview (requires manual review): {draft_ocr.get('raw_text_extracted', '')}"
        if target_ext != ".pdf"
        else "PDF uploaded to private vault."
    )

    presc = Prescription(
        household_id=ctx.household.id,
        member_id=member_id,
        uploaded_by_user_id=user.id,
        title=title.strip(),
        doctor_name=doctor_name.strip() if doctor_name else None,
        clinic_name=clinic_name.strip() if clinic_name else None,
        prescribed_date=prescribed_date.strip(),
        valid_until=valid_until.strip() if valid_until and valid_until.strip() else None,
        notes=notes.strip() if notes else None,
        original_filename=safe_orig_name,
        mime_type=file.content_type or ("application/pdf" if target_ext == ".pdf" else "image/jpeg"),
        file_size_bytes=len(content),
        storage_key=storage_key,
        ocr_extracted_text=ocr_summary,
    )
    db.add(presc)
    db.commit()
    db.refresh(presc)

    evaluate_prescription_validity_notifications(db, presc)
    if presc.valid_until:
        try:
            days = calculate_days_until_expiry(presc.valid_until)
            c_engine.pq_insert_event(
                presc.id,
                f"[Rx] {presc.title}",
                presc.doctor_name or "Doctor",
                days,
                presc.valid_until,
                presc.member_id or 0,
                household_id=ctx.household.id,
                event_type="PRESCRIPTION",
            )
        except ValueError:
            pass

    return _serialize_prescription(presc)


@router.get("/{prescription_id}/download")
def download_prescription_file(
    prescription_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    presc = db.query(Prescription).filter(Prescription.id == prescription_id).first()
    if not presc:
        raise HTTPException(status_code=404, detail="Prescription not found.")

    # Strict household & caregiver permission check
    resolve_household_access(
        db,
        user,
        requested_household_id=presc.household_id,
        required_permission="can_view_prescriptions",
    )

    file_path = (settings.PRIVATE_UPLOAD_DIR / presc.storage_key).resolve()
    if not file_path.is_relative_to(settings.PRIVATE_UPLOAD_DIR.resolve()) or not file_path.exists():
        raise HTTPException(status_code=404, detail="Prescription file unavailable on storage.")

    return FileResponse(
        path=str(file_path),
        media_type=presc.mime_type,
        filename=presc.original_filename,
        headers={"Cache-Control": "no-store"},
    )


@router.post("/{prescription_id}/link-medicine/{medicine_id}")
def link_prescription_to_medicine(
    prescription_id: int,
    medicine_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    presc = db.query(Prescription).filter(Prescription.id == prescription_id).first()
    if not presc:
        raise HTTPException(status_code=404, detail="Prescription not found.")

    ctx = resolve_household_access(
        db,
        user,
        requested_household_id=presc.household_id,
        required_permission="can_edit_medicines",
    )

    med = (
        db.query(MedicineRecord)
        .filter(MedicineRecord.id == medicine_id, MedicineRecord.household_id == ctx.household.id)
        .first()
    )
    if not med:
        raise HTTPException(status_code=404, detail="Medicine not found in household.")

    med.prescription_id = presc.id
    db.commit()
    return {"success": True, "prescription_id": presc.id, "medicine_id": med.id}


@router.delete("/{prescription_id}", status_code=204)
def delete_prescription(
    prescription_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    presc = db.query(Prescription).filter(Prescription.id == prescription_id).first()
    if not presc:
        raise HTTPException(status_code=404, detail="Prescription not found.")

    resolve_household_access(
        db,
        user,
        requested_household_id=presc.household_id,
        required_permission="can_edit_medicines",
    )

    # Unlink medicines referencing this prescription before deleting
    db.query(MedicineRecord).filter(MedicineRecord.prescription_id == presc.id).update(
        {"prescription_id": None}
    )

    file_path = (settings.PRIVATE_UPLOAD_DIR / presc.storage_key).resolve()
    if file_path.is_relative_to(settings.PRIVATE_UPLOAD_DIR.resolve()) and file_path.exists():
        file_path.unlink(missing_ok=True)

    c_engine.pq_remove_medicine(presc.id, "PRESCRIPTION")
    db.delete(presc)
    db.commit()
    return None
