import datetime
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app import geocoding_service
from backend.app.c_engine_bridge import c_engine
from backend.app.config import settings
from backend.app.database import Base, get_db
from backend.app.main import app
from backend.app.models import Pharmacy, UserSession
from backend.app.routes.c_engine import repopulate_c_structures
from backend.app.routes.pharmacies import evaluate_is_open_now
from backend.app.security import auth_rate_limiter, hash_token
from backend.app.seed_data import seed_demonstration_dataset


@pytest.fixture()
def client_and_db(tmp_path, monkeypatch):
    auth_rate_limiter.reset()
    geocoding_service._GEOCODE_CACHE.clear()
    monkeypatch.setattr(settings, "PRIVATE_UPLOAD_DIR", tmp_path / "private_uploads")
    # Make geocoding deterministic & offline-safe in automated unit tests
    monkeypatch.setattr(geocoding_service, "_query_nominatim", lambda q, limit=5: None)
    monkeypatch.setattr(geocoding_service, "_query_opencage", lambda q, limit=5: None)

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


def _hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_session_me_expiry_and_logout_revocation(client_and_db):
    client, TestingSession = client_and_db

    # Login creates active session and /me returns session_expires_at
    auth = _login(client, "owner@medora.demo", "MedoraOwner!2026")
    token = auth["access_token"]
    me_res = client.get("/api/auth/me", headers=_hdr(token))
    assert me_res.status_code == 200, me_res.text
    me_data = me_res.json()
    assert me_data["user"]["email"] == "owner@medora.demo"
    assert me_data["session_expires_at"] is not None

    # Logout revokes session immediately -> next /me and /medicines must fail with 401
    out = client.post("/api/auth/logout", headers=_hdr(token))
    assert out.status_code == 200
    assert client.get("/api/auth/me", headers=_hdr(token)).status_code == 401
    assert client.get("/api/medicines", headers=_hdr(token)).status_code == 401

    # Fresh login, then force DB expiration -> must return 401 cleanly
    auth2 = _login(client, "owner@medora.demo", "MedoraOwner!2026")
    token2 = auth2["access_token"]
    db = TestingSession()
    sess = db.query(UserSession).filter(UserSession.token_hash == hash_token(token2)).first()
    assert sess is not None
    sess.expires_at = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(minutes=5)
    db.commit()
    db.close()

    assert client.get("/api/auth/me", headers=_hdr(token2)).status_code == 401
    assert client.get("/api/medicines", headers=_hdr(token2)).status_code == 401


def test_role_isolation_between_household_and_pharmacy_and_admin(client_and_db):
    client, _ = client_and_db
    owner = _login(client, "owner@medora.demo", "MedoraOwner!2026")
    staff = _login(client, "pharmacy@medora.demo", "MedoraPharm!2026")

    # Owner cannot access pharmacy portal or admin verification endpoints
    assert client.get("/api/pharmacy-portal/orders", headers=_hdr(owner["access_token"])).status_code == 403
    assert client.get("/api/pharmacies/admin/list", headers=_hdr(owner["access_token"])).status_code == 403

    # Pharmacy staff can view inventory, cannot access admin verification
    assert client.get("/api/pharmacy-portal/inventory", headers=_hdr(staff["access_token"])).status_code == 200
    assert client.get("/api/pharmacies/admin/list", headers=_hdr(staff["access_token"])).status_code == 403


def test_geocode_location_tamil_nadu_regions_and_unknown_query(client_and_db):
    client, _ = client_and_db

    for city, expected_lat_range in [
        ("Pollachi", (10.5, 10.8)),
        ("Coimbatore", (10.9, 11.2)),
        ("Erode", (11.2, 11.5)),
        ("Chennai", (12.9, 13.3)),
    ]:
        res = client.get("/api/pharmacies/geocode", params={"q": city, "limit": 5})
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["count"] >= 1, f"Expected geocode hit for {city}"
        top = data["results"][0]
        assert expected_lat_range[0] <= top["latitude"] <= expected_lat_range[1]

    miss = client.get("/api/pharmacies/geocode", params={"q": "NoSuchTownXYZ98765"})
    assert miss.status_code == 200
    assert miss.json()["count"] == 0
    assert miss.json()["results"] == []


def test_nearby_pharmacies_radius_nlp_medicine_and_missing_stock(client_and_db):
    client, _ = client_and_db

    # 1) Pollachi coordinates within 10km -> finds Pollachi CarePlus Pharmacy
    pollachi = client.get(
        "/api/pharmacies/nearby",
        params={"latitude": 10.6589, "longitude": 77.0087, "radius_km": 10, "verified_only": True},
    )
    assert pollachi.status_code == 200, pollachi.text
    p_data = pollachi.json()
    assert p_data["total"] == 1
    assert "Pollachi" in p_data["pharmacies"][0]["city"]
    assert p_data["pharmacies"][0]["data_origin"] == "SAMPLE_DEMO"

    # 2) Radius expansion 10km vs 50km from Pollachi pulls in Coimbatore (~40 km) without Chennai (>400 km)
    expanded = client.get(
        "/api/pharmacies/nearby",
        params={"latitude": 10.6589, "longitude": 77.0087, "radius_km": 50, "verified_only": True},
    ).json()
    cities = {ph["city"] for ph in expanded["pharmacies"]}
    assert "Pollachi" in cities
    assert "Coimbatore" in cities
    assert "Chennai" not in cities

    # 3) Coimbatore clustering -> 2 stores within 15km
    cbe = client.get(
        "/api/pharmacies/nearby",
        params={"latitude": 11.0168, "longitude": 76.9558, "radius_km": 15, "verified_only": True},
    ).json()
    assert cbe["total"] == 2

    # 4) Multilingual NLP symptom query (Tamil fever -> Paracetamol) returns ONLY stores carrying Paracetamol stock
    tamil_fever = client.get(
        "/api/pharmacies/nearby",
        params={
            "latitude": 10.6589,
            "longitude": 77.0087,
            "radius_km": 50,
            "medicine_query": "காய்ச்சல்",
            "in_stock_only": True,
        },
    ).json()
    assert "paracetamol" in tamil_fever["resolved_medicine_terms"]
    assert tamil_fever["total"] >= 1
    for ph in tamil_fever["pharmacies"]:
        assert ph["matching_medicines_count"] >= 1
        assert all(m["available_quantity"] > 0 for m in ph["matching_medicines"])

    # 5) Unavailable / unknown medicine returns 0
    empty_med = client.get(
        "/api/pharmacies/nearby",
        params={"latitude": 11.0168, "longitude": 76.9558, "radius_km": 50, "medicine_query": "NonExistentMedXYZ"},
    ).json()
    assert empty_med["total"] == 0
    assert empty_med["pharmacies"] == []

    # 6) Asymmetric lat/lng params rejected cleanly
    bad_params = client.get("/api/pharmacies/nearby", params={"latitude": 11.0})
    assert bad_params.status_code == 400


def test_partner_registration_coordinate_validation_and_admin_verification(client_and_db):
    client, TestingSession = client_and_db

    # Register a new pharmacy staff user
    reg_user = client.post(
        "/api/auth/register",
        json={
            "email": "pollachi_partner@example.com",
            "password": "PartnerPass!2026",
            "full_name": "Karthik Subramanian",
            "role": "PHARMACY_STAFF",
        },
    )
    assert reg_user.status_code == 201, reg_user.text
    staff_hdr = _hdr(reg_user.json()["access_token"])

    # (0, 0) Null Island coordinates must be rejected
    bad_reg = client.post(
        "/api/pharmacy-portal/register",
        headers=staff_hdr,
        json={
            "name": "Bad Coords Pharmacy",
            "license_number": "TN-BAD-0001",
            "address": "Zero Road",
            "city": "Pollachi",
            "phone": "+91-90000-00001",
            "latitude": 0.0,
            "longitude": 0.0,
        },
    )
    assert bad_reg.status_code == 400

    # Valid Pollachi partner registration starts PENDING & coordinates_verified=False
    good_reg = client.post(
        "/api/pharmacy-portal/register",
        headers=staff_hdr,
        json={
            "name": "Pollachi Authentic Medicals",
            "license_number": "TN-POL-9988",
            "address": "42 Kovai Main Road",
            "city": "Pollachi",
            "phone": "+91-4259-299881",
            "latitude": 10.6612,
            "longitude": 77.0110,
            "business_hours": "Schedule Varies",
        },
    )
    assert good_reg.status_code == 201, good_reg.text
    ph_data = good_reg.json()
    ph_id = ph_data["id"]
    assert ph_data["coordinates_verified"] is False
    assert ph_data["location_needs_verification"] is True
    assert ph_data["is_open_now"] is None

    # Excluded when verified_only=true, included when verified_only=false
    ver_only = client.get(
        "/api/pharmacies/nearby",
        params={"latitude": 10.6589, "longitude": 77.0087, "radius_km": 10, "verified_only": True},
    ).json()
    assert all(p["id"] != ph_id for p in ver_only["pharmacies"])

    incl_unverified = client.get(
        "/api/pharmacies/nearby",
        params={"latitude": 10.6589, "longitude": 77.0087, "radius_km": 10, "verified_only": False},
    ).json()
    assert any(p["id"] == ph_id for p in incl_unverified["pharmacies"])

    # Admin corrects coordinates and verifies pharmacy
    admin = _login(client, "admin@medora.demo", "MedoraAdmin!2026")
    admin_hdr = _hdr(admin["access_token"])

    coord_upd = client.patch(
        f"/api/pharmacies/admin/{ph_id}/coordinates",
        headers=admin_hdr,
        json={"latitude": 10.6620, "longitude": 77.0125, "coordinates_verified": True},
    )
    assert coord_upd.status_code == 200, coord_upd.text
    assert coord_upd.json()["coordinates_verified"] is True

    ver_upd = client.patch(
        f"/api/pharmacies/admin/{ph_id}/verify",
        headers=admin_hdr,
        json={"verification_status": "VERIFIED"},
    )
    assert ver_upd.status_code == 200, ver_upd.text
    assert ver_upd.json()["verification_status"] == "VERIFIED"
    assert ver_upd.json()["location_needs_verification"] is False

    # Now included cleanly under verified_only=true
    after_ver = client.get(
        "/api/pharmacies/nearby",
        params={"latitude": 10.6589, "longitude": 77.0087, "radius_km": 10, "verified_only": True},
    ).json()
    assert any(p["id"] == ph_id for p in after_ver["pharmacies"])


def test_evaluate_is_open_now_never_guesses_unparseable_hours():
    assert evaluate_is_open_now(None) is None
    assert evaluate_is_open_now("By appointment only") is None
    assert evaluate_is_open_now("Open 24 Hours") is True
    res = evaluate_is_open_now("08:00 AM - 10:00 PM")
    assert res in (True, False)
