from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import (
    InventoryTransaction,
    OrderStatusHistory,
    Pharmacy,
    PharmacyMedicine,
    PharmacyOrder,
    PharmacyStaff,
    RefillRequest,
    User,
    utcnow_naive,
)
from backend.app.notification_service import emit_notification
from backend.app.routes.pharmacies import _serialize_ph_med, _serialize_pharmacy, is_valid_coordinate_pair
from backend.app.schemas import (
    OrderStatusUpdate,
    PharmacyMedicineCreate,
    PharmacyMedicineResponse,
    PharmacyMedicineUpdate,
    PharmacyOrderResponse,
    PharmacyRegisterRequest,
    PharmacyResponse,
    RefillRequestResponse,
    RefillRequestStatusUpdate,
)
from backend.app.security import get_current_user, require_roles, resolve_user_pharmacy

router = APIRouter(prefix="/pharmacy-portal", tags=["Pharmacy Portal"])

VALID_STATUS_FLOW = {
    "PENDING",
    "ACCEPTED",
    "REJECTED",
    "PREPARING",
    "READY_FOR_PICKUP",
    "OUT_FOR_DELIVERY",
    "COMPLETED",
    "CANCELLED",
}


@router.post("/register", response_model=PharmacyResponse, status_code=201)
def register_pharmacy(
    data: PharmacyRegisterRequest,
    user: User = Depends(require_roles("PHARMACY_STAFF", "PLATFORM_ADMIN")),
    db: Session = Depends(get_db),
):
    if not is_valid_coordinate_pair(data.latitude, data.longitude):
        raise HTTPException(
            status_code=400,
            detail="Invalid pharmacy coordinates. Provide genuine non-zero latitude (-90..90) and longitude (-180..180).",
        )
    ph = Pharmacy(
        owner_user_id=user.id,
        name=data.name.strip(),
        license_number=data.license_number.strip(),
        address=data.address.strip(),
        city=data.city.strip(),
        state=data.state.strip() if data.state else None,
        postal_code=data.postal_code.strip() if data.postal_code else None,
        phone=data.phone.strip(),
        email=data.email.strip() if data.email else user.email,
        latitude=data.latitude,
        longitude=data.longitude,
        coordinates_verified=False,
        business_hours=data.business_hours,
        supports_pickup=data.supports_pickup,
        supports_delivery=data.supports_delivery,
        delivery_radius_km=data.delivery_radius_km,
        estimated_fulfilment_note=data.estimated_fulfilment_note,
        verification_status="PENDING",
        data_origin="PARTNER_REGISTERED",
        is_active=True,
    )
    db.add(ph)
    db.flush()

    db.add(PharmacyStaff(pharmacy_id=ph.id, user_id=user.id, staff_role="OWNER"))
    db.commit()
    db.refresh(ph)
    return _serialize_pharmacy(ph)


@router.get("/my-pharmacy", response_model=PharmacyResponse)
def get_my_pharmacy(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ph = resolve_user_pharmacy(db, user)
    return _serialize_pharmacy(ph)


@router.put("/my-pharmacy", response_model=PharmacyResponse)
def update_my_pharmacy(
    data: PharmacyRegisterRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ph = resolve_user_pharmacy(db, user)
    ph.name = data.name.strip()
    ph.license_number = data.license_number.strip()
    ph.address = data.address.strip()
    ph.city = data.city.strip()
    ph.state = data.state.strip() if data.state else None
    ph.postal_code = data.postal_code.strip() if data.postal_code else None
    ph.phone = data.phone.strip()
    ph.email = data.email.strip() if data.email else ph.email
    if not is_valid_coordinate_pair(data.latitude, data.longitude):
        raise HTTPException(
            status_code=400,
            detail="Invalid pharmacy coordinates. Provide genuine non-zero latitude (-90..90) and longitude (-180..180).",
        )
    coords_changed = (abs(ph.latitude - data.latitude) > 1e-6) or (abs(ph.longitude - data.longitude) > 1e-6)
    ph.latitude = data.latitude
    ph.longitude = data.longitude
    if coords_changed:
        ph.coordinates_verified = False
    ph.business_hours = data.business_hours
    ph.supports_pickup = data.supports_pickup
    ph.supports_delivery = data.supports_delivery
    ph.delivery_radius_km = data.delivery_radius_km
    ph.estimated_fulfilment_note = data.estimated_fulfilment_note
    ph.updated_at = utcnow_naive()
    db.commit()
    db.refresh(ph)
    return _serialize_pharmacy(ph)


@router.get("/inventory", response_model=dict)
def get_pharmacy_inventory(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ph = resolve_user_pharmacy(db, user)
    items = (
        db.query(PharmacyMedicine)
        .filter(PharmacyMedicine.pharmacy_id == ph.id)
        .order_by(PharmacyMedicine.medicine_name.asc())
        .all()
    )
    txs = (
        db.query(InventoryTransaction)
        .filter(InventoryTransaction.pharmacy_id == ph.id)
        .order_by(InventoryTransaction.created_at.desc())
        .limit(30)
        .all()
    )
    return {
        "pharmacy": _serialize_pharmacy(ph),
        "items": [_serialize_ph_med(i) for i in items],
        "transactions": [
            {
                "id": t.id,
                "pharmacy_medicine_id": t.pharmacy_medicine_id,
                "tx_type": t.tx_type,
                "quantity_change": t.quantity_change,
                "balance_after": t.balance_after,
                "notes": t.notes,
                "created_at": t.created_at.isoformat(),
            }
            for t in txs
        ],
    }


@router.post("/inventory", response_model=PharmacyMedicineResponse, status_code=201)
def add_pharmacy_medicine(
    data: PharmacyMedicineCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ph = resolve_user_pharmacy(db, user)
    price_paise = int(round(data.unit_price * 100))

    item = PharmacyMedicine(
        pharmacy_id=ph.id,
        medicine_name=data.medicine_name.strip(),
        generic_name=data.generic_name.strip() if data.generic_name else None,
        brand=data.brand.strip() if data.brand else None,
        strength=data.strength.strip() if data.strength else None,
        dosage_form=data.dosage_form.strip(),
        manufacturer=data.manufacturer.strip() if data.manufacturer else None,
        category=data.category.strip(),
        prescription_required=data.prescription_required,
        unit_price_paise=price_paise,
        stock_quantity=data.stock_quantity,
        reserved_quantity=0,
        is_available=data.is_available,
        inventory_source="VERIFIED_LIVE" if ph.data_origin == "PARTNER_REGISTERED" else data.inventory_source,
    )
    db.add(item)
    db.flush()

    db.add(
        InventoryTransaction(
            pharmacy_medicine_id=item.id,
            pharmacy_id=ph.id,
            actor_user_id=user.id,
            tx_type="RESTOCK",
            quantity_change=item.stock_quantity,
            balance_after=item.stock_quantity,
            notes="Initial inventory item added by pharmacy staff",
        )
    )
    db.commit()
    db.refresh(item)
    return _serialize_ph_med(item)


@router.put("/inventory/{item_id}", response_model=PharmacyMedicineResponse)
def update_pharmacy_medicine(
    item_id: int,
    data: PharmacyMedicineUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ph = resolve_user_pharmacy(db, user)
    item = (
        db.query(PharmacyMedicine)
        .filter(PharmacyMedicine.id == item_id, PharmacyMedicine.pharmacy_id == ph.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found in your pharmacy.")

    if data.unit_price is not None:
        item.unit_price_paise = int(round(data.unit_price * 100))
    if data.is_available is not None:
        item.is_available = data.is_available
    if data.prescription_required is not None:
        item.prescription_required = data.prescription_required

    if data.stock_quantity is not None:
        if data.stock_quantity < item.reserved_quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot set stock below currently reserved units ({item.reserved_quantity}).",
            )
        delta = data.stock_quantity - item.stock_quantity
        item.stock_quantity = data.stock_quantity
        if delta != 0:
            db.add(
                InventoryTransaction(
                    pharmacy_medicine_id=item.id,
                    pharmacy_id=ph.id,
                    actor_user_id=user.id,
                    tx_type="ADJUSTMENT",
                    quantity_change=delta,
                    balance_after=item.stock_quantity,
                    notes=data.notes or "Manual pharmacy stock adjustment",
                )
            )

    item.updated_at = utcnow_naive()
    db.commit()
    db.refresh(item)
    return _serialize_ph_med(item)


@router.get("/refill-requests", response_model=List[RefillRequestResponse])
def list_pharmacy_refill_requests(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ph = resolve_user_pharmacy(db, user)
    rows = (
        db.query(RefillRequest)
        .filter(RefillRequest.pharmacy_id == ph.id)
        .order_by(RefillRequest.created_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "household_id": r.household_id,
            "pharmacy_id": r.pharmacy_id,
            "pharmacy_name": ph.name,
            "medicine_record_id": r.medicine_record_id,
            "pharmacy_medicine_id": r.pharmacy_medicine_id,
            "prescription_id": r.prescription_id,
            "medicine_name": r.medicine_name,
            "requested_quantity": r.requested_quantity,
            "fulfilment_type": r.fulfilment_type,
            "delivery_address": r.delivery_address,
            "status": r.status,
            "pharmacist_notes": r.pharmacist_notes,
            "created_at": r.created_at,
            "updated_at": r.updated_at,
        }
        for r in rows
    ]


@router.patch("/refill-requests/{request_id}/status", response_model=RefillRequestResponse)
def update_refill_request_status(
    request_id: int,
    data: RefillRequestStatusUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ph = resolve_user_pharmacy(db, user)
    req = (
        db.query(RefillRequest)
        .filter(RefillRequest.id == request_id, RefillRequest.pharmacy_id == ph.id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Refill request not found.")

    new_status = data.status.strip().upper()
    if new_status not in VALID_STATUS_FLOW:
        raise HTTPException(status_code=400, detail=f"Invalid status '{new_status}'.")

    # Safety rule: never accept or dispense a prescription medicine without attached prescription
    if new_status in ("ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "COMPLETED"):
        if req.pharmacy_medicine_id:
            pm = db.query(PharmacyMedicine).filter(PharmacyMedicine.id == req.pharmacy_medicine_id).first()
            if pm and pm.prescription_required and not req.prescription_id:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot approve/dispense prescription-only medicine without an attached prescription.",
                )

    req.status = new_status
    if data.pharmacist_notes:
        req.pharmacist_notes = data.pharmacist_notes.strip()
    req.updated_at = utcnow_naive()
    db.commit()
    db.refresh(req)

    emit_notification(
        db,
        household_id=req.household_id,
        notification_type="REFILL_REQUEST",
        reference_id=req.id,
        severity="INFO",
        message=f"Refill request for '{req.medicine_name}' at {ph.name} is now {req.status}.",
    )

    return {
        "id": req.id,
        "household_id": req.household_id,
        "pharmacy_id": req.pharmacy_id,
        "pharmacy_name": ph.name,
        "medicine_record_id": req.medicine_record_id,
        "pharmacy_medicine_id": req.pharmacy_medicine_id,
        "prescription_id": req.prescription_id,
        "medicine_name": req.medicine_name,
        "requested_quantity": req.requested_quantity,
        "fulfilment_type": req.fulfilment_type,
        "delivery_address": req.delivery_address,
        "status": req.status,
        "pharmacist_notes": req.pharmacist_notes,
        "created_at": req.created_at,
        "updated_at": req.updated_at,
    }


@router.get("/orders", response_model=List[PharmacyOrderResponse])
def list_pharmacy_orders(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ph = resolve_user_pharmacy(db, user)
    orders = (
        db.query(PharmacyOrder)
        .filter(PharmacyOrder.pharmacy_id == ph.id)
        .order_by(PharmacyOrder.created_at.desc())
        .all()
    )
    from backend.app.routes.orders import serialize_order

    return [serialize_order(o, ph.name) for o in orders]


@router.patch("/orders/{order_id}/status", response_model=PharmacyOrderResponse)
def update_pharmacy_order_status(
    order_id: int,
    data: OrderStatusUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ph = resolve_user_pharmacy(db, user)
    order = (
        db.query(PharmacyOrder)
        .filter(PharmacyOrder.id == order_id, PharmacyOrder.pharmacy_id == ph.id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    new_status = data.status.strip().upper()
    if new_status not in VALID_STATUS_FLOW:
        raise HTTPException(status_code=400, detail=f"Invalid order status '{new_status}'.")
    if order.status in ("CANCELLED", "REJECTED", "COMPLETED"):
        raise HTTPException(status_code=400, detail=f"Order is already finalized ({order.status}).")

    now = utcnow_naive()
    # Release reserved stock on rejection/cancellation, or fulfill stock on completion
    if new_status in ("REJECTED", "CANCELLED"):
        for item in order.items:
            db.execute(
                text(
                    "UPDATE pharmacy_medicines SET reserved_quantity = MAX(0, reserved_quantity - :qty) "
                    "WHERE id = :mid"
                ),
                {"qty": item.quantity, "mid": item.pharmacy_medicine_id},
            )
            pm = db.query(PharmacyMedicine).filter(PharmacyMedicine.id == item.pharmacy_medicine_id).first()
            db.add(
                InventoryTransaction(
                    pharmacy_medicine_id=item.pharmacy_medicine_id,
                    pharmacy_id=ph.id,
                    actor_user_id=user.id,
                    tx_type="RELEASE",
                    quantity_change=item.quantity,
                    balance_after=pm.stock_quantity if pm else 0,
                    reference_type="ORDER",
                    reference_id=order.id,
                    notes=f"Released reservation on order {order.order_number} ({new_status})",
                )
            )
    elif new_status == "COMPLETED":
        for item in order.items:
            db.execute(
                text(
                    "UPDATE pharmacy_medicines "
                    "SET stock_quantity = MAX(0, stock_quantity - :qty), "
                    "    reserved_quantity = MAX(0, reserved_quantity - :qty) "
                    "WHERE id = :mid"
                ),
                {"qty": item.quantity, "mid": item.pharmacy_medicine_id},
            )
            pm = db.query(PharmacyMedicine).filter(PharmacyMedicine.id == item.pharmacy_medicine_id).first()
            db.add(
                InventoryTransaction(
                    pharmacy_medicine_id=item.pharmacy_medicine_id,
                    pharmacy_id=ph.id,
                    actor_user_id=user.id,
                    tx_type="FULFILL",
                    quantity_change=-item.quantity,
                    balance_after=pm.stock_quantity if pm else 0,
                    reference_type="ORDER",
                    reference_id=order.id,
                    notes=f"Fulfilled order {order.order_number}",
                )
            )

    order.status = new_status
    order.updated_at = now
    db.add(
        OrderStatusHistory(
            order_id=order.id,
            status=new_status,
            changed_by_user_id=user.id,
            notes=data.notes or f"Status updated to {new_status} by pharmacy staff",
            created_at=now,
        )
    )
    db.commit()
    db.refresh(order)

    emit_notification(
        db,
        household_id=order.household_id,
        notification_type="ORDER",
        reference_id=order.id,
        severity="INFO",
        message=f"Order {order.order_number} at {ph.name} updated to {order.status}.",
    )

    from backend.app.routes.orders import serialize_order

    return serialize_order(order, ph.name)
