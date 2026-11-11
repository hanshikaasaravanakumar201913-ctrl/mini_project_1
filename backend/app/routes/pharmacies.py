import datetime
import difflib
import math
import re
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.geocoding_service import geocode_location
from backend.app.models import CanonicalMedicineCatalog, Pharmacy, PharmacyMedicine, User, utcnow_naive
from backend.app.nlp_search_service import nlp_search_service
from backend.app.schemas import (
    PharmacyCoordinateUpdate,
    PharmacyMedicineResponse,
    PharmacyResponse,
)
from backend.app.security import require_roles

router = APIRouter(prefix="/pharmacies", tags=["Pharmacy Discovery"])

HOURS_RANGE_RE = re.compile(
    r"^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–to]+\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$",
    re.I,
)


def is_valid_coordinate_pair(lat: Optional[float], lng: Optional[float]) -> bool:
    if lat is None or lng is None:
        return False
    if not (math.isfinite(lat) and math.isfinite(lng)):
        return False
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
        return False
    if abs(lat) < 1e-6 and abs(lng) < 1e-6:
        return False
    return True


def evaluate_is_open_now(business_hours: Optional[str]) -> Optional[bool]:
    """
    Returns True/False ONLY when operating hours match an explicit parseable format
    evaluated against India Standard Time (UTC+5:30). Returns None when unknown or ambiguous.
    """
    if not business_hours or not business_hours.strip():
        return None
    raw = business_hours.strip()
    if "24 hour" in raw.lower() or "24x7" in raw.lower():
        return True
    m = HOURS_RANGE_RE.match(raw)
    if not m:
        return None

    def to_minutes(hh: str, mm: str, meridiem: str) -> int:
        h = int(hh) % 12
        if meridiem.upper() == "PM":
            h += 12
        return h * 60 + int(mm)

    start_min = to_minutes(m.group(1), m.group(2), m.group(3))
    end_min = to_minutes(m.group(4), m.group(5), m.group(6))

    ist_now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5, minutes=30)))
    cur_min = ist_now.hour * 60 + ist_now.minute
    if end_min >= start_min:
        return start_min <= cur_min <= end_min
    # Overnight hours (e.g. 08:00 PM - 02:00 AM)
    return cur_min >= start_min or cur_min <= end_min


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return round(r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)), 2)


def _serialize_pharmacy(ph: Pharmacy, lat: Optional[float] = None, lng: Optional[float] = None) -> dict:
    coords_valid = is_valid_coordinate_pair(ph.latitude, ph.longitude)
    dist = (
        haversine_km(lat, lng, ph.latitude, ph.longitude)
        if (coords_valid and lat is not None and lng is not None)
        else None
    )
    coords_verified = bool(getattr(ph, "coordinates_verified", False)) and coords_valid
    return {
        "id": ph.id,
        "name": ph.name,
        "license_number": ph.license_number,
        "address": ph.address,
        "city": ph.city,
        "state": ph.state,
        "postal_code": ph.postal_code,
        "phone": ph.phone,
        "email": ph.email,
        "latitude": ph.latitude,
        "longitude": ph.longitude,
        "coordinates_verified": coords_verified,
        "coordinates_valid": coords_valid,
        "location_needs_verification": (not coords_valid) or (not coords_verified) or (ph.verification_status != "VERIFIED"),
        "business_hours": ph.business_hours,
        "is_open_now": evaluate_is_open_now(ph.business_hours),
        "supports_pickup": ph.supports_pickup,
        "supports_delivery": ph.supports_delivery,
        "delivery_radius_km": ph.delivery_radius_km,
        "estimated_fulfilment_note": ph.estimated_fulfilment_note,
        "verification_status": ph.verification_status,
        "data_origin": ph.data_origin,
        "is_active": ph.is_active,
        "distance_km": dist,
        "updated_at": ph.updated_at.isoformat() if ph.updated_at else None,
    }


def _serialize_ph_med(item: PharmacyMedicine, dist: Optional[float] = None) -> dict:
    avail_qty = max(0, item.stock_quantity - item.reserved_quantity)
    ph = item.pharmacy
    return {
        "id": item.id,
        "pharmacy_id": item.pharmacy_id,
        "medicine_name": item.medicine_name,
        "generic_name": item.generic_name,
        "brand": item.brand,
        "strength": item.strength,
        "dosage_form": item.dosage_form,
        "manufacturer": item.manufacturer,
        "category": item.category,
        "prescription_required": item.prescription_required,
        "unit_price": round(item.unit_price_paise / 100.0, 2),
        "stock_quantity": item.stock_quantity,
        "reserved_quantity": item.reserved_quantity,
        "available_quantity": avail_qty,
        "is_available": item.is_available and avail_qty > 0,
        "inventory_source": item.inventory_source,
        "pharmacy_name": ph.name if ph else None,
        "pharmacy_city": ph.city if ph else None,
        "pharmacy_address": ph.address if ph else None,
        "verification_status": ph.verification_status if ph else None,
        "distance_km": dist,
        "supports_pickup": ph.supports_pickup if ph else None,
        "supports_delivery": ph.supports_delivery if ph else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


@router.get("/geocode")
def geocode_pharmacy_location(
    q: str = Query(..., min_length=2, max_length=150, description="Town, city, locality, or postal code"),
    limit: int = Query(5, ge=1, le=8),
):
    results = geocode_location(q, limit=limit)
    return {
        "query": q.strip(),
        "count": len(results),
        "results": results,
    }


def _resolve_medicine_terms(
    db: Session,
    medicine_query: Optional[str],
    medicine_id: Optional[int],
) -> List[str]:
    terms: List[str] = []
    if medicine_id is not None:
        canon = (
            db.query(CanonicalMedicineCatalog)
            .filter(CanonicalMedicineCatalog.id == medicine_id)
            .first()
        )
        if canon:
            terms.append(canon.generic_name.lower())
            terms.append(canon.canonical_name.lower())

    if medicine_query and medicine_query.strip():
        raw = medicine_query.strip().lower()
        terms.append(raw)
        nlp_res = nlp_search_service.search_medicines(
            db=db,
            query=medicine_query.strip(),
            preferred_language="en",
            limit=3,
            include_pharmacy_counts=False,
        )
        if nlp_res.get("status") != "NO_MATCH":
            for hit in nlp_res.get("results", []):
                gen = (hit.get("generic_name") or "").strip().lower()
                if gen and gen not in terms:
                    terms.append(gen)
                for b in hit.get("brand_names", []):
                    bn = str(b).strip().lower()
                    if bn and bn not in terms:
                        terms.append(bn)
    return terms


def _item_matches_terms(item: PharmacyMedicine, terms: List[str]) -> bool:
    if not terms:
        return True
    hay = " ".join(
        [
            item.medicine_name or "",
            item.generic_name or "",
            item.brand or "",
            item.strength or "",
            item.dosage_form or "",
        ]
    ).lower()
    for term in terms:
        if term in hay:
            return True
        words = [w for w in re.split(r"\s+", term) if len(w) >= 3]
        if words and all(w in hay for w in words):
            return True
    return False


@router.get("/nearby", response_model=dict)
def search_nearby_pharmacies(
    latitude: Optional[float] = Query(None, ge=-90.0, le=90.0),
    longitude: Optional[float] = Query(None, ge=-180.0, le=180.0),
    radius_km: float = Query(25.0, gt=0.0, le=500.0),
    location_query: Optional[str] = Query(None, description="City/locality text filter when coordinates not pinned"),
    medicine_query: Optional[str] = Query(None, description="Medicine name, brand, generic, or multilingual NLP symptom"),
    medicine_id: Optional[int] = Query(None, description="Optional canonical medicine ID"),
    verified_only: bool = Query(True),
    pickup_only: bool = Query(False),
    delivery_only: bool = Query(False),
    open_now: bool = Query(False),
    in_stock_only: bool = Query(True),
    sort: str = Query("distance"),  # distance, price, availability
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    if (latitude is not None) != (longitude is not None):
        raise HTTPException(status_code=400, detail="Both latitude and longitude must be provided together.")
    if latitude is not None and not is_valid_coordinate_pair(latitude, longitude):
        raise HTTPException(status_code=400, detail="Provided search coordinates are invalid.")

    resolved_terms = _resolve_medicine_terms(db, medicine_query=medicine_query, medicine_id=medicine_id)
    has_medicine_filter = bool(resolved_terms)

    query = db.query(Pharmacy).filter(Pharmacy.is_active == True)
    if verified_only:
        query = query.filter(Pharmacy.verification_status == "VERIFIED")
    if pickup_only:
        query = query.filter(Pharmacy.supports_pickup == True)
    if delivery_only:
        query = query.filter(Pharmacy.supports_delivery == True)
    if location_query and location_query.strip() and latitude is None:
        pat = f"%{location_query.strip()}%"
        query = query.filter(
            or_(
                Pharmacy.name.ilike(pat),
                Pharmacy.city.ilike(pat),
                Pharmacy.address.ilike(pat),
                Pharmacy.postal_code.ilike(pat),
            )
        )

    all_pharmacies = query.all()
    results = []

    for ph in all_pharmacies:
        coords_valid = is_valid_coordinate_pair(ph.latitude, ph.longitude)
        if verified_only and (not coords_valid or not getattr(ph, "coordinates_verified", False)):
            continue

        dist: Optional[float] = None
        if latitude is not None and longitude is not None:
            if not coords_valid:
                continue
            dist = haversine_km(latitude, longitude, ph.latitude, ph.longitude)
            if dist > radius_km:
                continue

        is_open = evaluate_is_open_now(ph.business_hours)
        if open_now and is_open is not True:
            continue

        matched_items_serialized = []
        for item in ph.medicines:
            if in_stock_only and (not item.is_available or (item.stock_quantity - item.reserved_quantity) <= 0):
                continue
            if has_medicine_filter and not _item_matches_terms(item, resolved_terms):
                continue
            matched_items_serialized.append(_serialize_ph_med(item, dist=dist))

        if has_medicine_filter and not matched_items_serialized:
            continue

        matched_items_serialized.sort(key=lambda m: (m["unit_price"], -m["available_quantity"]))
        ph_dict = _serialize_pharmacy(ph, lat=latitude, lng=longitude)
        ph_dict["matching_medicines_count"] = len(matched_items_serialized)
        ph_dict["matching_medicines"] = matched_items_serialized
        ph_dict["lowest_price"] = matched_items_serialized[0]["unit_price"] if matched_items_serialized else None
        results.append(ph_dict)

    if sort == "price":
        results.sort(
            key=lambda r: (
                r["lowest_price"] if r["lowest_price"] is not None else 999999.0,
                r["distance_km"] if r["distance_km"] is not None else 9999.0,
            )
        )
    elif sort == "availability":
        results.sort(
            key=lambda r: (
                -sum(m["available_quantity"] for m in r["matching_medicines"]),
                r["distance_km"] if r["distance_km"] is not None else 9999.0,
            )
        )
    else:
        results.sort(key=lambda r: (r["distance_km"] if r["distance_km"] is not None else 9999.0, r["name"]))

    results = results[:limit]
    return {
        "center": {"latitude": latitude, "longitude": longitude, "radius_km": radius_km}
        if latitude is not None
        else None,
        "resolved_medicine_terms": resolved_terms,
        "total": len(results),
        "pharmacies": results,
    }


@router.get("/search", response_model=List[PharmacyResponse])
def search_pharmacies(
    q: Optional[str] = Query(None, description="City, address, or pharmacy name"),
    lat: Optional[float] = Query(None),
    lng: Optional[float] = Query(None),
    radius_km: Optional[float] = Query(None, gt=0),
    pickup_only: bool = Query(False),
    delivery_only: bool = Query(False),
    db: Session = Depends(get_db),
):
    query = db.query(Pharmacy).filter(
        Pharmacy.is_active == True,
        Pharmacy.verification_status == "VERIFIED",
    )
    if pickup_only:
        query = query.filter(Pharmacy.supports_pickup == True)
    if delivery_only:
        query = query.filter(Pharmacy.supports_delivery == True)
    if q and q.strip():
        pat = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Pharmacy.name.ilike(pat),
                Pharmacy.city.ilike(pat),
                Pharmacy.address.ilike(pat),
                Pharmacy.postal_code.ilike(pat),
            )
        )

    pharmacies = query.all()
    results = [_serialize_pharmacy(ph, lat=lat, lng=lng) for ph in pharmacies if is_valid_coordinate_pair(ph.latitude, ph.longitude)]

    if lat is not None and lng is not None:
        if radius_km is not None:
            results = [r for r in results if r["distance_km"] is not None and r["distance_km"] <= radius_km]
        results.sort(key=lambda r: r["distance_km"] if r["distance_km"] is not None else 9999)

    return results


@router.get("/medicines/search", response_model=dict)
def search_available_medicines(
    q: Optional[str] = Query(None, description="Medicine name, generic, brand, or strength"),
    dosage_form: Optional[str] = Query(None),
    lat: Optional[float] = Query(None),
    lng: Optional[float] = Query(None),
    radius_km: Optional[float] = Query(None, gt=0),
    pickup_only: bool = Query(False),
    delivery_only: bool = Query(False),
    sort_by: str = Query("distance"),  # distance, price, availability
    db: Session = Depends(get_db),
):
    query = (
        db.query(PharmacyMedicine)
        .join(Pharmacy)
        .filter(
            Pharmacy.is_active == True,
            Pharmacy.verification_status == "VERIFIED",
            PharmacyMedicine.is_available == True,
        )
    )
    if pickup_only:
        query = query.filter(Pharmacy.supports_pickup == True)
    if delivery_only:
        query = query.filter(Pharmacy.supports_delivery == True)
    if dosage_form and dosage_form.strip():
        query = query.filter(PharmacyMedicine.dosage_form.ilike(f"%{dosage_form.strip()}%"))

    all_items = query.all()
    suggestions: List[str] = []

    if q and q.strip():
        resolved_terms = _resolve_medicine_terms(db, medicine_query=q.strip(), medicine_id=None)
        matched_items = [item for item in all_items if _item_matches_terms(item, resolved_terms)]
        if not matched_items:
            candidates = sorted(
                {
                    name
                    for item in all_items
                    for name in [item.medicine_name, item.generic_name, item.brand]
                    if name
                }
            )
            suggestions = difflib.get_close_matches(q.strip(), candidates, n=5, cutoff=0.55)
    else:
        matched_items = all_items

    results = []
    for item in matched_items:
        ph = item.pharmacy
        if not ph or not is_valid_coordinate_pair(ph.latitude, ph.longitude):
            continue
        if (item.stock_quantity - item.reserved_quantity) <= 0:
            continue
        dist = (
            haversine_km(lat, lng, ph.latitude, ph.longitude)
            if (lat is not None and lng is not None)
            else None
        )
        if radius_km is not None and dist is not None and dist > radius_km:
            continue
        results.append(_serialize_ph_med(item, dist=dist))

    if sort_by == "price":
        results.sort(key=lambda r: (r["unit_price"], r["distance_km"] if r["distance_km"] is not None else 9999))
    elif sort_by == "availability":
        results.sort(key=lambda r: (-r["available_quantity"], r["unit_price"]))
    else:
        results.sort(key=lambda r: (r["distance_km"] if r["distance_km"] is not None else 9999, r["unit_price"]))

    return {
        "results": results,
        "suggestions": suggestions,
        "total": len(results),
    }


@router.get("/admin/list", response_model=List[PharmacyResponse])
def admin_list_all_pharmacies(
    admin: User = Depends(require_roles("PLATFORM_ADMIN")),
    db: Session = Depends(get_db),
):
    rows = db.query(Pharmacy).order_by(Pharmacy.created_at.desc()).all()
    return [_serialize_pharmacy(p) for p in rows]


@router.patch("/admin/{pharmacy_id}/verify", response_model=PharmacyResponse)
def admin_verify_pharmacy(
    pharmacy_id: int,
    verification_status: str = Body(..., embed=True),
    admin: User = Depends(require_roles("PLATFORM_ADMIN")),
    db: Session = Depends(get_db),
):
    status_upper = verification_status.strip().upper()
    if status_upper not in ("VERIFIED", "REJECTED", "PENDING"):
        raise HTTPException(status_code=400, detail="Invalid verification status.")

    ph = db.query(Pharmacy).filter(Pharmacy.id == pharmacy_id).first()
    if not ph:
        raise HTTPException(status_code=404, detail="Pharmacy not found.")

    if status_upper == "VERIFIED" and not is_valid_coordinate_pair(ph.latitude, ph.longitude):
        raise HTTPException(
            status_code=400,
            detail="Cannot verify pharmacy until valid non-zero geographical coordinates are recorded.",
        )

    ph.verification_status = status_upper
    if status_upper == "VERIFIED" and is_valid_coordinate_pair(ph.latitude, ph.longitude):
        ph.coordinates_verified = True
    elif status_upper == "REJECTED":
        ph.coordinates_verified = False

    ph.updated_at = utcnow_naive()
    db.commit()
    db.refresh(ph)
    return _serialize_pharmacy(ph)


@router.patch("/admin/{pharmacy_id}/coordinates", response_model=PharmacyResponse)
def admin_update_pharmacy_coordinates(
    pharmacy_id: int,
    payload: PharmacyCoordinateUpdate,
    admin: User = Depends(require_roles("PLATFORM_ADMIN")),
    db: Session = Depends(get_db),
):
    if not is_valid_coordinate_pair(payload.latitude, payload.longitude):
        raise HTTPException(
            status_code=400,
            detail="Invalid coordinates. Latitude must be in [-90, 90], longitude in [-180, 180], and not (0, 0).",
        )

    ph = db.query(Pharmacy).filter(Pharmacy.id == pharmacy_id).first()
    if not ph:
        raise HTTPException(status_code=404, detail="Pharmacy not found.")

    ph.latitude = payload.latitude
    ph.longitude = payload.longitude
    ph.coordinates_verified = bool(payload.coordinates_verified)
    ph.updated_at = utcnow_naive()
    db.commit()
    db.refresh(ph)
    return _serialize_pharmacy(ph)


@router.get("/{pharmacy_id}", response_model=dict)
def get_pharmacy_detail(
    pharmacy_id: int,
    lat: Optional[float] = Query(None),
    lng: Optional[float] = Query(None),
    db: Session = Depends(get_db),
):
    ph = db.query(Pharmacy).filter(Pharmacy.id == pharmacy_id, Pharmacy.is_active == True).first()
    if not ph:
        raise HTTPException(status_code=404, detail="Pharmacy not found.")
    meds = (
        db.query(PharmacyMedicine)
        .filter(PharmacyMedicine.pharmacy_id == ph.id)
        .order_by(PharmacyMedicine.medicine_name.asc())
        .all()
    )
    info = _serialize_pharmacy(ph, lat=lat, lng=lng)
    return {
        "pharmacy": info,
        "medicines": [_serialize_ph_med(m, dist=info["distance_km"]) for m in meds],
    }
