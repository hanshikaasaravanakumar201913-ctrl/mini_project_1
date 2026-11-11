import { HouseholdMember, MedicineRecord, ExpiryNotification, MedicationSchedule, DisposalRecord, MedicineEventHistory } from '../types';
import { calculateDaysUntilExpiry, getExpiryStatus } from './dateUtils';

function offsetDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function getInitialDemonstrationData() {
  const members: HouseholdMember[] = [
    {
      id: 1,
      household_id: 1,
      name: "Karthik Raman",
      relationship_role: "Self",
      age: 34,
      allergies: "None known",
      notes: "Primary account holder & caregiver"
    },
    {
      id: 2,
      household_id: 1,
      name: "Lakshmi Raman",
      relationship_role: "Mother",
      age: 68,
      allergies: "Sulfa antibiotics",
      notes: "Hypertension and Type 2 Diabetes; daily morning and evening schedule"
    },
    {
      id: 3,
      household_id: 1,
      name: "Aarav Raman",
      relationship_role: "Child",
      age: 8,
      allergies: "Peanuts (mild)",
      notes: "Pediatric dosing only; mild seasonal asthma"
    }
  ];

  const rawMeds: Omit<MedicineRecord, 'days_until_expiry' | 'expiry_status'>[] = [
    {
      id: 1,
      medicine_name: "Amoxicillin Oral Suspension",
      brand: "Moxikind-CV",
      strength: "228.5mg / 5ml",
      dosage_form: "Syrup",
      batch_number: "MX2024-09",
      printed_expiry_date: offsetDate(-4), // Already expired (-4 days)
      purchase_date: offsetDate(-40),
      opened_date: offsetDate(-20),
      quantity: 1,
      stock_threshold: 2,
      storage_instructions: "Store refrigerated between 2°C - 8°C. Do not freeze.",
      notes: "Previous course syrup now expired. Follow disposal protocol.",
      assigned_member_id: 3,
      data_source: "MANUAL",
      is_confirmed: true,
      is_disposed: false,
      created_at: offsetDate(-2)
    },
    {
      id: 2,
      medicine_name: "Cetirizine Hydrochloride",
      brand: "Alerid",
      strength: "10mg",
      dosage_form: "Tablet",
      batch_number: "CTZ-2601",
      printed_expiry_date: offsetDate(1), // 1-day critical
      purchase_date: offsetDate(-60),
      quantity: 6,
      stock_threshold: 5,
      storage_instructions: "Store below 30°C in original blister pack.",
      notes: "Allergy relief. Immediate replacement required.",
      assigned_member_id: 3,
      data_source: "OCR",
      is_confirmed: true,
      is_disposed: false,
      created_at: offsetDate(-1)
    },
    {
      id: 3,
      medicine_name: "Azithromycin Tablets IP",
      brand: "Azithral 500",
      strength: "500mg",
      dosage_form: "Tablet",
      batch_number: "AZ-9088",
      printed_expiry_date: offsetDate(3), // 3-day urgent
      purchase_date: offsetDate(-20),
      quantity: 3,
      stock_threshold: 3,
      storage_instructions: "Store protected from moisture and light.",
      notes: "Short course antibiotic for respiratory symptoms.",
      assigned_member_id: 1,
      data_source: "MANUAL",
      is_confirmed: true,
      is_disposed: false,
      created_at: offsetDate(-3)
    },
    {
      id: 4,
      medicine_name: "Metformin Hydrochloride PR",
      brand: "Glycomet-SR",
      strength: "500mg",
      dosage_form: "Tablet",
      batch_number: "GLY-552",
      printed_expiry_date: offsetDate(5), // 5-day approaching
      purchase_date: offsetDate(-80),
      quantity: 14,
      stock_threshold: 10,
      storage_instructions: "Store below 25°C in dry conditions.",
      notes: "Daily diabetic maintenance. Plan refill this week.",
      assigned_member_id: 2,
      data_source: "OCR",
      is_confirmed: true,
      is_disposed: false,
      created_at: offsetDate(-5)
    },
    {
      id: 5,
      medicine_name: "Paracetamol Tablets IP",
      brand: "Dolo 650",
      strength: "650mg",
      dosage_form: "Tablet",
      batch_number: "DL-8812",
      printed_expiry_date: offsetDate(10), // 10-day notice
      purchase_date: offsetDate(-100),
      quantity: 15,
      stock_threshold: 8,
      storage_instructions: "Store in cool, dry place away from children.",
      notes: "General household fever and pain relief.",
      assigned_member_id: 1,
      data_source: "BARCODE",
      is_confirmed: true,
      is_disposed: false,
      created_at: offsetDate(-10)
    },
    {
      id: 6,
      medicine_name: "Telmisartan Tablets IP",
      brand: "Telma 40",
      strength: "40mg",
      dosage_form: "Tablet",
      batch_number: "TLM-4402",
      printed_expiry_date: offsetDate(120), // Safe inventory
      purchase_date: offsetDate(-10),
      quantity: 30,
      stock_threshold: 10,
      storage_instructions: "Keep in original strip pack below 25°C.",
      notes: "Blood pressure maintenance; 1 tablet morning daily.",
      assigned_member_id: 2,
      data_source: "MANUAL",
      is_confirmed: true,
      is_disposed: false,
      created_at: offsetDate(-1)
    },
    {
      id: 7,
      medicine_name: "Levosalbutamol Inhaler",
      brand: "Levolin Inhaler",
      strength: "50mcg / puff",
      dosage_form: "Inhaler",
      batch_number: "LV-3001",
      printed_expiry_date: offsetDate(180), // Low stock (1 remaining vs threshold 3)
      purchase_date: offsetDate(-30),
      quantity: 1,
      stock_threshold: 3,
      storage_instructions: "Store pressurized canister upright below 30°C.",
      notes: "Low stock alert: Only 1 unit left in cabinet.",
      assigned_member_id: 3,
      data_source: "BARCODE",
      is_confirmed: true,
      is_disposed: false,
      created_at: offsetDate(-2)
    },
    {
      id: 8,
      medicine_name: "Pantoprazole Gastro-resistant Tablets",
      brand: "Pan-40",
      strength: "40mg",
      dosage_form: "Tablet",
      batch_number: "PAN-109",
      printed_expiry_date: offsetDate(60), // Unconfirmed OCR draft
      purchase_date: offsetDate(0),
      quantity: 10,
      stock_threshold: 5,
      storage_instructions: "Store in dry place protected from light.",
      notes: "Extracted from camera packaging photo; pending user verification.",
      assigned_member_id: 1,
      data_source: "OCR",
      is_confirmed: false,
      is_disposed: false,
      created_at: offsetDate(0)
    }
  ];

  const medicines: MedicineRecord[] = rawMeds.map(m => {
    const days = calculateDaysUntilExpiry(m.printed_expiry_date);
    const member = members.find(mem => mem.id === m.assigned_member_id);
    return {
      ...m,
      days_until_expiry: days,
      expiry_status: getExpiryStatus(days),
      assigned_member: member
    };
  });

  const notifications: ExpiryNotification[] = [
    {
      id: 1,
      medicine_id: 1,
      threshold_days: 0,
      message: `EXPIRED: 'Amoxicillin Oral Suspension' expired 4 days ago (${offsetDate(-4)}). Do not use. Follow disposal guidance.`,
      is_read: false,
      triggered_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      medicine_name: "Amoxicillin Oral Suspension"
    },
    {
      id: 2,
      medicine_id: 2,
      threshold_days: 1,
      message: `CRITICAL ALERT: 'Cetirizine Hydrochloride' expires tomorrow (${offsetDate(1)}). Prepare replacement.`,
      is_read: false,
      triggered_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      medicine_name: "Cetirizine Hydrochloride"
    },
    {
      id: 3,
      medicine_id: 3,
      threshold_days: 3,
      message: `URGENT: 'Azithromycin Tablets IP' expires in 3 days (${offsetDate(3)}). Review course.`,
      is_read: false,
      triggered_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
      medicine_name: "Azithromycin Tablets IP"
    },
    {
      id: 4,
      medicine_id: 4,
      threshold_days: 5,
      message: `APPROACHING: 'Metformin Hydrochloride PR' expires in 5 days (${offsetDate(5)}). Plan physician refill.`,
      is_read: true,
      triggered_at: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
      medicine_name: "Metformin Hydrochloride PR"
    },
    {
      id: 5,
      medicine_id: 5,
      threshold_days: 10,
      message: `NOTICE: 'Paracetamol Tablets IP' expires in 10 days (${offsetDate(10)}).`,
      is_read: true,
      triggered_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
      medicine_name: "Paracetamol Tablets IP"
    }
  ];

  const schedules: MedicationSchedule[] = [
    {
      id: 1,
      medicine_id: 4,
      member_id: 2,
      reminder_time: "08:00 AM",
      frequency: "Daily",
      days_of_week: "Mon,Tue,Wed,Thu,Fri,Sat,Sun",
      dose_quantity: 1,
      status: "ACTIVE",
      medicine_name: "Metformin Hydrochloride PR",
      estimated_depletion_date: offsetDate(14)
    },
    {
      id: 2,
      medicine_id: 6,
      member_id: 2,
      reminder_time: "09:00 PM",
      frequency: "Daily",
      days_of_week: "Mon,Tue,Wed,Thu,Fri,Sat,Sun",
      dose_quantity: 1,
      status: "ACTIVE",
      medicine_name: "Telmisartan Tablets IP",
      estimated_depletion_date: offsetDate(30)
    },
    {
      id: 3,
      medicine_id: 7,
      member_id: 3,
      reminder_time: "08:30 PM",
      frequency: "As Needed",
      days_of_week: "Mon,Tue,Wed,Thu,Fri,Sat,Sun",
      dose_quantity: 1,
      status: "ACTIVE",
      medicine_name: "Levosalbutamol Inhaler",
      estimated_depletion_date: offsetDate(10)
    }
  ];

  const disposalRecords: DisposalRecord[] = [
    {
      id: 1,
      medicine_id: 99,
      member_id: 1,
      disposed_date: offsetDate(-14),
      disposal_method: "Community Pharmacy Take-Back Kiosk",
      notes: "Expired dry cough syrup returned for hazardous medical waste incineration.",
      created_at: offsetDate(-14),
      medicine_name: "Expired Dextromethorphan Cough Syrup"
    }
  ];

  const eventHistory: MedicineEventHistory[] = [
    {
      id: 1,
      medicine_id: 2,
      action: "OCR_SCANNED",
      description: "Extracted draft via camera scan; verified by user.",
      timestamp: offsetDate(-1),
      quantity_delta: 6
    },
    {
      id: 2,
      medicine_id: 4,
      action: "DOSE_TAKEN",
      description: "Morning dose logged by Lakshmi Raman. 1 unit taken.",
      timestamp: offsetDate(0),
      quantity_delta: -1
    },
    {
      id: 3,
      medicine_id: 5,
      action: "BARCODE_SCANNED",
      description: "Scanned EAN barcode 8901030000012; confirmed Dolo 650.",
      timestamp: offsetDate(-10),
      quantity_delta: 15
    }
  ];

  return {
    members,
    medicines,
    notifications,
    schedules,
    disposalRecords,
    eventHistory
  };
}
