import React, { useState, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useMedicine } from '../context/MedicineContext';
import { AuthGate } from '../components/AuthGate';
import { formatDateDisplay } from '../utils/dateUtils';
import {
  Trash2, Clock, Check, Building2, Droplets, Ban, ShieldAlert
} from 'lucide-react';

interface DisposalPrinciple {
  title: string;
  description: string;
}

const FALLBACK_PRINCIPLES: DisposalPrinciple[] = [
  {
    title: 'Zero Sharing Policy',
    description: 'Never donate, resell, or share leftover prescription medications with family or friends.'
  },
  {
    title: 'Pharmacy Take-Back Kiosks',
    description: 'Surrender unneeded medicines to certified municipal pharmacy take-back drop boxes.'
  },
  {
    title: 'Do Not Flush',
    description: 'Never pour antibiotics or active pharmaceutical agents down domestic sinks or toilets.'
  }
];

export const DisposalPage: React.FC = () => {
  const { t } = useLanguage();
  const { permissions, medicines, disposalRecords, markDisposed, isApiConnected } = useMedicine();

  const activeMeds = medicines.filter((m) => !m.is_disposed);
  const expiredMeds = activeMeds.filter((m) => (m.days_until_expiry ?? 0) <= 0);

  const [selectedMedId, setSelectedMedId] = useState<number>(expiredMeds[0]?.id || activeMeds[0]?.id || 0);
  const [disposalMethod, setDisposalMethod] = useState('Community Pharmacy Take-Back Drop Box');
  const [notes, setNotes] = useState('Surrendered at designated hazardous medical disposal kiosk.');
  const [principles, setPrinciples] = useState<DisposalPrinciple[]>(FALLBACK_PRINCIPLES);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  useEffect(() => {
    const stillValid = activeMeds.some((m) => m.id === selectedMedId);
    if (!stillValid) {
      setSelectedMedId(expiredMeds[0]?.id || activeMeds[0]?.id || 0);
    }
  }, [activeMeds, expiredMeds, selectedMedId]);

  useEffect(() => {
    if (!isApiConnected) return;
    fetch('/api/disposal/guidance')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.principles && Array.isArray(data.principles)) {
          setPrinciples(data.principles);
        }
      })
      .catch(() => {});
  }, [isApiConnected]);

  const canEdit = !isApiConnected || permissions?.can_edit_medicines !== false;

  const handleRecordDisposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !selectedMedId) return;
    await markDisposed(Number(selectedMedId), disposalMethod, notes);
    setFeedbackMsg('Medicine recorded as safely disposed and pending expiry alerts cleared.');
  };

  return (
    <AuthGate title={t('disposal.title')}>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="border-b border-line pb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink font-display">
          {t('disposal.title')}
        </h1>
        <p className="text-xs sm:text-sm text-ink-muted mt-1">
          {t('disposal.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {principles.slice(0, 3).map((p, idx) => (
          <div
            key={idx}
            className={`p-6 medora-card space-y-3 ${
              idx === 0 ? 'border-2 border-danger' : 'border-line'
            }`}
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                idx === 0 ? 'bg-danger/15 text-danger-ink' : 'bg-surface-alt text-brand-ink'
              }`}
            >
              {idx === 0 ? <Ban className="w-5 h-5" /> : idx === 1 ? <Building2 className="w-5 h-5" /> : <Droplets className="w-5 h-5" />}
            </div>
            <h3 className="font-bold text-sm text-ink">{p.title}</h3>
            <p className="text-xs text-ink-muted leading-relaxed">{p.description}</p>
          </div>
        ))}
      </div>

      {principles.length > 3 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {principles.slice(3).map((p, idx) => (
            <div key={idx} className="p-4 rounded-2xl bg-surface border border-line shadow-card flex items-start gap-3 text-xs">
              <ShieldAlert className="w-4 h-4 text-brand-ink shrink-0 mt-0.5" />
              <div>
                <strong className="text-ink block">{p.title}</strong>
                <p className="text-ink-muted mt-1">{p.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-5 p-6 medora-card space-y-4">
          <h3 className="text-base font-bold text-ink flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-danger-ink" />
            <span>{t('disposal.mark_disposed')}</span>
          </h3>

          {feedbackMsg && (
            <div className="p-3 rounded-xl bg-field border border-brand text-xs text-brand-ink font-medium">
              {feedbackMsg}
            </div>
          )}

          {activeMeds.length === 0 ? (
            <div className="p-6 text-center text-xs text-ink-muted">
              No active medicines remaining to dispose.
            </div>
          ) : (
            <form onSubmit={handleRecordDisposal} className="space-y-3 text-xs">
              <div>
                <label className="block text-ink font-semibold mb-1">{t('disposal.select_med')}</label>
                <select
                  value={selectedMedId}
                  onChange={(e) => setSelectedMedId(Number(e.target.value))}
                  className="medora-select w-full"
                >
                  {activeMeds.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.medicine_name} {m.days_until_expiry !== undefined && m.days_until_expiry <= 0 ? `(${t('status.EXPIRED')})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1">{t('disposal.method_label')}</label>
                <select
                  value={disposalMethod}
                  onChange={(e) => setDisposalMethod(e.target.value)}
                  className="medora-select w-full"
                >
                  <option value="Community Pharmacy Take-Back Drop Box">Community Pharmacy Take-Back Drop Box</option>
                  <option value="Hospital Medical Waste Drop-Off">Hospital Medical Waste Drop-Off</option>
                  <option value="Municipal Hazardous Drug Collection Kiosk">Municipal Hazardous Drug Collection Kiosk</option>
                  <option value="Household Solid Sealed Trash Protocol (Non-leaking mixed)">Household Solid Sealed Trash Protocol (Non-leaking mixed)</option>
                </select>
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1">{t('disposal.notes_label')}</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="medora-input py-2"
                />
              </div>

              {!canEdit ? (
                <div className="p-3 rounded-xl bg-field border border-danger/50 text-xs text-danger-ink font-medium">
                  {t('common.permission_read_only')}
                </div>
              ) : (
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-danger text-on-danger font-bold text-xs hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-md shadow-danger/20"
                >
                  <Check className="w-4 h-4" />
                  <span>{t('disposal.confirm_btn')}</span>
                </button>
              )}
            </form>
          )}
        </div>

        <div className="lg:col-span-7 p-6 medora-card space-y-4">
          <h3 className="text-base font-bold text-ink flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-ink" />
            <span>{t('disposal.history_title')}</span>
          </h3>

          {disposalRecords.length === 0 ? (
            <div className="p-8 text-center text-xs text-ink-muted">
              No disposal records recorded yet.
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              {disposalRecords.map((r) => (
                <div
                  key={r.id}
                  className="p-4 rounded-2xl bg-field border border-line space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-ink">{r.medicine_name}</span>
                    <span className="font-mono text-danger-ink font-semibold">
                      Disposed: {formatDateDisplay(r.disposed_date)}
                    </span>
                  </div>
                  <div className="text-brand-ink font-medium">
                    Method: {r.disposal_method}
                  </div>
                  {r.notes && (
                    <p className="text-ink-muted text-[11px]">{r.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    </AuthGate>
  );
};
