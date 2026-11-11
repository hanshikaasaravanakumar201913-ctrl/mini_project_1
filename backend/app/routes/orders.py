import datetime
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import (
    InventoryTransaction,
    MedicineRecord,
    OrderStatusHistory,
    Pharmacy,
    PharmacyMedicine,
    PharmacyOrder,
    PharmacyOrderItem,
    Prescription,
    RefillRequest,
    User,
    utcnow_naive,
)
from backend.app.notification_service import emit_notification
from backend.app.schemas import (
    PharmacyOrderCreate,
    PharmacyOrderResponse,
    RefillRequestCreate,
    RefillRequestResponse,
)
from backend.app.security import get_current_user, resolve_household_access

router = APIRouter(prefix="/orders", tags=["Refill Requests & Pharmacy Ordering"])


def serialize_order(order: PharmacyOrder, pharmacy_name: Optional[str] = None) -> dict:
    return {
        "id": order.id,
        "order_number": order.order_number,
        "household_id": order.household_id,
        "pharmacy_id": order.pharmacy_id,
        "pharmacy_name": pharmacy_name,
        "prescription_id": order.prescription_id,
        "fulfilment_type": order.fulfilment_type,
        "delivery_address": order.delivery_address,
        "payment_method": order.payment_method,
        "payment_status": order.payment_status,
        "status": order.status,
        "total_amount": round(order.total_amount_paise / 100.0, 2),
        "notes": order.notes,
        "created_at": order.created_at,
        "updated_at": order.updated_at,
        "items": [
            {
                "id": it.id,
                "pharmacy_medicine_id": it.pharmacy_medicine_id,
                "medicine_name": it.medicine_name,
                "strength": it.strength,
                "quantity": it.quantity,
                "unit_price": round(it.unit_price_paise / 100.0, 2),
                "line_total": round(it.line_total_paise / 100.0, 2),
            }
            for it in order.items
        ],
        "status_history": [
            {
                "status": h.status,
                "notes": h.notes,
                "created_at": h.created_at.isoformat() if h.created_at else None,
            }
            for h in order.status_history
        ],
    }


def _validate_household_prescription(
    db: Session, household_id: int, prescription_id: Optional[int]
) -> Optional[Prescription]:
    if prescription_id is None:
        return None
    presc = (
        db.query(Prescription)
        .filter(Prescription.id == prescription_id, Prescription.household_id == household_id)
        .first()
    )
    if not presc:
        raise HTTPException(
            status_code=403,
            detail="Specified prescription was not found in your authorized household.",
        )
    if presc.valid_until and presc.valid_until < datetime.date.today().isoformat():
        raise HTTPException(
            status_code=400,
            detail=f"Attached prescription expired on {presc.valid_until}. Provide a valid prescription.",
        )
    return presc


@router.get("/refill-requests", response_model=List[RefillRequestResponse])
def list_household_refill_requests(
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = resolve_household_access(
        db, user, requested_household_id=household_id, required_permission="can_view_medicines"
    )
    rows = (
        db.query(RefillRequest)
        .filter(RefillRequest.household_id == ctx.household.id)
        .order_by(RefillRequest.created_at.desc())
        .all()
    )
    ph_map = {p.id: p.name for p in db.query(Pharmacy).all()}
    return [
        {
            "id": r.id,
            "household_id": r.household_id,
            "pharmacy_id": r.pharmacy_id,
            "pharmacy_name": ph_map.get(r.pharmacy_id),
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


@router.post("/refill-requests", response_model=RefillRequestResponse, status_code=201)
def create_refill_request(
    data: RefillRequestCreate,
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = resolve_household_access(
        db, user, requested_household_id=household_id, required_permission="can_manage_refills"
    )

    ph = (
        db.query(Pharmacy)
        .filter(
            Pharmacy.id == data.pharmacy_id,
            Pharmacy.is_active == True,
            Pharmacy.verification_status == "VERIFIED",
        )
        .first()
    )
    if not ph:
        raise HTTPException(status_code=404, detail="Verified participating pharmacy not found.")

    fulfilment = data.fulfilment_type.strip().upper()
    if fulfilment not in ("PICKUP", "DELIVERY"):
        raise HTTPException(status_code=400, detail="Fulfilment type must be PICKUP or DELIVERY.")
    if fulfilment == "DELIVERY" and not ph.supports_delivery:
        raise HTTPException(status_code=400, detail="Selected pharmacy supports pickup only.")
    if fulfilment == "DELIVERY" and not (data.delivery_address and data.delivery_address.strip()):
        raise HTTPException(status_code=400, detail="Delivery address is required for delivery requests.")

    rx_required = False
    if data.medicine_record_id is not None:
        med = (
            db.query(MedicineRecord)
            .filter(
                MedicineRecord.id == data.medicine_record_id,
                MedicineRecord.household_id == ctx.household.id,
            )
            .first()
        )
        if not med:
            raise HTTPException(status_code=404, detail="Household medicine record not found.")
        if med.prescription_required:
            rx_required = True

    if data.pharmacy_medicine_id is not None:
        pm = (
            db.query(PharmacyMedicine)
            .filter(
                PharmacyMedicine.id == data.pharmacy_medicine_id,
                PharmacyMedicine.pharmacy_id == ph.id,
            )
            .first()
        )
        if not pm:
            raise HTTPException(status_code=404, detail="Selected medicine not listed at this pharmacy.")
        if pm.prescription_required:
            rx_required = True

    presc = _validate_household_prescription(db, ctx.household.id, data.prescription_id)
    if rx_required and not presc:
        raise HTTPException(
            status_code=400,
            detail="This regulated medicine requires attaching a valid prescription from your Prescription Vault.",
        )

    req = RefillRequest(
        household_id=ctx.household.id,
        requested_by_user_id=user.id,
        pharmacy_id=ph.id,
        medicine_record_id=data.medicine_record_id,
        pharmacy_medicine_id=data.pharmacy_medicine_id,
        prescription_id=presc.id if presc else None,
        medicine_name=data.medicine_name.strip(),
        requested_quantity=data.requested_quantity,
        fulfilment_type=fulfilment,
        delivery_address=data.delivery_address.strip() if data.delivery_address else None,
        status="PENDING",
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    emit_notification(
        db,
        household_id=ctx.household.id,
        notification_type="REFILL_REQUEST",
        reference_id=req.id,
        severity="INFO",
        message=f"Refill request submitted to {ph.name} for '{req.medicine_name}' ({req.requested_quantity}).",
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


@router.post("/refill-requests/{request_id}/cancel", response_model=RefillRequestResponse)
def cancel_refill_request(
    request_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    req = db.query(RefillRequest).filter(RefillRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Refill request not found.")
    resolve_household_access(
        db, user, requested_household_id=req.household_id, required_permission="can_manage_refills"
    )
    if req.status not in ("PENDING", "ACCEPTED"):
        raise HTTPException(status_code=400, detail=f"Cannot cancel request in status '{req.status}'.")

    req.status = "CANCELLED"
    req.updated_at = utcnow_naive()
    db.commit()
    db.refresh(req)

    ph = db.query(Pharmacy).filter(Pharmacy.id == req.pharmacy_id).first()
    return {
        "id": req.id,
        "household_id": req.household_id,
        "pharmacy_id": req.pharmacy_id,
        "pharmacy_name": ph.name if ph else None,
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


@router.get("", response_model=List[PharmacyOrderResponse])
def list_household_orders(
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = resolve_household_access(
        db, user, requested_household_id=household_id, required_permission="can_view_medicines"
    )
    orders = (
        db.query(PharmacyOrder)
        .filter(PharmacyOrder.household_id == ctx.household.id)
        .order_by(PharmacyOrder.created_at.desc())
        .all()
    )
    ph_map = {p.id: p.name for p in db.query(Pharmacy).all()}
    return [serialize_order(o, ph_map.get(o.pharmacy_id)) for o in orders]


@router.post("", response_model=PharmacyOrderResponse, status_code=201)
def place_pharmacy_order(
    data: PharmacyOrderCreate,
    household_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = resolve_household_access(
        db, user, requested_household_id=household_id, required_permission="can_manage_refills"
    )

    ph = (
        db.query(Pharmacy)
        .filter(
            Pharmacy.id == data.pharmacy_id,
            Pharmacy.is_active == True,
            Pharmacy.verification_status == "VERIFIED",
        )
        .first()
    )
    if not ph:
        raise HTTPException(status_code=404, detail="Verified pharmacy not found.")

    fulfilment = data.fulfilment_type.strip().upper()
    if fulfilment not in ("PICKUP", "DELIVERY"):
        raise HTTPException(status_code=400, detail="Fulfilment type must be PICKUP or DELIVERY.")
    if fulfilment == "PICKUP" and not ph.supports_pickup:
        raise HTTPException(status_code=400, detail="Selected pharmacy does not support pickup.")
    if fulfilment == "DELIVERY":
        if not ph.supports_delivery:
            raise HTTPException(status_code=400, detail="Selected pharmacy does not support delivery.")
        if not (data.delivery_address and data.delivery_address.strip()):
            raise HTTPException(status_code=400, detail="Delivery address is required for delivery orders.")

    payment_method = data.payment_method.strip().upper()
    if payment_method not in ("PAY_AT_PICKUP", "CASH_ON_DELIVERY"):
        raise HTTPException(
            status_code=400,
            detail="Only supported offline payment methods (PAY_AT_PICKUP, CASH_ON_DELIVERY) are accepted.",
        )
    if payment_method == "CASH_ON_DELIVERY" and fulfilment != "DELIVERY":
        raise HTTPException(status_code=400, detail="Cash on delivery applies only to delivery orders.")

    presc = _validate_household_prescription(db, ctx.household.id, data.prescription_id)

    # Aggregate requested quantities per item id cleanly
    qty_by_item: dict[int, int] = {}
    for line in data.items:
        qty_by_item[line.pharmacy_medicine_id] = qty_by_item.get(line.pharmacy_medicine_id, 0) + line.quantity

    now = utcnow_naive()
    order_number = f"MDR-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    payment_status = "UNPAID_COD" if payment_method == "CASH_ON_DELIVERY" else "UNPAID_PAY_AT_PICKUP"

    order = PharmacyOrder(
        order_number=order_number,
        household_id=ctx.household.id,
        user_id=user.id,
        pharmacy_id=ph.id,
        prescription_id=presc.id if presc else None,
        fulfilment_type=fulfilment,
        delivery_address=data.delivery_address.strip() if data.delivery_address else None,
        payment_method=payment_method,
        payment_status=payment_status,
        status="PENDING",
        total_amount_paise=0,
        notes=data.notes.strip() if data.notes else None,
        created_at=now,
        updated_at=now,
    )
    db.add(order)
    db.flush()

    total_paise = 0
    try:
        for item_id, req_qty in qty_by_item.items():
            pm = (
                db.query(PharmacyMedicine)
                .filter(PharmacyMedicine.id == item_id, PharmacyMedicine.pharmacy_id == ph.id)
                .first()
            )
            if not pm:
                raise HTTPException(status_code=404, detail=f"Pharmacy medicine #{item_id} not found.")
            if pm.prescription_required and not presc:
                raise HTTPException(
                    status_code=400,
                    detail=f"'{pm.medicine_name}' requires attaching a valid prescription.",
                )

            # Atomic conditional stock reservation preventing concurrent overselling
            res = db.execute(
                text(
                    "UPDATE pharmacy_medicines "
                    "SET reserved_quantity = reserved_quantity + :qty, updated_at = :now "
                    "WHERE id = :item_id AND pharmacy_id = :ph_id AND is_available = 1 "
                    "AND (stock_quantity - reserved_quantity) >= :qty"
                ),
                {"qty": req_qty, "now": now, "item_id": pm.id, "ph_id": ph.id},
            )
            if res.rowcount != 1:
                raise HTTPException(
                    status_code=409,
                    detail=f"Insufficient available stock for '{pm.medicine_name}'.",
                )

            line_total = pm.unit_price_paise * req_qty
            total_paise += line_total

            db.add(
                PharmacyOrderItem(
                    order_id=order.id,
                    pharmacy_medicine_id=pm.id,
                    medicine_name=pm.medicine_name,
                    strength=pm.strength,
                    quantity=req_qty,
                    unit_price_paise=pm.unit_price_paise,
                    line_total_paise=line_total,
                )
            )
            db.add(
                InventoryTransaction(
                    pharmacy_medicine_id=pm.id,
                    pharmacy_id=ph.id,
                    actor_user_id=user.id,
                    tx_type="RESERVE",
                    quantity_change=-req_qty,
                    balance_after=max(0, pm.stock_quantity - (pm.reserved_quantity + req_qty)),
                    reference_type="ORDER",
                    reference_id=order.id,
                    notes=f"Reserved for order {order_number}",
                    created_at=now,
                )
            )

        order.total_amount_paise = total_paise
        db.add(
            OrderStatusHistory(
                order_id=order.id,
                status="PENDING",
                changed_by_user_id=user.id,
                notes=f"Order placed ({fulfilment}, {payment_method}). Stock reserved.",
                created_at=now,
            )
        )
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(order)

    emit_notification(
        db,
        household_id=ctx.household.id,
        notification_type="ORDER",
        reference_id=order.id,
        severity="INFO",
        message=f"Order {order.order_number} placed at {ph.name} (Total INR {total_paise / 100:.2f}).",
    )
    return serialize_order(order, ph.name)


@router.post("/{order_id}/cancel", response_model=PharmacyOrderResponse)
def cancel_household_order(
    order_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = db.query(PharmacyOrder).filter(PharmacyOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    resolve_household_access(
        db, user, requested_household_id=order.household_id, required_permission="can_manage_refills"
    )
    if order.status not in ("PENDING", "ACCEPTED", "PREPARING"):
        raise HTTPException(
            status_code=400,
            detail=f"Order cannot be cancelled once it is '{order.status}'.",
        )

    now = utcnow_naive()
    for item in order.items:
        db.execute(
            text(
                "UPDATE pharmacy_medicines SET reserved_quantity = MAX(0, reserved_quantity - :qty), updated_at = :now "
                "WHERE id = :mid"
            ),
            {"qty": item.quantity, "now": now, "mid": item.pharmacy_medicine_id},
        )
        pm = db.query(PharmacyMedicine).filter(PharmacyMedicine.id == item.pharmacy_medicine_id).first()
        db.add(
            InventoryTransaction(
                pharmacy_medicine_id=item.pharmacy_medicine_id,
                pharmacy_id=order.pharmacy_id,
                actor_user_id=user.id,
                tx_type="RELEASE",
                quantity_change=item.quantity,
                balance_after=pm.stock_quantity if pm else 0,
                reference_type="ORDER",
                reference_id=order.id,
                notes=f"Released reservation on customer cancellation ({order.order_number})",
                created_at=now,
            )
        )

    order.status = "CANCELLED"
    order.updated_at = now
    db.add(
        OrderStatusHistory(
            order_id=order.id,
            status="CANCELLED",
            changed_by_user_id=user.id,
            notes="Cancelled by household user; reserved stock released.",
            created_at=now,
        )
    )
    db.commit()
    db.refresh(order)

    ph = db.query(Pharmacy).filter(Pharmacy.id == order.pharmacy_id).first()
    return serialize_order(order, ph.name if ph else None)
