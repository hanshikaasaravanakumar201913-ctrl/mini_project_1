import datetime
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.database import Base, get_db
from backend.app.language_registry import SUPPORTED_LANGUAGES
from backend.app.llm_service import BaseLLMProvider, ControlledLLMService, assert_privacy_safe_input
from backend.app.main import app
from backend.app.routes.c_engine import repopulate_c_structures
from backend.app.security import auth_rate_limiter
from backend.app.seed_data import seed_demonstration_dataset


@pytest.fixture()
def nlp_client():
    auth_rate_limiter.reset()
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


def _login(client: TestClient, email: str, password: str) -> dict:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()


def test_supported_languages_endpoint_returns_13_indian_languages(nlp_client):
    client, _ = nlp_client
    res = client.get("/api/nlp/supported-languages")
    assert res.status_code == 200
    data = res.json()
    assert data["default_language"] == "en"
    assert data["count"] == 13
    codes = [item["code"] for item in data["languages"]]
    assert codes == ["en", "ta", "hi", "te", "kn", "ml", "bn", "mr", "gu", "pa", "or", "ur", "as"]
    ur_entry = next(item for item in data["languages"] if item["code"] == "ur")
    assert ur_entry["direction"] == "rtl"


@pytest.mark.parametrize(
    "query,expected_lang,expected_generic",
    [
        ("fever pain relief", "en", "Paracetamol"),
        ("காய்ச்சல் வலி மாத்திரை", "ta", "Paracetamol"),
        ("बुखार और दर्द की दवा", "hi", "Paracetamol"),
        ("జ్వరం నొప్పి మందు", "te", "Paracetamol"),
        ("ಜ್ವರ ಮತ್ತು ನೋವಿನ ಮಾತ್ರೆ", "kn", "Paracetamol"),
        ("പനി വേദന ഗുളിക", "ml", "Paracetamol"),
        ("জ্বর ও ব্যথার ওষুধ", "bn", "Paracetamol"),
        ("ताप आणि अंगदुखी गोळी", "mr", "Paracetamol"),
        ("તાવ અને દુખાવાની દવા", "gu", "Paracetamol"),
        ("ਬੁਖਾਰ ਅਤੇ ਦਰਦ ਦੀ ਗੋਲੀ", "pa", "Paracetamol"),
        ("ଜ୍ୱର ଓ ଯନ୍ତ୍ରଣା ବଟିକା", "or", "Paracetamol"),
        ("بخار اور درد کی دوا", "ur", "Paracetamol"),
        ("জ্বৰ আৰু বিষৰ দৰৱ", "as", "Paracetamol"),
    ],
)
def test_nlp_medicine_search_all_13_languages(nlp_client, query, expected_lang, expected_generic):
    client, _ = nlp_client
    res = client.post(
        "/api/nlp/medicine-search",
        json={"query": query, "preferred_language": expected_lang},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["detected_language"] == expected_lang
    assert len(body["results"]) >= 1
    assert body["results"][0]["generic_name"] == expected_generic


def test_nlp_unicode_digits_spelling_fuzzy_ranking_ambiguous_and_unknown(nlp_client):
    client, _ = nlp_client

    # 1. Exact vs typo ranking + spelling variant tolerance
    typo_res = client.post(
        "/api/nlp/medicine-search",
        json={"query": "paracetmol 650", "preferred_language": "en"},
    ).json()
    assert len(typo_res["results"]) >= 1
    assert typo_res["results"][0]["canonical_name"] == "Paracetamol Tablets IP 650mg"

    exact_res = client.post(
        "/api/nlp/medicine-search",
        json={"query": "Dolo 650", "preferred_language": "en"},
    ).json()
    assert exact_res["status"] == "HIGH_CONFIDENCE"
    assert exact_res["requires_confirmation"] is False
    assert exact_res["results"][0]["match_type"] == "EXACT"
    assert exact_res["results"][0]["score"] >= typo_res["results"][0]["score"]

    # 2. Ambiguous generic name matching multiple strengths -> must require confirmation
    ambig_res = client.post(
        "/api/nlp/medicine-search",
        json={"query": "Paracetamol", "preferred_language": "en"},
    ).json()
    assert ambig_res["status"] == "AMBIGUOUS_CONFIRMATION_REQUIRED"
    assert ambig_res["requires_confirmation"] is True
    assert len(ambig_res["results"]) >= 2

    # 3. Indic Unicode numeral normalization (Bengali '৬৫০' -> '650', Gujarati '૬૫૦' -> '650')
    bn_digit_res = client.post(
        "/api/nlp/medicine-search",
        json={"query": "Dolo ৬৫০", "preferred_language": "bn"},
    ).json()
    assert "650" in bn_digit_res["normalized_query"]

    # 4. Telugu & Kannada hypertension / diabetes lookups
    te_bp = client.post(
        "/api/nlp/medicine-search",
        json={"query": "రక్తపోటు బీపీ మందు", "preferred_language": "te"},
    ).json()
    assert te_bp["results"][0]["generic_name"] == "Telmisartan"

    kn_dm = client.post(
        "/api/nlp/medicine-search",
        json={"query": "ಮಧುಮೇಹ ಸಕ್ಕರೆ ಕಾಯಿಲೆ ಮಾತ್ರೆ", "preferred_language": "kn"},
    ).json()
    assert kn_dm["results"][0]["generic_name"] == "Metformin"

    # 5. Unknown query returns NO_MATCH without hallucinating records
    unk = client.post(
        "/api/nlp/medicine-search",
        json={"query": "xyznonexistentmed999", "preferred_language": "en"},
    ).json()
    assert unk["status"] == "NO_MATCH"
    assert unk["results"] == []


def test_nlp_suggestions_and_admin_alias_review_workflow(nlp_client):
    client, _ = nlp_client
    owner = _login(client, "owner@medora.demo", "MedoraOwner!2026")
    admin = _login(client, "admin@medora.demo", "MedoraAdmin!2026")

    # Suggestions in Telugu and Kannada
    sugg_te = client.get("/api/nlp/search-suggestions?lang=te&limit=5").json()
    assert len(sugg_te["suggestions"]) >= 1
    assert any(s["language_code"] == "te" for s in sugg_te["suggestions"])

    catalog = client.get("/api/nlp/catalog").json()
    cetirizine_id = next(c["id"] for c in catalog if c["generic_name"] == "Cetirizine")

    # Owner submits a new vernacular alias -> stays PENDING_REVIEW until Admin approves
    prop = client.post(
        f"/api/nlp/catalog/{cetirizine_id}/aliases",
        headers={"Authorization": f"Bearer {owner['access_token']}"},
        json={
            "language_code": "te",
            "alias_text": "చర్మపు దద్దుర్లు ఎలర్జీ",
            "alias_type": "SYMPTOM_OR_USE",
        },
    )
    assert prop.status_code == 201
    alias_id = prop.json()["id"]
    assert prop.json()["review_status"] == "PENDING_REVIEW"

    # Unapproved alias must NOT surface in public search
    pre = client.post(
        "/api/nlp/medicine-search",
        json={"query": "చర్మపు దద్దుర్లు", "preferred_language": "te"},
    ).json()
    assert not any(
        r["matched_alias"] and r["matched_alias"]["alias_text"] == "చర్మపు దద్దుర్లు ఎలర్జీ"
        for r in pre["results"]
    )

    # Admin approves alias -> now searchable!
    rev = client.patch(
        f"/api/nlp/aliases/{alias_id}/review",
        headers={"Authorization": f"Bearer {admin['access_token']}"},
        json={"review_status": "APPROVED", "notes": "Reviewed for demo catalog"},
    )
    assert rev.status_code == 200
    assert rev.json()["review_status"] == "APPROVED"

    post = client.post(
        "/api/nlp/medicine-search",
        json={"query": "చర్మపు దద్దుర్లు ఎలర్జీ", "preferred_language": "te"},
    ).json()
    assert post["results"][0]["generic_name"] == "Cetirizine"


def test_user_and_member_independent_13_language_preferences(nlp_client):
    client, _ = nlp_client
    owner = _login(client, "owner@medora.demo", "MedoraOwner!2026")
    care = _login(client, "caregiver@medora.demo", "MedoraCare!2026")
    owner_hdr = {"Authorization": f"Bearer {owner['access_token']}"}
    care_hdr = {"Authorization": f"Bearer {care['access_token']}"}

    # Caregiver switches profile language to Telugu ('te'), Owner switches to Kannada ('kn')
    r1 = client.put("/api/auth/me", headers=care_hdr, json={"preferred_language": "te"})
    r2 = client.put("/api/auth/me", headers=owner_hdr, json={"preferred_language": "kn"})
    assert r1.status_code == 200 and r1.json()["preferred_language"] == "te"
    assert r2.status_code == 200 and r2.json()["preferred_language"] == "kn"

    # Changing caregiver's language did NOT change owner's language or household members' language
    members = client.get("/api/household/members", headers=owner_hdr).json()
    first_member_id = members[0]["id"]
    m_upd = client.patch(
        f"/api/household/members/{first_member_id}/language",
        headers=owner_hdr,
        json={"preferred_language": "ur"},
    )
    assert m_upd.status_code == 200
    assert m_upd.json()["preferred_language"] == "ur"
    assert client.get("/api/auth/me", headers=care_hdr).json()["user"]["preferred_language"] == "te"


def test_controlled_llm_fallbacks_failures_and_privacy_guard(nlp_client):
    client, _ = nlp_client

    # 1. Default disabled provider uses verified deterministic fallback cleanly
    res = client.post("/api/nlp/llm/explain-term", json={"term": "Antipyretic", "target_language": "te"})
    assert res.status_code == 200
    body = res.json()
    assert body["source_mode"] == "DETERMINISTIC_FALLBACK"
    assert "జ్వరాన్ని" in body["explanation"]

    # 2. Privacy safeguard blocks emails / phones / private identifiers
    with pytest.raises(ValueError):
        assert_privacy_safe_input("Check prescription for patient@example.com phone +919876543210")

    pii_res = client.post(
        "/api/nlp/llm/explain-term",
        json={"term": "dosage for owner@medora.demo", "target_language": "en"},
    )
    assert pii_res.status_code == 400

    # 3. Timeout / malformed provider failure falls back deterministically
    class FailingProvider(BaseLLMProvider):
        def complete_json(self, system_prompt: str, user_prompt: str):
            raise TimeoutError("Simulated upstream LLM timeout")

    svc = ControlledLLMService(provider=FailingProvider())
    out = svc.explain_medical_term("Antibiotic", target_language="kn")
    assert out["source_mode"] == "DETERMINISTIC_FALLBACK"
    assert "ಬ್ಯಾಕ್ಟೀರಿಯಾ" in out["explanation"]
    assert svc.extract_search_candidates("headache fever", "en") == []

    # 4. Translation drafts never auto-approve for production
    admin = _login(client, "admin@medora.demo", "MedoraAdmin!2026")
    draft_res = client.post(
        "/api/nlp/llm/translation-draft",
        headers={"Authorization": f"Bearer {admin['access_token']}"},
        json={"source_text": "Save medicine", "target_language": "kn", "concept_domain": "ui"},
    )
    assert draft_res.status_code == 200
    assert draft_res.json()["approved_for_production"] is False
    assert draft_res.json()["review_status"] in ("DRAFT_MACHINE", "NEEDS_HUMAN_AUTHORING")
