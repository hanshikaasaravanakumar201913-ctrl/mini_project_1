import datetime
import io
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.c_engine_bridge import c_engine
from backend.app.config import settings
from backend.app.database import Base, get_db
from backend.app.main import app
from backend.app.routes.c_engine import repopulate_c_structures
from backend.app.security import auth_rate_limiter
from backend.app.seed_data import seed_demonstration_dataset


@pytest.fixture()
def client_and_db(tmp_path, monkeypatch):
    auth_rate_limiter.reset()
    monkeypatch.setattr(settings, "PRIVATE_UPLOAD_DIR", tmp_path / "private_uploads")
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    db = TestingSession()
    seed_demonstration_dataset(db, reset=False)
    repopulate_c_structures(db)
    db.close()

    def override_get_db():
        session = TestingSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client, TestingSession
    app.dependency_overrides.clear()
    c_engine.clear_all()


def _login(client: TestClient, email: str, password: str) -> dict:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (32, 32), color=(18, 184, 176)).save(buf, format="PNG")
    return buf.getvalue()


def test_auth_registration_isolation_and_password_reset(client_and_db):
    client, _ = client_and_db

    # Unauthenticated access to private household endpoint must fail
    assert client.get("/api/medicines").status_code == 401

    # Demo owner login works
    owner_auth = _login(client, "owner@medora.demo", "MedoraOwner!2026")
    owner_hdr = _auth_header(owner_auth["access_token"])
    assert len(client.get("/api/medicines", headers=owner_hdr).json()) >= 7

    # Register a separate household owner -> completely isolated empty cabinet
    reg = client.post(
        "/api/auth/register",
        json={
            "email": "newhousehold@example.com",
            "password": "StrongPassword!99",
            "full_name": "Priya Nair",
            "role": "HOUSEHOLD_OWNER",
            "household_name": "Nair Household",
        },
    )
    assert reg.status_code == 201, reg.text
    new_token = reg.json()["access_token"]
    new_hdr = _auth_header(new_token)

    assert client.get("/api/medicines", headers=new_hdr).json() == []
    # Cross-household read attempt -> 403 Forbidden
    assert client.get(f"/api/medicines?household_id={owner_auth['household_id']}", headers=new_hdr).status_code == 403

    # Pharmacy staff cannot read household medicines
    pharm_auth = _login(client, "pharmacy@medora.demo", "MedoraPharm!2026")
    assert client.get("/api/medicines", headers=_auth_header(pharm_auth["access_token"])).status_code == 403

    # Password reset revokes old token
    forgot = client.post("/api/auth/forgot-password", json={"email": "newhousehold@example.com"})
    assert forgot.status_code == 200
    reset_tok = forgot.json()["dev_reset_token"]
    reset = client.post("/api/auth/reset-password", json={"token": reset_tok, "new_password": "UpdatedPassword!88"})
    assert reset.status_code == 200
    assert client.get("/api/auth/me", headers=new_hdr).status_code == 401
    _login(client, "newhousehold@example.com", "UpdatedPassword!88")


def test_caregiver_permissions_and_immediate_revocation(client_and_db):
    client, _ = client_and_db
    owner_auth = _login(client, "owner@medora.demo", "MedoraOwner!2026")
    owner_hdr = _auth_header(owner_auth["access_token"])

    # Register fresh caregiver
    cg_reg = client.post(
        "/api/auth/register",
        json={
            "email": "fresh.caregiver@example.com",
            "password": "CaregiverPass!1",
            "full_name": "Suresh Caregiver",
            "role": "CAREGIVER",
        },
    )
    assert cg_reg.status_code == 201
    cg_hdr = _auth_header(cg_reg.json()["access_token"])

    # Invite caregiver WITHOUT prescription or edit permissions
    inv_res = client.post(
        "/api/caregivers/invite",
        headers=owner_hdr,
        json={
            "caregiver_email": "fresh.caregiver@example.com",
            "can_view_medicines": True,
            "can_edit_medicines": False,
            "can_view_prescriptions": False,
            "can_manage_schedules": True,
            "can_record_doses": True,
            "can_view_notifications": True,
            "can_manage_refills": False,
        },
    )
    assert inv_res.status_code == 201
    inv_id = inv_res.json()["id"]

    # Caregiver accepts invitation
    acc = client.post(f"/api/caregivers/invitations/{inv_id}/accept", headers=cg_hdr)
    assert acc.status_code == 200
    perm_id = acc.json()["id"]

    # Permitted: view medicines
    assert client.get("/api/medicines", headers=cg_hdr).status_code == 200
    # Denied: view prescriptions & edit medicines
    assert client.get("/api/prescriptions", headers=cg_hdr).status_code == 403
    assert (
        client.post(
            "/api/medicines",
            headers=cg_hdr,
            json={"medicine_name": "Unauthorized Med", "printed_expiry_date": "2027-01-01", "quantity": 5},
        ).status_code
        == 403
    )

    # Owner revokes access immediately
    rev = client.delete(f"/api/caregivers/{perm_id}", headers=owner_hdr)
    assert rev.status_code == 200
    assert client.get("/api/medicines", headers=cg_hdr).status_code == 403


def test_prescription_vault_security_and_refill_prediction_engine(client_and_db):
    client, _ = client_and_db
    owner_auth = _login(client, "owner@medora.demo", "MedoraOwner!2026")
    owner_hdr = _auth_header(owner_auth["access_token"])

    # Reject invalid binary pretending to be image
    bad_upload = client.post(
        "/api/prescriptions",
        headers=owner_hdr,
        data={"title": "Fake File", "prescribed_date": "2026-11-01"},
        files={"file": ("evil.jpg", b"not-an-image", "image/jpeg")},
    )
    assert bad_upload.status_code == 400

    # Valid PNG upload + private download
    soon = (datetime.date.today() + datetime.timedelta(days=3)).isoformat()
    good_upload = client.post(
        "/api/prescriptions",
        headers=owner_hdr,
        data={
            "title": "Diabetes Follow-Up Rx",
            "doctor_name": "Dr. Kavitha",
            "prescribed_date": datetime.date.today().isoformat(),
            "valid_until": soon,
        },
        files={"file": ("rx.png", _make_png_bytes(), "image/png")},
    )
    assert good_upload.status_code == 201, good_upload.text
    rx_id = good_upload.json()["id"]

    # Unauthenticated download blocked
    assert client.get(f"/api/prescriptions/{rx_id}/download").status_code == 401
    # Authorized owner download succeeds
    dl = client.get(f"/api/prescriptions/{rx_id}/download", headers=owner_hdr)
    assert dl.status_code == 200
    assert dl.content.startswith(b"\x89PNG")

    # Refill predictions: Daily medicine gets depletion estimate; As-Needed never gets fixed daily rate
    preds = client.get("/api/refill/predictions", headers=owner_hdr).json()
    as_needed = [p for p in preds if p["confidence_level"] == "AS_NEEDED_ESTIMATE"]
    daily = [p for p in preds if p["frequency"] == "Daily"]
    assert len(as_needed) >= 1
    assert as_needed[0]["estimated_depletion_date"] is None
    assert as_needed[0]["estimated_daily_consumption"] == 0.0
    assert len(daily) >= 1
    assert daily[0]["estimated_depletion_date"] is not None

    # Public QR passport verification exposes medicine authenticity WITHOUT household/member PII
    meds = client.get("/api/medicines", headers=owner_hdr).json()
    token = meds[0]["passport_token"]
    qr_res = client.get(f"/api/medicines/passport/verify/{token}")
    assert qr_res.status_code == 200
    qr_json = qr_res.json()
    assert qr_json["verified"] is True
    assert "assigned_member" not in qr_json
    assert "household_id" not in qr_json


def test_pharmacy_discovery_refill_request_and_transaction_safe_ordering(client_and_db):
    client, _ = client_and_db
    owner_hdr = _auth_header(_login(client, "owner@medora.demo", "MedoraOwner!2026")["access_token"])
    pharm_hdr = _auth_header(_login(client, "pharmacy@medora.demo", "MedoraPharm!2026")["access_token"])
    admin_hdr = _auth_header(_login(client, "admin@medora.demo", "MedoraAdmin!2026")["access_token"])

    # 1. Location-based discovery & medicine search
    near = client.get("/api/pharmacies/search?lat=13.0827&lng=80.2707&radius_km=20").json()
    assert len(near) >= 3
    assert near[0]["distance_km"] is not None

    med_search = client.get("/api/pharmacies/medicines/search?q=Paracetamol&sort_by=price").json()
    assert med_search["total"] >= 2
    # Sorted ascending by price
    prices = [r["unit_price"] for r in med_search["results"]]
    assert prices == sorted(prices)

    # 2. Register new partner pharmacy -> stays PENDING until ADMIN verifies
    new_pharm_reg = client.post(
        "/api/auth/register",
        json={
            "email": "newpharm@example.com",
            "password": "PharmPassword!1",
            "full_name": "Bala Pharmacist",
            "role": "PHARMACY_STAFF",
        },
    )
    new_pharm_hdr = _auth_header(new_pharm_reg.json()["access_token"])
    created_ph = client.post(
        "/api/pharmacy-portal/register",
        headers=new_pharm_hdr,
        json={
            "name": "Velachery Verified Meds",
            "license_number": "TN-CHN-9981",
            "address": "100 Feet Road, Velachery",
            "city": "Chennai",
            "phone": "+91-44-2244-9981",
            "latitude": 12.9815,
            "longitude": 80.2180,
        },
    )
    assert created_ph.status_code == 201
    new_ph_id = created_ph.json()["id"]
    assert created_ph.json()["verification_status"] == "PENDING"

    # Admin verifies new pharmacy
    ver = client.patch(
        f"/api/pharmacies/admin/{new_ph_id}/verify",
        headers=admin_hdr,
        json={"verification_status": "VERIFIED"},
    )
    assert ver.status_code == 200
    assert ver.json()["verification_status"] == "VERIFIED"

    # Add limited stock item (stock=5)
    inv_item = client.post(
        "/api/pharmacy-portal/inventory",
        headers=new_pharm_hdr,
        json={
            "medicine_name": "Metformin 500mg",
            "generic_name": "Metformin",
            "strength": "500mg",
            "prescription_required": True,
            "unit_price": 45.0,
            "stock_quantity": 5,
        },
    ).json()

    # 3. Prescription enforcement on regulated refill/order
    order_no_rx = client.post(
        "/api/orders",
        headers=owner_hdr,
        json={
            "pharmacy_id": new_ph_id,
            "fulfilment_type": "PICKUP",
            "payment_method": "PAY_AT_PICKUP",
            "items": [{"pharmacy_medicine_id": inv_item["id"], "quantity": 3}],
        },
    )
    assert order_no_rx.status_code == 400

    # Upload valid prescription and place order for 3 of 5 units
    rx = client.post(
        "/api/prescriptions",
        headers=owner_hdr,
        data={"title": "Metformin Rx", "prescribed_date": datetime.date.today().isoformat()},
        files={"file": ("rx.png", _make_png_bytes(), "image/png")},
    ).json()

    order1 = client.post(
        "/api/orders",
        headers=owner_hdr,
        json={
            "pharmacy_id": new_ph_id,
            "prescription_id": rx["id"],
            "fulfilment_type": "PICKUP",
            "payment_method": "PAY_AT_PICKUP",
            "items": [{"pharmacy_medicine_id": inv_item["id"], "quantity": 3}],
        },
    )
    assert order1.status_code == 201, order1.text
    order1_data = order1.json()
    assert order1_data["total_amount"] == 135.0
    assert order1_data["payment_status"] == "UNPAID_PAY_AT_PICKUP"

    # Attempting to order 3 more (only 2 unreserved left) must fail with 409 Conflict!
    order_oversell = client.post(
        "/api/orders",
        headers=owner_hdr,
        json={
            "pharmacy_id": new_ph_id,
            "prescription_id": rx["id"],
            "fulfilment_type": "PICKUP",
            "payment_method": "PAY_AT_PICKUP",
            "items": [{"pharmacy_medicine_id": inv_item["id"], "quantity": 3}],
        },
    )
    assert order_oversell.status_code == 409

    # Fulfill order1 -> stock drops from 5 to 2 and reserved drops from 3 to 0
    done_order = client.patch(
        f"/api/pharmacy-portal/orders/{order1_data['id']}/status",
        headers=new_pharm_hdr,
        json={"status": "COMPLETED", "notes": "Dispensed after Rx check"},
    )
    assert done_order.status_code == 200
    inv_after = client.get("/api/pharmacy-portal/inventory", headers=new_pharm_hdr).json()
    assert inv_after["items"][0]["stock_quantity"] == 2
    assert inv_after["items"][0]["reserved_quantity"] == 0

    # Demo pharmacy staff sees demo pharmacy
    assert client.get("/api/pharmacy-portal/my-pharmacy", headers=pharm_hdr).status_code == 200


def test_order_cancel_releases_stock_and_refill_request_lifecycle(client_and_db):
    client, _ = client_and_db
    owner = _login(client, "owner@medora.demo", "MedoraOwner!2026")
    pharm = _login(client, "pharmacy@medora.demo", "MedoraPharm!2026")
    owner_hdr = _auth_header(owner["access_token"])
    pharm_hdr = _auth_header(pharm["access_token"])

    inv = client.get("/api/pharmacy-portal/inventory", headers=pharm_hdr).json()
    paracetamol_item = next(
        it for it in inv["items"] if not it["prescription_required"] and it["available_quantity"] >= 5
    )
    rx_item = next(
        it for it in inv["items"] if it["prescription_required"] and it["available_quantity"] >= 2
    )
    pharmacy_id = inv["pharmacy"]["id"]
    initial_reserved = paracetamol_item["reserved_quantity"]

    # Place order for 3 units, then cancel -> reservation returns to initial_reserved
    order_res = client.post(
        "/api/orders",
        headers=owner_hdr,
        json={
            "pharmacy_id": pharmacy_id,
            "fulfilment_type": "PICKUP",
            "payment_method": "PAY_AT_PICKUP",
            "items": [{"pharmacy_medicine_id": paracetamol_item["id"], "quantity": 3}],
        },
    )
    assert order_res.status_code == 201, order_res.text
    order_id = order_res.json()["id"]

    mid_inv = client.get("/api/pharmacy-portal/inventory", headers=pharm_hdr).json()
    mid_item = next(it for it in mid_inv["items"] if it["id"] == paracetamol_item["id"])
    assert mid_item["reserved_quantity"] == initial_reserved + 3

    cancel_res = client.post(f"/api/orders/{order_id}/cancel", headers=owner_hdr)
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "CANCELLED"

    after_inv = client.get("/api/pharmacy-portal/inventory", headers=pharm_hdr).json()
    after_item = next(it for it in after_inv["items"] if it["id"] == paracetamol_item["id"])
    assert after_item["reserved_quantity"] == initial_reserved

    # Refill request lifecycle with regulated medicine (requires valid prescription)
    rx_up = client.post(
        "/api/prescriptions",
        headers=owner_hdr,
        data={"title": "Refill Rx", "prescribed_date": datetime.date.today().isoformat()},
        files={"file": ("rx.png", _make_png_bytes(), "image/png")},
    ).json()

    rr_res = client.post(
        "/api/orders/refill-requests",
        headers=owner_hdr,
        json={
            "pharmacy_id": pharmacy_id,
            "pharmacy_medicine_id": rx_item["id"],
            "prescription_id": rx_up["id"],
            "medicine_name": rx_item["medicine_name"],
            "requested_quantity": 2,
            "fulfilment_type": "PICKUP",
        },
    )
    assert rr_res.status_code == 201, rr_res.text
    rr_id = rr_res.json()["id"]

    # Pharmacist accepts refill request
    acc = client.patch(
        f"/api/pharmacy-portal/refill-requests/{rr_id}/status",
        headers=pharm_hdr,
        json={"status": "ACCEPTED", "pharmacist_notes": "Verified attached Rx; packing refill."},
    )
    assert acc.status_code == 200
    assert acc.json()["status"] == "ACCEPTED"

    hh_rr = client.get("/api/orders/refill-requests", headers=owner_hdr).json()
    assert any(r["id"] == rr_id and r["status"] == "ACCEPTED" for r in hh_rr)


def test_ocr_image_upload_and_auth_rate_limiter(client_and_db):
    client, _ = client_and_db

    # OCR image upload produces an unconfirmed draft with image dimensions metadata
    ocr_res = client.post(
        "/api/education/ocr/upload",
        data={"raw_text": "Telma 40 Telmisartan Tablets IP 40mg\nBatch: TM-409\nEXP: 12/2027"},
        files={"file": ("telma_strip.png", _make_png_bytes(), "image/png")},
    )
    assert ocr_res.status_code == 200, ocr_res.text
    body = ocr_res.json()
    assert body["brand"] == "Telma 40"
    assert body["batch_number"] == "TM-409"
    assert body["is_confirmed"] is False
    assert body["requires_review"] is True
    assert "PNG 32x32" in (body["image_metadata"] or "")

    # Auth sliding-window rate limiter enforces HTTP 429 after 25 requests
    auth_rate_limiter.reset()
    statuses = []
    for _ in range(27):
        resp = client.post(
            "/api/auth/login",
            json={"email": "owner@medora.demo", "password": "WrongPassword!"},
        )
        statuses.append(resp.status_code)
    assert 429 in statuses
    auth_rate_limiter.reset()


def test_concurrent_order_stock_reservation_atomicity(tmp_path):
    import concurrent.futures
    from sqlalchemy import event

    auth_rate_limiter.reset()
    db_file = tmp_path / "concurrent_orders.db"
    engine = create_engine(
        f"sqlite:///{db_file.as_posix()}",
        connect_args={"check_same_thread": False, "timeout": 30},
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, _rec):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.close()

    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    db = TestingSession()
    seed_demonstration_dataset(db, reset=False)
    repopulate_c_structures(db)
    db.close()

    def override_get_db():
        session = TestingSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            admin = _login(client, "admin@medora.demo", "MedoraAdmin!2026")
            pharm = _login(client, "pharmacy@medora.demo", "MedoraPharm!2026")
            owner = _login(client, "owner@medora.demo", "MedoraOwner!2026")

            # Add limited OTC item with stock=4
            item = client.post(
                "/api/pharmacy-portal/inventory",
                headers=_auth_header(pharm["access_token"]),
                json={
                    "medicine_name": "ORS Electrolyte Pack",
                    "generic_name": "Oral Rehydration Salts",
                    "strength": "21.8g",
                    "prescription_required": False,
                    "unit_price": 22.0,
                    "stock_quantity": 4,
                },
            ).json()
            inv_info = client.get(
                "/api/pharmacy-portal/my-pharmacy",
                headers=_auth_header(pharm["access_token"]),
            ).json()
            ph_id = inv_info["id"]

            # Ensure pharmacy is VERIFIED
            client.patch(
                f"/api/pharmacies/admin/{ph_id}/verify",
                headers=_auth_header(admin["access_token"]),
                json={"verification_status": "VERIFIED"},
            )

            def try_buy():
                return client.post(
                    "/api/orders",
                    headers=_auth_header(owner["access_token"]),
                    json={
                        "pharmacy_id": ph_id,
                        "fulfilment_type": "PICKUP",
                        "payment_method": "PAY_AT_PICKUP",
                        "items": [{"pharmacy_medicine_id": item["id"], "quantity": 3}],
                    },
                ).status_code

            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: try_buy(), range(2)))

            # At most one order of qty 3 can succeed out of 4 stock; second must get 409 Conflict
            assert sorted(results) == [201, 409]
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
        c_engine.clear_all()

