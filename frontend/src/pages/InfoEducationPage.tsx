import React, { useState, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useMedicine } from '../context/MedicineContext';
import { NlpMedicineFinder } from '../components/NlpMedicineFinder';
import {
  Search, ShieldAlert, AlertTriangle,
  BookOpen, Check, HeartPulse
} from 'lucide-react';

interface EducationMedicine {
  id: string;
  generic_name: string;
  common_brands: string[];
  therapeutic_class: string;
  general_purpose: string;
  common_dosage_forms?: string[];
  storage_instructions: string;
  key_warnings: string;
  source: string;
  last_verified: string;
}

interface SymptomGuide {
  symptom: string;
  general_overview: string;
  safe_self_care: string[];
  red_flag_emergencies: string[];
  disclaimer?: string;
}

const FALLBACK_MEDICINES_CATALOG: EducationMedicine[] = [
  {
    id: 'info-paracetamol',
    generic_name: 'Paracetamol (Acetaminophen)',
    common_brands: ['Dolo 650', 'Calpol', 'Crocin'],
    therapeutic_class: 'Analgesic & Antipyretic',
    general_purpose: 'Relief of mild to moderate pain and temporary reduction of fever.',
    storage_instructions: 'Store below 25°C in a dry place. Protect from excessive moisture.',
    key_warnings: 'Do not exceed recommended maximum daily dose (4000mg in adults) to prevent severe liver toxicity.',
    source: 'WHO Model Formulary & Indian Pharmacopoeia (IP)',
    last_verified: '2026-01-15'
  },
  {
    id: 'info-amoxicillin',
    generic_name: 'Amoxicillin / Clavulanic Acid',
    common_brands: ['Augmentin', 'Moxikind-CV', 'Clavam'],
    therapeutic_class: 'Beta-Lactam Antibacterial',
    general_purpose: 'Treatment of bacterial infections including respiratory, ear, sinus, and skin infections.',
    storage_instructions: 'Reconstituted suspensions must be refrigerated (2°C - 8°C) and discarded after 7-10 days.',
    key_warnings: 'Contraindicated in penicillin allergy. Always complete the full prescribed course.',
    source: 'British National Formulary (BNF)',
    last_verified: '2026-02-10'
  }
];

const FALLBACK_SYMPTOMS: SymptomGuide[] = [
  {
    symptom: 'Fever & Body Aches',
    general_overview: 'Fever is often the body’s natural immunological response to viral or bacterial infections.',
    safe_self_care: [
      'Maintain active hydration with water or oral rehydration solutions.',
      'Rest in a comfortably ventilated room with light clothing.'
    ],
    red_flag_emergencies: [
      'High fever persisting beyond 3 consecutive days.',
      'Stiff neck, photophobia, difficulty breathing, or sudden confusion.'
    ]
  }
];

export const InfoEducationPage: React.FC = () => {
  const { t } = useLanguage();
  const { isApiConnected } = useMedicine();
  const [activeTab, setActiveTab] = useState<'medicines' | 'symptoms'>('medicines');
  const [searchTerm, setSearchTerm] = useState('');
  const [medCatalog, setMedCatalog] = useState<EducationMedicine[]>(FALLBACK_MEDICINES_CATALOG);
  const [symptomGuides, setSymptomGuides] = useState<SymptomGuide[]>(FALLBACK_SYMPTOMS);

  useEffect(() => {
    let cancelled = false;
    const loadCatalog = async () => {
      if (!isApiConnected) return;
      try {
        const qParam = searchTerm.trim() ? `?q=${encodeURIComponent(searchTerm.trim())}` : '';
        const [medRes, symRes] = await Promise.all([
          fetch(`/api/education/medicines${qParam}`),
          fetch('/api/education/symptoms')
        ]);
        if (!cancelled && medRes.ok) {
          const meds = await medRes.json();
          if (Array.isArray(meds)) setMedCatalog(meds);
        }
        if (!cancelled && symRes.ok) {
          const syms = await symRes.json();
          if (Array.isArray(syms)) setSymptomGuides(syms);
        }
      } catch {
        // Retain fallback data offline
      }
    };
    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [isApiConnected, searchTerm]);

  const filteredMeds = medCatalog.filter((m) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      m.generic_name.toLowerCase().includes(q) ||
      m.common_brands.some((b) => b.toLowerCase().includes(q)) ||
      m.therapeutic_class.toLowerCase().includes(q) ||
      m.general_purpose.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="border-b border-line pb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink font-display">
          {t('education.title')}
        </h1>
        <p className="text-xs sm:text-sm text-ink-muted mt-1">
          Curated pharmaceutical monographs, verified sources, and non-diagnostic self-care guidance.
        </p>
      </div>

      <div className="p-4 rounded-2xl bg-surface border-2 border-danger text-xs text-ink flex items-start gap-3 shadow-card">
        <ShieldAlert className="w-5 h-5 text-danger-ink shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-danger-ink">{t('footer.disclaimer_title')}</strong> {t('education.disclaimer')}
        </p>
      </div>

      <NlpMedicineFinder
        onSelectCanonicalMedicine={(genericQuery) => {
          setActiveTab('medicines');
          setSearchTerm(genericQuery);
        }}
      />

      <div className="flex gap-2 border-b border-line">
        <button
          type="button"
          onClick={() => setActiveTab('medicines')}
          className={`px-5 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'medicines'
              ? 'border-brand text-brand-ink bg-surface/60'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>{t('education.search_med')}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('symptoms')}
          className={`px-5 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'symptoms'
              ? 'border-brand text-brand-ink bg-surface/60'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <HeartPulse className="w-4 h-4" />
          <span>{t('education.symptom_guide')}</span>
        </button>
      </div>

      {activeTab === 'medicines' && (
        <div className="space-y-6">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-ink-muted absolute start-3 top-3" />
            <input
              type="text"
              placeholder={t('education.search_med')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="medora-input ps-9 bg-surface"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredMeds.map((med) => (
              <div
                key={med.id}
                className="p-6 medora-card hover:border-brand space-y-4"
              >
                <div>
                  <span className="text-[10px] font-bold text-brand-ink uppercase tracking-wider block">
                    {med.therapeutic_class}
                  </span>
                  <h3 className="text-lg font-bold text-ink mt-0.5">{med.generic_name}</h3>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {med.common_brands.map((b, bIdx) => (
                      <span key={bIdx} className="text-[10px] px-2 py-0.5 rounded bg-field text-brand-ink font-semibold border border-line">
                        {b}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 text-xs text-ink border-t border-line pt-3">
                  <div>
                    <strong className="text-ink block mb-0.5">{t('education.general_purpose')}</strong>
                    <p className="leading-relaxed text-ink-muted">{med.general_purpose}</p>
                  </div>
                  <div>
                    <strong className="text-ink block mb-0.5">{t('education.storage_protocol')}</strong>
                    <p className="leading-relaxed text-ink-muted">{med.storage_instructions}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-danger/10 border border-danger/35 text-danger-ink">
                    <strong className="block mb-0.5 font-bold">{t('education.safety_warnings')}</strong>
                    <p className="leading-relaxed">{med.key_warnings}</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-line flex items-center justify-between text-[10px] text-ink-muted">
                  <span>Source: {med.source}</span>
                  <span>Verified: {med.last_verified}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'symptoms' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {symptomGuides.map((item, idx) => (
            <div
              key={idx}
              className="p-6 medora-card space-y-5"
            >
              <div>
                <h3 className="text-lg font-bold text-ink pb-2 border-b border-line">
                  {item.symptom}
                </h3>
                <p className="text-xs text-ink-muted mt-2">{item.general_overview}</p>
              </div>

              <div className="space-y-2 text-xs">
                <span className="font-bold text-brand-ink block uppercase tracking-wider text-[11px]">
                  General Self-Care Measures:
                </span>
                <ul className="space-y-1.5 text-ink">
                  {item.safe_self_care.map((step, sIdx) => (
                    <li key={sIdx} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-brand-ink shrink-0 mt-0.5" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-2xl bg-danger/10 border border-danger/50 space-y-2 text-xs text-danger-ink">
                <span className="font-extrabold flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{t('education.red_flags')}</span>
                </span>
                <ul className="space-y-1 ps-4 list-disc text-xs">
                  {item.red_flag_emergencies.map((flag, fIdx) => (
                    <li key={fIdx} className="leading-snug">{flag}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
