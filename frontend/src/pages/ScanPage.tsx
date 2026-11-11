import React, { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useMedicine } from '../context/MedicineContext';
import { AuthGate } from '../components/AuthGate';
import { DataSource } from '../types';
import {
  Camera, Barcode, ShieldCheck, CheckCircle, RefreshCw, Clock, FileText
} from 'lucide-react';

const OFFLINE_BARCODE_CATALOG: Record<string, {
  medicine_name: string;
  brand: string;
  strength: string;
  dosage_form: string;
  manufacturer: string;
  description: string;
}> = {
  '8901030000012': {
    medicine_name: 'Paracetamol Tablets IP',
    brand: 'Dolo 650',
    strength: '650mg',
    dosage_form: 'Tablet',
    manufacturer: 'Micro Labs Ltd',
    description: 'Antipyretic and analgesic for pain and fever relief.'
  },
  '8901117000025': {
    medicine_name: 'Amoxicillin and Potassium Clavulanate',
    brand: 'Moxikind-CV 625',
    strength: '625mg',
    dosage_form: 'Tablet',
    manufacturer: 'Mankind Pharma',
    description: 'Broad-spectrum antibacterial medication.'
  },
  '8901234000031': {
    medicine_name: 'Telmisartan Tablets IP',
    brand: 'Telma 40',
    strength: '40mg',
    dosage_form: 'Tablet',
    manufacturer: 'Glenmark Pharmaceuticals',
    description: 'Angiotensin II receptor blocker for hypertension.'
  },
  '8901456000048': {
    medicine_name: 'Cetirizine Hydrochloride',
    brand: 'Alerid',
    strength: '10mg',
    dosage_form: 'Tablet',
    manufacturer: 'Cipla Ltd',
    description: 'Antihistamine for allergic rhinitis and urticaria.'
  },
  '8901678000055': {
    medicine_name: 'Metformin Hydrochloride Prolonged-Release',
    brand: 'Glycomet-SR 500',
    strength: '500mg',
    dosage_form: 'Tablet',
    manufacturer: 'USV Pvt Ltd',
    description: 'Biguanide oral antihyperglycemic agent for Type 2 diabetes.'
  },
  '8901890000062': {
    medicine_name: 'Levosalbutamol Inhaler',
    brand: 'Levolin Inhaler',
    strength: '50mcg / puff',
    dosage_form: 'Inhaler',
    manufacturer: 'Cipla Ltd',
    description: 'Short-acting beta2-agonist bronchodilator.'
  }
};

export const ScanPage: React.FC = () => {
  const { t } = useLanguage();
  const { permissions, addMedicine, members, setActiveTab, isApiConnected } = useMedicine();

  const [activeScanMode, setActiveScanMode] = useState<'ocr' | 'barcode'>('ocr');
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [ocrRawText, setOcrRawText] = useState('');
  const [confidenceScore, setConfidenceScore] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [draftData, setDraftData] = useState({
    medicine_name: '',
    brand: '',
    strength: '',
    dosage_form: 'Tablet',
    batch_number: '',
    printed_expiry_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString().split('T')[0],
    quantity: 10,
    stock_threshold: 5,
    storage_instructions: 'Store in cool, dry place below 25°C away from direct sunlight.',
    notes: '',
    assigned_member_id: members[0]?.id || 1,
    data_source: 'OCR' as DataSource,
    is_confirmed: false
  });

  const [barcodeInput, setBarcodeInput] = useState('8901030000012');
  const [barcodeLookupResult, setBarcodeLookupResult] = useState<string | null>(null);

  const samplePackages = [
    {
      label: 'Dolo 650 (Paracetamol)',
      filename: 'dolo650_strip.jpg',
      rawText: `Dolo 650 Paracetamol Tablets IP 650mg\nBatch No: DL-8812\nEXP: ${(() => { const d = new Date(); d.setDate(d.getDate() + 10); return d.toISOString().split('T')[0]; })()}`,
      expiryOffset: 10
    },
    {
      label: 'Cetirizine 10mg (Alerid)',
      filename: 'alerid_10mg.jpg',
      rawText: `Alerid Cetirizine Hydrochloride 10mg Tablet\nB.No: CTZ-2601\nEXP: ${(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })()}`,
      expiryOffset: 1
    },
    {
      label: 'Amoxicillin Suspension (Expired)',
      filename: 'moxikind_syrup.jpg',
      rawText: `Moxikind-CV Amoxicillin 228.5mg / 5ml Syrup\nBatch: MX2024-09\nEXP: ${(() => { const d = new Date(); d.setDate(d.getDate() - 4); return d.toISOString().split('T')[0]; })()}`,
      expiryOffset: -4
    }
  ];

  const runOcrExtraction = async (rawText: string, filename: string) => {
    setIsProcessing(true);
    setStatusMessage(null);

    if (isApiConnected) {
      try {
        const res = await fetch('/api/education/ocr/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw_text: rawText, filename })
        });
        if (res.ok) {
          const parsed = await res.json();
          setDraftData({
            medicine_name: parsed.medicine_name || '',
            brand: parsed.brand || '',
            strength: parsed.strength || '',
            dosage_form: parsed.dosage_form || 'Tablet',
            batch_number: parsed.batch_number || '',
            printed_expiry_date: parsed.printed_expiry_date,
            quantity: parsed.quantity ?? 10,
            stock_threshold: parsed.stock_threshold ?? 5,
            storage_instructions: 'Store in a cool, dry place below 25°C away from moisture.',
            notes: `OCR draft parsed via backend service (confidence ${Math.round((parsed.confidence_score || 0.8) * 100)}%). Verify before confirming.`,
            assigned_member_id: members[0]?.id || 1,
            data_source: 'OCR',
            is_confirmed: false
          });
          setOcrRawText(parsed.raw_text_extracted || rawText);
          setConfidenceScore(parsed.confidence_score ?? 0.85);
          setHasScanned(true);
          setIsProcessing(false);
          return;
        }
      } catch {
        // Fall back to offline extraction
      }
    }

    // Offline fallback parser
    const expMatch = rawText.match(/(\d{4}-\d{2}-\d{2})/);
    const batchMatch = rawText.match(/\b(?:Batch(?:\s*(?:No\.?|#))?|B\.?\s*(?:No\.?|#)|B\/No|Lot(?:\s*(?:No\.?|#))?)[\s.:-]*([A-Z0-9-]+)/i);
    const strengthMatch = rawText.match(/(\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g|IU)(?:\s*\/\s*\d*\s*ml)?)/i);
    const firstLine = rawText.split('\n')[0]?.trim() || filename.replace(/\.[^.]+$/, '') || 'Detected Medicine Draft';
    const fallbackExp = expMatch
      ? expMatch[1]
      : new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString().split('T')[0];

    setDraftData({
      medicine_name: firstLine,
      brand: firstLine.split(' ')[0] || '',
      strength: strengthMatch ? strengthMatch[1] : 'Unspecified',
      dosage_form: /syrup|suspension/i.test(rawText) ? 'Syrup' : /inhaler/i.test(rawText) ? 'Inhaler' : 'Tablet',
      batch_number: batchMatch ? batchMatch[1] : `BATCH-${String(new Date().getFullYear()).slice(-2)}01`,
      printed_expiry_date: fallbackExp,
      quantity: 10,
      stock_threshold: 5,
      storage_instructions: 'Store in a cool, dry place away from moisture.',
      notes: 'Offline OCR draft extracted. Verify against physical packaging before confirming.',
      assigned_member_id: members[0]?.id || 1,
      data_source: 'OCR',
      is_confirmed: false
    });
    setConfidenceScore(0.75);
    setHasScanned(true);
    setIsProcessing(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const textHint = ocrRawText.trim();

    if (isApiConnected) {
      setIsProcessing(true);
      setStatusMessage(null);
      try {
        const formData = new FormData();
        formData.append('file', file);
        if (textHint) {
          formData.append('raw_text', textHint);
        }
        const res = await fetch('/api/education/ocr/upload', {
          method: 'POST',
          body: formData
        });
        if (res.ok) {
          const parsed = await res.json();
          const imgMeta = parsed.image_metadata ? `Image: ${parsed.image_metadata}. ` : '';
          const modeLabel = parsed.ocr_adapter_mode === 'TESSERACT_OCR'
            ? 'Tesseract OCR'
            : 'Development Regex/Catalog Adapter';
          setDraftData({
            medicine_name: parsed.medicine_name || '',
            brand: parsed.brand || '',
            strength: parsed.strength || '',
            dosage_form: parsed.dosage_form || 'Tablet',
            batch_number: parsed.batch_number || '',
            printed_expiry_date: parsed.printed_expiry_date,
            quantity: parsed.quantity ?? 10,
            stock_threshold: parsed.stock_threshold ?? 5,
            storage_instructions: 'Store in a cool, dry place below 25°C away from moisture.',
            notes: `${imgMeta}Parsed via ${modeLabel} (confidence ${Math.round((parsed.confidence_score || 0.78) * 100)}%). Verify before confirming.`,
            assigned_member_id: members[0]?.id || 1,
            data_source: 'OCR',
            is_confirmed: false
          });
          setOcrRawText(parsed.raw_text_extracted || textHint);
          setConfidenceScore(parsed.confidence_score ?? 0.78);
          setStatusMessage(`${imgMeta}Processed "${file.name}" using ${modeLabel}. Confirm extracted fields carefully.`);
          setHasScanned(true);
          setIsProcessing(false);
          return;
        }
      } catch {
        // Fall through to text/offline extraction
      }
      setIsProcessing(false);
    }

    runOcrExtraction(textHint, file.name);
  };

  const handleBarcodeLookup = async () => {
    const cleanCode = barcodeInput.trim().replace(/[\s-]/g, '');
    if (!cleanCode) return;

    setIsProcessing(true);
    setBarcodeLookupResult(null);

    if (isApiConnected) {
      try {
        const res = await fetch(`/api/education/barcode/${encodeURIComponent(cleanCode)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.found) {
            setDraftData((prev) => ({
              ...prev,
              medicine_name: data.medicine_name,
              brand: data.brand,
              strength: data.strength,
              dosage_form: data.dosage_form,
              batch_number: prev.batch_number || 'VERIFY-BATCH',
              storage_instructions: 'Store below 25°C in original packaging.',
              notes: `${data.manufacturer} — ${data.description} (${data.safety_notice})`,
              data_source: 'BARCODE',
              is_confirmed: false
            }));
            setBarcodeLookupResult(`Catalog match (${data.manufacturer}): ${data.brand} — ${data.safety_notice}`);
          } else {
            setDraftData((prev) => ({
              ...prev,
              batch_number: prev.batch_number || 'BARCODE-' + cleanCode.slice(-4),
              data_source: 'BARCODE',
              is_confirmed: false
            }));
            setBarcodeLookupResult(data.error || 'Barcode not in catalog. Enter details manually in the review draft.');
          }
          setHasScanned(true);
          setIsProcessing(false);
          return;
        }
      } catch {
        // Offline catalog fallback
      }
    }

    const match = OFFLINE_BARCODE_CATALOG[cleanCode];
    if (match) {
      setDraftData((prev) => ({
        ...prev,
        medicine_name: match.medicine_name,
        brand: match.brand,
        strength: match.strength,
        dosage_form: match.dosage_form,
        notes: `${match.manufacturer} — ${match.description} (Offline catalog match; verify printed expiry & batch.)`,
        data_source: 'BARCODE',
        is_confirmed: false
      }));
      setBarcodeLookupResult(`Offline catalog match: ${match.brand} (${match.manufacturer}). Verify printed expiry date and batch number before saving.`);
    } else {
      setDraftData((prev) => ({
        ...prev,
        batch_number: 'BARCODE-' + cleanCode.slice(-4),
        data_source: 'BARCODE',
        is_confirmed: false
      }));
      setBarcodeLookupResult('Barcode not in offline catalog. Enter details manually in the draft review form.');
    }
    setHasScanned(true);
    setIsProcessing(false);
  };

  const canEdit = !isApiConnected || permissions?.can_edit_medicines !== false;

  const handleSaveRecord = async (confirmed: boolean) => {
    if (!canEdit) {
      setStatusMessage('Permission denied: medicine edit permission is required to save records.');
      return;
    }
    if (!draftData.medicine_name.trim() || !draftData.printed_expiry_date) {
      setStatusMessage('Medicine name and printed expiry date are required.');
      return;
    }
    await addMedicine({
      ...draftData,
      is_confirmed: confirmed
    });
    setStatusMessage(
      confirmed
        ? 'Verified record saved to your medicine cabinet.'
        : 'Saved as an unconfirmed draft for later verification.'
    );
    setActiveTab('cabinet');
  };

  return (
    <AuthGate title={t('scan.title')}>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="border-b border-line pb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink font-display">
          {t('scan.title')}
        </h1>
        <p className="text-xs sm:text-sm text-ink-muted mt-1">
          {t('scan.subtitle')}
        </p>
      </div>

      <div className="p-4 medora-card border-brand/50 text-xs text-ink flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-brand-ink shrink-0 mt-0.5" />
        <div>
          {t('scan.protocol_warning')}
        </div>
      </div>

      <div className="flex gap-2 border-b border-line">
        <button
          type="button"
          onClick={() => setActiveScanMode('ocr')}
          className={`px-5 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeScanMode === 'ocr'
              ? 'border-brand text-brand-ink bg-surface/60'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <Camera className="w-4 h-4" />
          <span>{t('scan.ocr_tab')}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveScanMode('barcode')}
          className={`px-5 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeScanMode === 'barcode'
              ? 'border-brand text-brand-ink bg-surface/60'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <Barcode className="w-4 h-4" />
          <span>{t('scan.barcode_tab')}</span>
        </button>
      </div>

      {activeScanMode === 'ocr' ? (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          <div className="md:col-span-5 p-6 medora-card space-y-4">
            <h3 className="text-sm font-bold text-ink">Capture Packaging or Paste Label Text</h3>

            <div className="border-2 border-dashed border-brand/50 rounded-2xl p-6 text-center space-y-3 bg-field">
              <div className="w-12 h-12 rounded-full bg-surface-alt border border-line text-brand-ink flex items-center justify-center mx-auto">
                <Camera className="w-6 h-6" />
              </div>
              <div className="text-xs text-ink-muted">
                <span className="font-semibold text-brand-ink">Upload packaging photo</span> or capture with camera.
              </div>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileUpload}
                className="hidden"
                id="cameraInput"
              />
              <label
                htmlFor="cameraInput"
                className="medora-btn-primary cursor-pointer"
              >
                {t('scan.capture_btn')}
              </label>
            </div>

            <div className="space-y-2 text-xs">
              <label className="block font-semibold text-ink">
                Packaging Text Input (Optional / OCR Preview):
              </label>
              <textarea
                rows={3}
                value={ocrRawText}
                onChange={(e) => setOcrRawText(e.target.value)}
                placeholder={'Dolo 650 Paracetamol 650mg\nBatch No: DL-8812\nEXP: 12/2026'}
                className="medora-input py-2 font-mono"
              />
              <button
                type="button"
                onClick={() => runOcrExtraction(ocrRawText, 'manual_label.txt')}
                className="medora-btn-secondary w-full text-brand-ink border-brand/40"
              >
                <FileText className="w-4 h-4" />
                <span>{t('scan.parse_text_btn')}</span>
              </button>
            </div>

            <div className="pt-2 space-y-2">
              <span className="text-[11px] font-bold text-brand-ink block uppercase tracking-wider">
                Sample Packaging Presets:
              </span>
              <div className="space-y-1.5">
                {samplePackages.map((pkg, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setOcrRawText(pkg.rawText);
                      runOcrExtraction(pkg.rawText, pkg.filename);
                    }}
                    className="w-full p-2.5 rounded-xl bg-field hover:bg-surface-alt border border-line hover:border-brand text-start text-xs flex items-center justify-between text-ink transition-colors"
                  >
                    <span>{pkg.label}</span>
                    <span className={`text-[10px] font-mono font-bold ${pkg.expiryOffset < 0 ? 'text-danger-ink' : 'text-brand-ink'}`}>
                      {pkg.expiryOffset < 0 ? t('status.EXPIRED') : `${pkg.expiryOffset}d`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="md:col-span-7 p-6 medora-card space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-base font-bold text-ink">{t('scan.draft_title')}</h3>
                <span className="text-xs text-brand-ink font-medium">
                  {hasScanned
                    ? `Draft Ready (${confidenceScore ? `${Math.round(confidenceScore * 100)}%` : ''})`
                    : t('scan.draft_title')}
                </span>
              </div>
              {hasScanned && (
                <span className="px-2 py-0.5 rounded bg-danger/15 text-danger-ink font-bold text-xs border border-danger/40">
                  {t('scan.unconfirmed_badge')}
                </span>
              )}
            </div>

            {statusMessage && (
              <div className="p-3 rounded-xl bg-field border border-brand text-xs text-brand-ink font-medium">
                {statusMessage}
              </div>
            )}

            {isProcessing ? (
              <div className="p-12 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-brand-ink animate-spin mx-auto" />
                <p className="text-xs text-ink-muted">{t('scan.processing')}</p>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveRecord(true);
                }}
                className="space-y-3 text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-ink mb-1 font-semibold">{t('cabinet.field_name')}</label>
                    <input
                      type="text"
                      required
                      value={draftData.medicine_name}
                      onChange={(e) => setDraftData({ ...draftData, medicine_name: e.target.value })}
                      placeholder="Paracetamol Tablets IP"
                      className="medora-input"
                    />
                  </div>
                  <div>
                    <label className="block text-ink mb-1 font-semibold">{t('cabinet.field_brand')}</label>
                    <input
                      type="text"
                      value={draftData.brand}
                      onChange={(e) => setDraftData({ ...draftData, brand: e.target.value })}
                      className="medora-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-ink mb-1 font-semibold">{t('cabinet.field_strength')}</label>
                    <input
                      type="text"
                      value={draftData.strength}
                      onChange={(e) => setDraftData({ ...draftData, strength: e.target.value })}
                      className="medora-input"
                    />
                  </div>
                  <div>
                    <label className="block text-ink mb-1 font-semibold">{t('cabinet.field_form')}</label>
                    <input
                      type="text"
                      value={draftData.dosage_form}
                      onChange={(e) => setDraftData({ ...draftData, dosage_form: e.target.value })}
                      className="medora-input"
                    />
                  </div>
                  <div>
                    <label className="block text-ink mb-1 font-semibold">{t('cabinet.field_batch')}</label>
                    <input
                      type="text"
                      value={draftData.batch_number}
                      onChange={(e) => setDraftData({ ...draftData, batch_number: e.target.value })}
                      className="medora-input font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-ink mb-1 font-semibold">{t('cabinet.field_expiry')}</label>
                    <input
                      type="date"
                      required
                      value={draftData.printed_expiry_date}
                      onChange={(e) => setDraftData({ ...draftData, printed_expiry_date: e.target.value })}
                      className="medora-input border-brand"
                    />
                  </div>
                  <div>
                    <label className="block text-ink mb-1 font-semibold">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={draftData.quantity}
                      onChange={(e) => setDraftData({ ...draftData, quantity: Number(e.target.value) })}
                      className="medora-input"
                    />
                  </div>
                  <div>
                    <label className="block text-ink mb-1 font-semibold">Assigned Member</label>
                    <select
                      value={draftData.assigned_member_id}
                      onChange={(e) => setDraftData({ ...draftData, assigned_member_id: Number(e.target.value) })}
                      className="medora-select w-full"
                    >
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} ({m.relationship_role})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-ink mb-1 font-semibold">Storage & Safety Notes</label>
                  <textarea
                    rows={2}
                    value={draftData.storage_instructions}
                    onChange={(e) => setDraftData({ ...draftData, storage_instructions: e.target.value })}
                    className="medora-input py-2"
                  />
                </div>

                <div className="pt-3 border-t border-line flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[11px] text-ink-muted">
                    Source: <strong className="text-brand-ink">{draftData.data_source} Draft</strong>
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSaveRecord(false)}
                      className="px-4 py-2.5 rounded-xl bg-field text-danger-ink border border-danger/50 font-semibold text-xs hover:bg-surface-alt flex items-center gap-1.5 transition-colors"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Save as Unconfirmed Draft</span>
                    </button>
                    <button
                      type="submit"
                      className="medora-btn-primary px-6"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>{t('scan.confirm_btn')}</span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto p-8 medora-card space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-alt border border-line text-brand-ink flex items-center justify-center">
              <Barcode className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-ink">Pharmaceutical Barcode Lookup</h3>
              <p className="text-xs text-ink-muted">Resolves GTIN / EAN-13 barcodes against the backend catalog.</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-semibold text-ink">
              Enter 13-digit EAN Barcode:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder={t('scan.barcode_input_placeholder')}
                className="medora-input flex-1 font-mono text-sm"
              />
              <button
                type="button"
                onClick={handleBarcodeLookup}
                className="medora-btn-primary px-5"
              >
                {t('scan.lookup_btn')}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-ink-muted">
              <span>Catalog samples:</span>
              {Object.entries(OFFLINE_BARCODE_CATALOG).slice(0, 4).map(([code, info]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setBarcodeInput(code)}
                  className="text-brand-ink underline font-mono font-semibold"
                >
                  {code} ({info.brand})
                </button>
              ))}
            </div>
          </div>

          {barcodeLookupResult && (
            <div className="p-4 rounded-xl bg-field border border-brand/60 space-y-2 text-xs">
              <div className="font-bold text-brand-ink flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" />
                <span>Barcode Lookup Result</span>
              </div>
              <p className="text-ink">{barcodeLookupResult}</p>
              <button
                type="button"
                onClick={() => setActiveScanMode('ocr')}
                className="mt-2 text-xs text-brand-ink font-bold underline flex items-center gap-1"
              >
                <span>Proceed to verify expiry & batch in draft review form ➔</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
    </AuthGate>
  );
};
