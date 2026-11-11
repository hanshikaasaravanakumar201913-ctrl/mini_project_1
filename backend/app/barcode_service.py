import datetime
from typing import Optional, Dict, Any

class BarcodeService:
    """
    Barcode Lookup Service.
    Resolves GS1/EAN-13/UPC barcodes to master drug catalog entries.
    CRITICAL SAFETY RULE: Barcodes DO NOT encode printed expiry dates;
    expiry must be entered or scanned from packaging.
    """

    CATALOG = {
        "8901030000012": {
            "name": "Paracetamol Tablets IP",
            "brand": "Dolo 650",
            "strength": "650mg",
            "dosage_form": "Tablet",
            "manufacturer": "Micro Labs Ltd",
            "description": "Antipyretic and analgesic for pain and fever relief."
        },
        "8901117000025": {
            "name": "Amoxicillin and Potassium Clavulanate",
            "brand": "Moxikind-CV 625",
            "strength": "625mg",
            "dosage_form": "Tablet",
            "manufacturer": "Mankind Pharma",
            "description": "Broad-spectrum antibacterial medication."
        },
        "8901234000031": {
            "name": "Telmisartan Tablets IP",
            "brand": "Telma 40",
            "strength": "40mg",
            "dosage_form": "Tablet",
            "manufacturer": "Glenmark Pharmaceuticals",
            "description": "Angiotensin II receptor blocker for hypertension."
        },
        "8901456000048": {
            "name": "Cetirizine Hydrochloride",
            "brand": "Alerid",
            "strength": "10mg",
            "dosage_form": "Tablet",
            "manufacturer": "Cipla Ltd",
            "description": "Antihistamine for allergic rhinitis and urticaria."
        },
        "8901678000055": {
            "name": "Metformin Hydrochloride Prolonged-Release",
            "brand": "Glycomet-SR 500",
            "strength": "500mg",
            "dosage_form": "Tablet",
            "manufacturer": "USV Pvt Ltd",
            "description": "Biguanide oral antihyperglycemic agent for Type 2 diabetes."
        },
        "8901890000062": {
            "name": "Levosalbutamol Inhaler",
            "brand": "Levolin Inhaler",
            "strength": "50mcg / puff",
            "dosage_form": "Inhaler",
            "manufacturer": "Cipla Ltd",
            "description": "Short-acting beta2-agonist bronchodilator for airway constriction."
        }
    }

    @classmethod
    def lookup_barcode(cls, barcode: str) -> Dict[str, Any]:
        clean_code = barcode.strip().replace(" ", "").replace("-", "")
        item = cls.CATALOG.get(clean_code)

        if item:
            return {
                "found": True,
                "barcode": clean_code,
                "medicine_name": item["name"],
                "brand": item["brand"],
                "strength": item["strength"],
                "dosage_form": item["dosage_form"],
                "manufacturer": item["manufacturer"],
                "description": item["description"],
                "data_source": "BARCODE",
                "is_confirmed": False, # Requires user confirmation of batch & printed expiry!
                "safety_notice": "Barcode identifies product catalog details only. You must verify and enter the printed expiry date and batch number from the physical box."
            }
        else:
            return {
                "found": False,
                "barcode": clean_code,
                "error": f"Barcode {clean_code} not found in verified pharmaceutical catalog.",
                "suggestion": "Please enter medicine details manually or scan packaging with OCR camera."
            }

barcode_service = BarcodeService()
