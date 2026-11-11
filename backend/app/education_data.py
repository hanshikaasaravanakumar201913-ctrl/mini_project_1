from typing import List, Dict, Any

# Curated, documented pharmaceutical information catalog with reliable verified sources
MEDICINE_INFO_CATALOG: List[Dict[str, Any]] = [
    {
        "id": "info-paracetamol",
        "generic_name": "Paracetamol (Acetaminophen)",
        "common_brands": ["Dolo 650", "Calpol", "Crocin", "Tylenol"],
        "therapeutic_class": "Analgesic & Antipyretic",
        "general_purpose": "Relief of mild to moderate pain (headaches, muscular aches) and temporary reduction of fever.",
        "common_dosage_forms": ["Tablets (500mg, 650mg)", "Syrup (120mg/5ml, 250mg/5ml)", "Suppositories"],
        "storage_instructions": "Store below 25°C in a dry place. Protect from excessive moisture.",
        "key_warnings": "Do not exceed recommended maximum daily dose (4000mg in adults) to prevent severe liver toxicity. Avoid combining with other paracetamol-containing combination products.",
        "source": "WHO Model Formulary & Indian Pharmacopoeia (IP)",
        "last_verified": "2026-01-15"
    },
    {
        "id": "info-amoxicillin",
        "generic_name": "Amoxicillin / Clavulanic Acid",
        "common_brands": ["Augmentin", "Moxikind-CV", "Clavam"],
        "therapeutic_class": "Beta-Lactam Antibacterial",
        "general_purpose": "Treatment of bacterial infections including otitis media, sinusitis, lower respiratory tract infections, and skin infections.",
        "common_dosage_forms": ["Oral Tablets (625mg)", "Dry Syrup / Suspension (228.5mg/5ml)"],
        "storage_instructions": "Reconstituted liquid suspensions must be kept refrigerated (2°C - 8°C) and discarded after 7-10 days. Tablets stored below 25°C.",
        "key_warnings": "Contraindicated in individuals with penicillin allergy. Always complete full prescribed course even if symptoms resolve early.",
        "source": "British National Formulary (BNF) & National Health Portal of India",
        "last_verified": "2026-02-10"
    },
    {
        "id": "info-metformin",
        "generic_name": "Metformin Hydrochloride",
        "common_brands": ["Glycomet", "Glucophage", "Obimet"],
        "therapeutic_class": "Biguanide Antidiabetic",
        "general_purpose": "First-line management of Type 2 diabetes mellitus to improve glycemic control by reducing hepatic glucose production.",
        "common_dosage_forms": ["Immediate Release Tablets (500mg, 850mg)", "Extended Release SR (500mg, 1000mg)"],
        "storage_instructions": "Store between 20°C - 25°C in tightly closed light-resistant containers.",
        "key_warnings": "Risk of rare but serious lactic acidosis. Take with or immediately after meals to reduce gastrointestinal upset. Swallow prolonged-release tablets whole; do not crush.",
        "source": "American Diabetes Association (ADA) Guidelines & CDSCO India",
        "last_verified": "2026-03-01"
    },
    {
        "id": "info-telmisartan",
        "generic_name": "Telmisartan",
        "common_brands": ["Telma", "Micardis", "Telvas"],
        "therapeutic_class": "Angiotensin II Receptor Antagonist (ARB)",
        "general_purpose": "Treatment of essential hypertension and cardiovascular risk reduction in adults.",
        "common_dosage_forms": ["Tablets (20mg, 40mg, 80mg)"],
        "storage_instructions": "Store in the original blister package to protect from atmospheric moisture.",
        "key_warnings": "Contraindicated during pregnancy (teratogenic risk). Regular monitoring of serum potassium and renal function is advised.",
        "source": "European Society of Cardiology (ESC) & Indian Guidelines on Hypertension",
        "last_verified": "2026-01-20"
    },
    {
        "id": "info-cetirizine",
        "generic_name": "Cetirizine Hydrochloride",
        "common_brands": ["Alerid", "Zyrtec", "Cetzine"],
        "therapeutic_class": "Second-Generation Antihistamine",
        "general_purpose": "Symptomatic relief of allergic rhinitis (sneezing, runny nose, itchy watery eyes) and chronic idiopathic urticaria.",
        "common_dosage_forms": ["Tablets (5mg, 10mg)", "Oral Solution (5mg/5ml)"],
        "storage_instructions": "Store below 30°C in dry conditions.",
        "key_warnings": "May cause mild drowsiness in sensitive individuals; exercise caution when operating motor vehicles or machinery.",
        "source": "WHO Essential Medicines List",
        "last_verified": "2026-02-18"
    },
    {
        "id": "info-salbutamol",
        "generic_name": "Salbutamol / Levosalbutamol",
        "common_brands": ["Asthalin", "Ventolin", "Levolin"],
        "therapeutic_class": "Short-Acting Beta-2 Agonist (SABA) Bronchodilator",
        "general_purpose": "Rapid relief of bronchospasm in acute asthma exacerbations, COPD, and exercise-induced bronchoconstriction.",
        "common_dosage_forms": ["Metered Dose Inhaler (100mcg/puff, 50mcg/puff)", "Nebulizer Solution", "Rotacaps"],
        "storage_instructions": "Store pressurized canister away from heat, open flames, and direct sunlight. Do not freeze.",
        "key_warnings": "Intended as quick-relief rescue therapy. Needing an inhaler more than twice weekly indicates uncontrolled asthma requiring physician evaluation for controller therapy.",
        "source": "Global Initiative for Asthma (GINA 2025/2026)",
        "last_verified": "2026-03-12"
    }
]

# Educational symptom guidance with red-flag emergency warnings
SYMPTOM_GUIDANCE_CATALOG = [
    {
        "symptom": "Fever & Body Aches",
        "general_overview": "Fever is often the body's natural immunological response to viral or bacterial infections.",
        "safe_self_care": [
            "Ensure adequate hydration with water, oral rehydration solutions, or clear broths.",
            "Rest in a comfortably ventilated room.",
            "Wear light, breathable clothing and avoid excessive blankets.",
            "Consult existing physician advice regarding antipyretics like paracetamol if fever causes distress."
        ],
        "red_flag_emergencies": [
            "High fever persisting beyond 3 consecutive days.",
            "Stiff neck, photophobia (extreme sensitivity to light), or sudden confusion.",
            "Difficulty breathing, chest pain, or bluish lips/nails.",
            "Persistent vomiting preventing fluid retention.",
            "In infants under 3 months, any rectal temperature over 38°C (100.4°F) requires immediate emergency evaluation."
        ],
        "disclaimer": "This guidance is strictly educational and does not constitute medical diagnosis or prescription. Always consult a licensed healthcare professional."
    },
    {
        "symptom": "Acute Cough & Cold",
        "general_overview": "Most acute coughs are caused by self-limiting upper respiratory viral infections.",
        "safe_self_care": [
            "Steam inhalation or warm saline gargles to soothe irritated throat mucosa.",
            "Stay well hydrated to help thin mucus secretions.",
            "Honey (only for adults and children older than 1 year) can help suppress nighttime coughing.",
            "Use a saline nasal spray for nasal congestion."
        ],
        "red_flag_emergencies": [
            "Shortness of breath, wheezing, or stridor (high-pitched breathing sound).",
            "Coughing up blood (hemoptysis) or rust-colored sputum.",
            "Severe sharp chest pain that worsens with deep breathing.",
            "Symptoms worsening significantly after temporary improvement."
        ],
        "disclaimer": "This guidance is strictly educational and does not constitute medical diagnosis or prescription. Always consult a licensed healthcare professional."
    },
    {
        "symptom": "Mild Headache",
        "general_overview": "Tension headaches and dehydration-related headaches are the most frequent causes of mild cranial discomfort.",
        "safe_self_care": [
            "Drink 1-2 glasses of water immediately, as mild dehydration is a frequent trigger.",
            "Rest in a quiet, darkened room away from digital screens.",
            "Apply a cool or warm compress to forehead or temples."
        ],
        "red_flag_emergencies": [
            "Sudden, explosive 'thunderclap' headache reaching maximum intensity in seconds.",
            "Headache following head trauma or concussive injury.",
            "Headache accompanied by slurred speech, facial drooping, or one-sided weakness (Signs of stroke: Act F.A.S.T.).",
            "Headache with sudden vision loss or double vision."
        ],
        "disclaimer": "This guidance is strictly educational and does not constitute medical diagnosis or prescription. Always consult a licensed healthcare professional."
    }
]

# Responsible disposal protocols
DISPOSAL_GUIDANCE_INFO = {
    "principles": [
        {
            "title": "Never Judge by Appearance",
            "description": "Expired medicines may degrade into inactive or toxic subcomponents even if the pill, capsule, or syrup appears unaltered in color and smell."
        },
        {
            "title": "Zero Sharing Policy",
            "description": "Never donate, resell, or share leftover prescription medications with family or friends. A dose safe for one person can be lethal to another."
        },
        {
            "title": "Pharmacy Take-Back Kiosks",
            "description": "The safest method of disposal is surrendering unneeded medicines to certified municipal pharmacy take-back drop boxes for high-temperature incineration."
        },
        {
            "title": "Household Trash Safeguards",
            "description": "If take-back is unavailable: mix solid tablets/capsules with undesirable matter (used coffee grounds, cat litter, wet dirt), seal in a non-leaking container, and discard in domestic trash. Do NOT crush tablets."
        },
        {
            "title": "Do Not Flush",
            "description": "Never pour antibiotics, hormones, or chemical agents down domestic sinks or toilets, as municipal wastewater systems cannot neutralize active pharmaceutical ingredients, contaminating water tables."
        }
    ]
}
