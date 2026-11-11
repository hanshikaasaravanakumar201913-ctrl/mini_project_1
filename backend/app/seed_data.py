import datetime
from sqlalchemy.orm import Session
from backend.app.models import (
    CaregiverPermission,
    DisposalRecord,
    ExpiryNotification,
    Household,
    HouseholdMember,
    MedicationSchedule,
    MedicineEventHistory,
    MedicineRecord,
    Pharmacy,
    PharmacyMedicine,
    PharmacyStaff,
    ScheduleLog,
    User,
    generate_passport_token,
    utcnow_naive,
)
from backend.app.expiry_engine import evaluate_and_generate_notifications
from backend.app.nlp_catalog_seed import seed_canonical_nlp_catalog
from backend.app.security import hash_password


DEMO_ACCOUNTS = [
    ("owner@medora.demo", "MedoraOwner!2026", "Karthik Raman", "HOUSEHOLD_OWNER"),
    ("caregiver@medora.demo", "MedoraCare!2026", "Meena Sundaram", "CAREGIVER"),
    ("pharmacy@medora.demo", "MedoraPharm!2026", "Dr. Aravind Krishnan", "PHARMACY_STAFF"),
    ("admin@medora.demo", "MedoraAdmin!2026", "Medora Administrator", "PLATFORM_ADMIN"),
]


def ensure_demo_users_and_pharmacies(db: Session):
    """
    Ensures default development accounts and clearly labeled SAMPLE_DEMO pharmacies
    exist idempotently without ever deleting existing user data.
    """
    users_by_email = {}
    for email, raw_pw, full_name, role in DEMO_ACCOUNTS:
        u = db.query(User).filter(User.email == email).first()
        if not u:
            u = User(
                email=email,
                full_name=full_name,
                password_hash=hash_password(raw_pw),
                role=role,
                preferred_language="en",
                is_active=True,
            )
            db.add(u)
            db.flush()
        users_by_email[email] = u

    owner = users_by_email["owner@medora.demo"]
    caregiver = users_by_email["caregiver@medora.demo"]
    pharm_user = users_by_email["pharmacy@medora.demo"]

    # Ensure primary household (Raman Household) is linked to owner
    household = db.query(Household).order_by(Household.id.asc()).first()
    if household and household.owner_user_id is None:
        household.owner_user_id = owner.id
        household.address_city = household.address_city or "Chennai"
        household.postal_code = household.postal_code or "600001"
        household.latitude = household.latitude or 13.0827
        household.longitude = household.longitude or 80.2707

    if household:
        # Link Self household member to owner user if unlinked
        self_member = (
            db.query(HouseholdMember)
            .filter(HouseholdMember.household_id == household.id, HouseholdMember.relationship_role == "Self")
            .first()
        )
        if self_member and self_member.linked_user_id is None:
            self_member.linked_user_id = owner.id

        # Ensure caregiver permission exists for demo caregiver
        cg_perm = (
            db.query(CaregiverPermission)
            .filter(
                CaregiverPermission.household_id == household.id,
                CaregiverPermission.caregiver_user_id == caregiver.id,
            )
            .first()
        )
        if not cg_perm:
            db.add(
                CaregiverPermission(
                    household_id=household.id,
                    caregiver_user_id=caregiver.id,
                    can_view_medicines=True,
                    can_edit_medicines=True,
                    can_view_prescriptions=True,
                    can_manage_schedules=True,
                    can_record_doses=True,
                    can_view_notifications=True,
                    can_manage_refills=True,
                    is_active=True,
                )
            )

    # Seed SAMPLE_DEMO pharmacies idempotently across Chennai, Pollachi, Coimbatore, and Erode
    sample_pharmacies = [
        {
            "name": "CareWell Community Pharmacy (Demo)",
            "license_number": "TN-CHN-DEMO-101",
            "address": "42 Cathedral Road, Gopalapuram",
            "city": "Chennai",
            "state": "Tamil Nadu",
            "postal_code": "600086",
            "phone": "+91-44-2811-0101",
            "email": "carewell.demo@medora.local",
            "latitude": 13.0499,
            "longitude": 80.2565,
            "coordinates_verified": True,
            "business_hours": "07:30 AM - 11:00 PM",
            "supports_pickup": True,
            "supports_delivery": True,
            "delivery_radius_km": 12.0,
            "estimated_fulfilment_note": "Demo partner: usually ready in 25 mins",
            "verification_status": "VERIFIED",
            "data_origin": "SAMPLE_DEMO",
            "inventory": [
                ("Paracetamol Tablets IP", "Paracetamol", "Dolo 650", "650mg", "Tablet", "Micro Labs Ltd", "Analgesic", False, 3400, 120),
                ("Metformin Hydrochloride PR", "Metformin", "Glycomet-SR", "500mg", "Tablet", "USV Pvt Ltd", "Antidiabetic", True, 6800, 85),
                ("Telmisartan Tablets IP", "Telmisartan", "Telma 40", "40mg", "Tablet", "Glenmark", "Antihypertensive", True, 11500, 60),
                ("Cetirizine Hydrochloride", "Cetirizine", "Alerid", "10mg", "Tablet", "Cipla Ltd", "Antihistamine", False, 2400, 95),
                ("Levosalbutamol Inhaler", "Levosalbutamol", "Levolin Inhaler", "50mcg / puff", "Inhaler", "Cipla Ltd", "Respiratory", True, 21000, 18),
                ("Azithromycin Tablets IP", "Azithromycin", "Azithral 500", "500mg", "Tablet", "Alembic", "Antibiotic", True, 11900, 40),
            ],
        },
        {
            "name": "Nalam Medicals & Take-Back Center (Demo)",
            "license_number": "TN-CHN-DEMO-204",
            "address": "18 2nd Avenue, Anna Nagar",
            "city": "Chennai",
            "state": "Tamil Nadu",
            "postal_code": "600040",
            "phone": "+91-44-2621-0204",
            "email": "nalam.demo@medora.local",
            "latitude": 13.0850,
            "longitude": 80.2101,
            "coordinates_verified": True,
            "business_hours": "08:00 AM - 10:00 PM",
            "supports_pickup": True,
            "supports_delivery": True,
            "delivery_radius_km": 8.0,
            "estimated_fulfilment_note": "Demo partner + certified expired medicine take-back kiosk",
            "verification_status": "VERIFIED",
            "data_origin": "SAMPLE_DEMO",
            "inventory": [
                ("Paracetamol Tablets IP", "Paracetamol", "Calpol 500", "500mg", "Tablet", "GSK", "Analgesic", False, 2800, 140),
                ("Metformin Hydrochloride PR", "Metformin", "Glycomet-SR", "500mg", "Tablet", "USV Pvt Ltd", "Antidiabetic", True, 6500, 50),
                ("Pantoprazole Tablets", "Pantoprazole", "Pan-40", "40mg", "Tablet", "Alkem", "Gastrointestinal", False, 15500, 75),
                ("Amoxicillin and Clavulanate", "Amoxicillin + Clavulanic Acid", "Augmentin 625", "625mg", "Tablet", "GSK", "Antibiotic", True, 20500, 28),
            ],
        },
        {
            "name": "Adyar Jan Aushadhi Demo Kendra",
            "license_number": "TN-CHN-DEMO-309",
            "address": "7 LB Road, Adyar",
            "city": "Chennai",
            "state": "Tamil Nadu",
            "postal_code": "600020",
            "phone": "+91-44-2441-0309",
            "email": "adyar.demo@medora.local",
            "latitude": 13.0012,
            "longitude": 80.2565,
            "coordinates_verified": True,
            "business_hours": "09:00 AM - 09:00 PM",
            "supports_pickup": True,
            "supports_delivery": False,
            "delivery_radius_km": 0.0,
            "estimated_fulfilment_note": "Pickup only (Demo generic pharmacy)",
            "verification_status": "VERIFIED",
            "data_origin": "SAMPLE_DEMO",
            "inventory": [
                ("Paracetamol Tablets IP", "Paracetamol", "JanAushadhi Paracetamol", "650mg", "Tablet", "BPPI", "Analgesic", False, 1800, 200),
                ("Metformin Hydrochloride PR", "Metformin", "JanAushadhi Metformin", "500mg", "Tablet", "BPPI", "Antidiabetic", True, 3200, 110),
                ("Telmisartan Tablets IP", "Telmisartan", "JanAushadhi Telmisartan", "40mg", "Tablet", "BPPI", "Antihypertensive", True, 4500, 90),
                ("Cetirizine Hydrochloride", "Cetirizine", "JanAushadhi Cetirizine", "10mg", "Tablet", "BPPI", "Antihistamine", False, 1200, 150),
            ],
        },
        {
            "name": "Pollachi CarePlus Pharmacy (Demo)",
            "license_number": "TN-POL-DEMO-401",
            "address": "15 New Scheme Road, Near Bus Stand",
            "city": "Pollachi",
            "state": "Tamil Nadu",
            "postal_code": "642001",
            "phone": "+91-4259-224-401",
            "email": "pollachi.demo@medora.local",
            "latitude": 10.6589,
            "longitude": 77.0087,
            "coordinates_verified": True,
            "business_hours": "08:00 AM - 10:30 PM",
            "supports_pickup": True,
            "supports_delivery": True,
            "delivery_radius_km": 10.0,
            "estimated_fulfilment_note": "Demo partner in Pollachi: ready in 30 mins",
            "verification_status": "VERIFIED",
            "data_origin": "SAMPLE_DEMO",
            "inventory": [
                ("Paracetamol Tablets IP", "Paracetamol", "Dolo 650", "650mg", "Tablet", "Micro Labs Ltd", "Analgesic", False, 3200, 160),
                ("Cetirizine Hydrochloride", "Cetirizine", "Alerid", "10mg", "Tablet", "Cipla Ltd", "Antihistamine", False, 2200, 80),
                ("Pantoprazole Tablets", "Pantoprazole", "Pantocid 40", "40mg", "Tablet", "Sun Pharma", "Gastrointestinal", False, 14800, 64),
            ],
        },
        {
            "name": "Kovai Citizens Medicals (Demo)",
            "license_number": "TN-CBE-DEMO-501",
            "address": "112 Cross Cut Road, Gandhipuram",
            "city": "Coimbatore",
            "state": "Tamil Nadu",
            "postal_code": "641012",
            "phone": "+91-422-249-5010",
            "email": "kovai.demo@medora.local",
            "latitude": 11.0183,
            "longitude": 76.9674,
            "coordinates_verified": True,
            "business_hours": "07:00 AM - 11:00 PM",
            "supports_pickup": True,
            "supports_delivery": True,
            "delivery_radius_km": 15.0,
            "estimated_fulfilment_note": "Demo partner in Gandhipuram, Coimbatore",
            "verification_status": "VERIFIED",
            "data_origin": "SAMPLE_DEMO",
            "inventory": [
                ("Paracetamol Tablets IP", "Paracetamol", "Dolo 650", "650mg", "Tablet", "Micro Labs Ltd", "Analgesic", False, 3300, 140),
                ("Metformin Hydrochloride PR", "Metformin", "Glycomet-SR", "500mg", "Tablet", "USV Pvt Ltd", "Antidiabetic", True, 6600, 90),
                ("Telmisartan Tablets IP", "Telmisartan", "Telma 40", "40mg", "Tablet", "Glenmark", "Antihypertensive", True, 11200, 55),
                ("Amoxicillin and Clavulanate", "Amoxicillin + Clavulanic Acid", "Moxikind-CV 625", "625mg", "Tablet", "Mankind Pharma", "Antibiotic", True, 19500, 35),
            ],
        },
        {
            "name": "RS Puram HealthMart Pharmacy (Demo)",
            "license_number": "TN-CBE-DEMO-502",
            "address": "24 Diwan Bahadur Road, RS Puram",
            "city": "Coimbatore",
            "state": "Tamil Nadu",
            "postal_code": "641002",
            "phone": "+91-422-254-5020",
            "email": "rspuram.demo@medora.local",
            "latitude": 11.0089,
            "longitude": 76.9498,
            "coordinates_verified": True,
            "business_hours": "08:30 AM - 10:00 PM",
            "supports_pickup": True,
            "supports_delivery": True,
            "delivery_radius_km": 10.0,
            "estimated_fulfilment_note": "Demo partner in RS Puram, Coimbatore",
            "verification_status": "VERIFIED",
            "data_origin": "SAMPLE_DEMO",
            "inventory": [
                ("Paracetamol Tablets IP", "Paracetamol", "Calpol 500", "500mg", "Tablet", "GSK", "Analgesic", False, 2700, 110),
                ("Cetirizine Hydrochloride", "Cetirizine", "Cetzine", "10mg", "Tablet", "GSK", "Antihistamine", False, 2100, 95),
                ("Levosalbutamol Inhaler", "Levosalbutamol", "Levolin Inhaler", "50mcg / puff", "Inhaler", "Cipla Ltd", "Respiratory", True, 20800, 22),
            ],
        },
        {
            "name": "Erode Cauvery Wellness Pharmacy (Demo)",
            "license_number": "TN-ERD-DEMO-601",
            "address": "88 Brough Road, Near GH Circle",
            "city": "Erode",
            "state": "Tamil Nadu",
            "postal_code": "638001",
            "phone": "+91-424-226-6010",
            "email": "erode.demo@medora.local",
            "latitude": 11.3410,
            "longitude": 77.7172,
            "coordinates_verified": True,
            "business_hours": "08:00 AM - 10:00 PM",
            "supports_pickup": True,
            "supports_delivery": True,
            "delivery_radius_km": 12.0,
            "estimated_fulfilment_note": "Demo partner in Erode central corridor",
            "verification_status": "VERIFIED",
            "data_origin": "SAMPLE_DEMO",
            "inventory": [
                ("Paracetamol Tablets IP", "Paracetamol", "Dolo 650", "650mg", "Tablet", "Micro Labs Ltd", "Analgesic", False, 3100, 130),
                ("Metformin Hydrochloride PR", "Metformin", "Glycomet-SR", "500mg", "Tablet", "USV Pvt Ltd", "Antidiabetic", True, 6400, 70),
                ("Azithromycin Tablets IP", "Azithromycin", "Azithral 500", "500mg", "Tablet", "Alembic", "Antibiotic", True, 11700, 32),
            ],
        },
    ]

    for idx, p_data in enumerate(sample_pharmacies):
        existing_ph = (
            db.query(Pharmacy)
            .filter(Pharmacy.license_number == p_data["license_number"])
            .first()
        )
        inv_items = p_data.pop("inventory")
        if existing_ph:
            if not existing_ph.coordinates_verified and existing_ph.data_origin == "SAMPLE_DEMO":
                existing_ph.coordinates_verified = True
            continue

        ph = Pharmacy(owner_user_id=pharm_user.id, **p_data)
        db.add(ph)
        db.flush()

        if idx == 0 and not db.query(PharmacyStaff).filter(PharmacyStaff.pharmacy_id == ph.id, PharmacyStaff.user_id == pharm_user.id).first():
            db.add(PharmacyStaff(pharmacy_id=ph.id, user_id=pharm_user.id, staff_role="OWNER"))

        for med_name, gen_name, brand, strength, form, mfg, cat, rx_req, price_p, qty in inv_items:
            db.add(
                PharmacyMedicine(
                    pharmacy_id=ph.id,
                    medicine_name=med_name,
                    generic_name=gen_name,
                    brand=brand,
                    strength=strength,
                    dosage_form=form,
                    manufacturer=mfg,
                    category=cat,
                    prescription_required=rx_req,
                    unit_price_paise=price_p,
                    stock_quantity=qty,
                    reserved_quantity=0,
                    is_available=True,
                    inventory_source="SAMPLE_DEMO",
                )
            )

    db.commit()
    seed_canonical_nlp_catalog(db)


def seed_demonstration_dataset(db: Session, reset: bool = False):
    """
    Seeds a comprehensive, dynamic demonstration dataset where all expiry dates
    are calculated relative to datetime.date.today().
    """
    if reset:
        db.query(DisposalRecord).delete()
        db.query(MedicineEventHistory).delete()
        db.query(ScheduleLog).delete()
        db.query(MedicationSchedule).delete()
        db.query(ExpiryNotification).delete()
        db.query(MedicineRecord).delete()
        db.query(HouseholdMember).delete()
        db.query(Household).delete()
        db.commit()

    if db.query(Household).first():
        ensure_demo_users_and_pharmacies(db)
        return

    today = datetime.date.today()
    now_utc = utcnow_naive()

    # Ensure demo users first so household can attach owner_user_id immediately
    ensure_demo_users_and_pharmacies(db)
    owner = db.query(User).filter(User.email == "owner@medora.demo").first()

    household = Household(
        name="Raman Household",
        owner_user_id=owner.id if owner else None,
        address_city="Chennai",
        postal_code="600001",
        latitude=13.0827,
        longitude=80.2707,
    )
    db.add(household)
    db.flush()

    m_self = HouseholdMember(
        household_id=household.id,
        linked_user_id=owner.id if owner else None,
        name="Karthik Raman",
        relationship_role="Self",
        age=34,
        allergies="None known",
        notes="Primary caregiver and account administrator",
    )
    m_mother = HouseholdMember(
        household_id=household.id,
        name="Lakshmi Raman",
        relationship_role="Mother",
        age=68,
        allergies="Sulfa antibiotics",
        notes="Hypertension and Type 2 Diabetes; requires daily reminder oversight",
    )
    m_child = HouseholdMember(
        household_id=household.id,
        name="Aarav Raman",
        relationship_role="Child",
        age=8,
        allergies="Peanuts (mild)",
        notes="Pediatric dosage adjustments; mild seasonal asthma",
    )
    db.add_all([m_self, m_mother, m_child])
    db.flush()

    d_expired = (today - datetime.timedelta(days=4)).isoformat()
    d_1day = (today + datetime.timedelta(days=1)).isoformat()
    d_3day = (today + datetime.timedelta(days=3)).isoformat()
    d_5day = (today + datetime.timedelta(days=5)).isoformat()
    d_10day = (today + datetime.timedelta(days=10)).isoformat()
    d_safe1 = (today + datetime.timedelta(days=120)).isoformat()
    d_safe2 = (today + datetime.timedelta(days=180)).isoformat()
    d_draft = (today + datetime.timedelta(days=60)).isoformat()
    d_disposed = (today - datetime.timedelta(days=15)).isoformat()

    meds = [
        MedicineRecord(
            household_id=household.id,
            medicine_name="Amoxicillin Oral Suspension",
            brand="Moxikind-CV",
            strength="228.5mg / 5ml",
            dosage_form="Syrup",
            manufacturer="Mankind Pharma",
            category="Antibiotic",
            prescription_required=True,
            batch_number="MX2024-09",
            printed_expiry_date=d_expired,
            purchase_date=(today - datetime.timedelta(days=40)).isoformat(),
            opened_date=(today - datetime.timedelta(days=20)).isoformat(),
            quantity=1,
            quantity_unit="bottle",
            stock_threshold=2,
            storage_instructions="Store refrigerated between 2°C - 8°C. Do not freeze.",
            notes="Completed 5-day course last month. Remaining suspension now expired.",
            assigned_member_id=m_child.id,
            passport_token=generate_passport_token(),
            data_source="MANUAL",
            is_confirmed=True,
            is_disposed=False,
        ),
        MedicineRecord(
            household_id=household.id,
            medicine_name="Cetirizine Hydrochloride",
            brand="Alerid",
            strength="10mg",
            dosage_form="Tablet",
            manufacturer="Cipla Ltd",
            category="Antihistamine",
            prescription_required=False,
            batch_number="CTZ-2601",
            printed_expiry_date=d_1day,
            purchase_date=(today - datetime.timedelta(days=60)).isoformat(),
            quantity=6,
            quantity_unit="tablets",
            stock_threshold=5,
            storage_instructions="Store below 30°C in original blister pack.",
            notes="Allergy relief tablet. Replace batch immediately.",
            assigned_member_id=m_child.id,
            passport_token=generate_passport_token(),
            data_source="OCR",
            is_confirmed=True,
            is_disposed=False,
        ),
        MedicineRecord(
            household_id=household.id,
            medicine_name="Azithromycin Tablets IP",
            brand="Azithral",
            strength="500mg",
            dosage_form="Tablet",
            manufacturer="Alembic Pharma",
            category="Antibiotic",
            prescription_required=True,
            batch_number="AZ-9088",
            printed_expiry_date=d_3day,
            purchase_date=(today - datetime.timedelta(days=30)).isoformat(),
            quantity=3,
            quantity_unit="tablets",
            stock_threshold=3,
            storage_instructions="Store protected from moisture and direct light.",
            notes="Short-term prescription for upper respiratory symptoms.",
            assigned_member_id=m_self.id,
            passport_token=generate_passport_token(),
            data_source="MANUAL",
            is_confirmed=True,
            is_disposed=False,
        ),
        MedicineRecord(
            household_id=household.id,
            medicine_name="Metformin Hydrochloride Prolonged-Release",
            brand="Glycomet-SR",
            strength="500mg",
            dosage_form="Tablet",
            manufacturer="USV Pvt Ltd",
            category="Antidiabetic",
            prescribed_dosage="1 tablet once daily after breakfast",
            prescription_required=True,
            batch_number="GLY-552",
            printed_expiry_date=d_5day,
            purchase_date=(today - datetime.timedelta(days=90)).isoformat(),
            quantity=14,
            quantity_unit="tablets",
            stock_threshold=10,
            storage_instructions="Keep in original strip pack below 25°C.",
            notes="Daily diabetic management. Request refill from physician this week.",
            assigned_member_id=m_mother.id,
            passport_token=generate_passport_token(),
            data_source="OCR",
            is_confirmed=True,
            is_disposed=False,
        ),
        MedicineRecord(
            household_id=household.id,
            medicine_name="Paracetamol Tablets IP",
            brand="Dolo 650",
            strength="650mg",
            dosage_form="Tablet",
            manufacturer="Micro Labs Ltd",
            category="Analgesic & Antipyretic",
            prescription_required=False,
            batch_number="DL-8812",
            printed_expiry_date=d_10day,
            purchase_date=(today - datetime.timedelta(days=120)).isoformat(),
            quantity=15,
            quantity_unit="tablets",
            stock_threshold=8,
            storage_instructions="Store in cool, dry place away from children.",
            notes="Household antipyretic / fever & pain medicine.",
            assigned_member_id=m_self.id,
            passport_token=generate_passport_token(),
            data_source="BARCODE",
            is_confirmed=True,
            is_disposed=False,
        ),
        MedicineRecord(
            household_id=household.id,
            medicine_name="Telmisartan Tablets IP",
            brand="Telma 40",
            strength="40mg",
            dosage_form="Tablet",
            manufacturer="Glenmark Pharmaceuticals",
            category="Antihypertensive",
            prescribed_dosage="1 tablet daily at 9:00 PM",
            prescription_required=True,
            batch_number="TLM-4402",
            printed_expiry_date=d_safe1,
            purchase_date=(today - datetime.timedelta(days=10)).isoformat(),
            quantity=30,
            quantity_unit="tablets",
            stock_threshold=10,
            storage_instructions="Protect from heat and light.",
            notes="Hypertension maintenance; 1 tablet daily.",
            assigned_member_id=m_mother.id,
            passport_token=generate_passport_token(),
            data_source="MANUAL",
            is_confirmed=True,
            is_disposed=False,
        ),
        MedicineRecord(
            household_id=household.id,
            medicine_name="Levosalbutamol Inhaler",
            brand="Levolin Inhaler",
            strength="50mcg / puff",
            dosage_form="Inhaler",
            manufacturer="Cipla Ltd",
            category="Respiratory",
            prescription_required=True,
            batch_number="LV-3001",
            printed_expiry_date=d_safe2,
            purchase_date=(today - datetime.timedelta(days=45)).isoformat(),
            quantity=1,
            quantity_unit="canister",
            stock_threshold=3,
            storage_instructions="Store upright below 30°C. Do not puncture canister.",
            notes="Low stock warning: Only 1 inhaler left in cabinet.",
            assigned_member_id=m_child.id,
            passport_token=generate_passport_token(),
            data_source="BARCODE",
            is_confirmed=True,
            is_disposed=False,
        ),
        MedicineRecord(
            household_id=household.id,
            medicine_name="Pantoprazole Gastro-resistant Tablets",
            brand="Pan-40",
            strength="40mg",
            dosage_form="Tablet",
            manufacturer="Alkem Laboratories",
            category="Gastrointestinal",
            prescription_required=False,
            batch_number="PAN-109",
            printed_expiry_date=d_draft,
            purchase_date=today.isoformat(),
            quantity=10,
            quantity_unit="tablets",
            stock_threshold=5,
            storage_instructions="Store in dry place away from light.",
            notes="Camera OCR draft extracted; requires user verification of batch.",
            assigned_member_id=m_self.id,
            passport_token=generate_passport_token(),
            data_source="OCR",
            is_confirmed=False,
            is_disposed=False,
        ),
        MedicineRecord(
            household_id=household.id,
            medicine_name="Expired Dextromethorphan Cough Syrup",
            brand="Benadryl DR",
            strength="15mg / 5ml",
            dosage_form="Syrup",
            manufacturer="Johnson & Johnson",
            category="Cough Suppressant",
            prescription_required=False,
            batch_number="BD-0911",
            printed_expiry_date=d_disposed,
            purchase_date=(today - datetime.timedelta(days=200)).isoformat(),
            quantity=0,
            quantity_unit="bottle",
            stock_threshold=1,
            storage_instructions="Keep tightly capped.",
            notes="Safely surrendered at municipal pharmacy collection bin.",
            assigned_member_id=m_self.id,
            passport_token=generate_passport_token(),
            data_source="MANUAL",
            is_confirmed=True,
            is_disposed=True,
        ),
    ]

    db.add_all(meds)
    db.flush()

    for med in meds:
        evaluate_and_generate_notifications(db, med, reference_date=today)
        db.add(
            MedicineEventHistory(
                household_id=household.id,
                medicine_id=med.id,
                action="CREATED",
                timestamp=now_utc - datetime.timedelta(days=2),
                description=f"Record added via {med.data_source}",
                quantity_delta=med.quantity,
            )
        )

    disposed_med = meds[-1]
    db.add(
        DisposalRecord(
            household_id=household.id,
            medicine_id=disposed_med.id,
            member_id=m_self.id,
            disposed_date=(today - datetime.timedelta(days=2)).isoformat(),
            disposal_method="Community Pharmacy Take-Back Kiosk",
            quantity_disposed=1,
            reason="Expired",
            notes="Properly handed over to authorized medical waste bin.",
        )
    )
    db.add(
        MedicineEventHistory(
            household_id=household.id,
            medicine_id=disposed_med.id,
            action="DISPOSED",
            timestamp=now_utc - datetime.timedelta(days=2),
            description="Marked disposed: safely returned to pharmacy take-back",
            quantity_delta=-1,
        )
    )

    sched1 = MedicationSchedule(
        medicine_id=meds[3].id,
        member_id=m_mother.id,
        reminder_time="08:00 AM",
        frequency="Daily",
        days_of_week="Mon,Tue,Wed,Thu,Fri,Sat,Sun",
        dose_quantity=1,
        status="ACTIVE",
    )
    sched2 = MedicationSchedule(
        medicine_id=meds[5].id,
        member_id=m_mother.id,
        reminder_time="09:00 PM",
        frequency="Daily",
        days_of_week="Mon,Tue,Wed,Thu,Fri,Sat,Sun",
        dose_quantity=1,
        status="ACTIVE",
    )
    sched3 = MedicationSchedule(
        medicine_id=meds[6].id,
        member_id=m_child.id,
        reminder_time="08:30 PM",
        frequency="As Needed",
        days_of_week="Mon,Tue,Wed,Thu,Fri,Sat,Sun",
        dose_quantity=1,
        status="ACTIVE",
    )
    db.add_all([sched1, sched2, sched3])
    db.commit()

    # Attach caregiver permission + demo accounts cleanly
    ensure_demo_users_and_pharmacies(db)
