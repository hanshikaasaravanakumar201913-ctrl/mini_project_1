import React, { useEffect, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useMedicine } from '../context/MedicineContext';
import { ExpiryBadge } from '../components/ExpiryBadge';
import { QrCodeSvg } from '../components/QrCodeSvg';
import { AuthGate } from '../components/AuthGate';
import { formatDateDisplay } from '../utils/dateUtils';
import { FileText, Clock, ArrowLeft, Printer, Share2, ShieldCheck } from 'lucide-react';
import { MedicineEventHistory } from '../types';

export const PassportPage: React.FC = () => {
  const { t } = useLanguage();
  const {
    medicines,
    selectedMedicineForPassport,
    setSelectedMedicineForPassport,
    eventHistory,
    setActiveTab,
    isApiConnected,
    authToken,
    authFetch,
  } = useMedicine();

  const activeMed = selectedMedicineForPassport || medicines.find((m) => !m.is_disposed) || medicines[0];
  const [medEvents, setMedEvents] = useState<MedicineEventHistory[]>([]);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!activeMed) return;
    const localMatches = eventHistory.filter((e) => e.medicine_id === activeMed.id);
    setMedEvents(localMatches);

    if (isApiConnected && authToken) {
      authFetch(`/api/medicines/${activeMed.id}/events`)
        .then((res) => (res.ok ? res.json() : null))
        .then((rows) => {
          if (Array.isArray(rows)) setMedEvents(rows);
        })
        .catch(() => {});
    }
  }, [activeMed, eventHistory, isApiConnected, authToken, authFetch]);

  if (!activeMed) {
    return (
      <AuthGate title={t('nav.passport')}>
        <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
          <FileText className="w-12 h-12 text-brand-ink mx-auto" />
          <h2 className="text-xl font-bold text-ink">No medicine record available</h2>
          <button
            type="button"
            onClick={() => setActiveTab('cabinet')}
            className="medora-btn-primary"
          >
            Go to Medicine Cabinet
          </button>
        </div>
      </AuthGate>
    );
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  const qrVerifyUrl = activeMed.passport_token
    ? `${origin}/api/medicines/passport/verify/${activeMed.passport_token}`
    : `${origin}/?passport=MED-${activeMed.id}`;

  const handleShare = async () => {
    try {
      await navigator.clipboard?.writeText(qrVerifyUrl);
      setShareMsg(`Redacted verification reference copied (${activeMed.passport_token || `MED-${activeMed.id}`}).`);
    } catch {
      setShareMsg(`Verification endpoint: ${qrVerifyUrl}`);
    }
  };

  return (
    <AuthGate title={t('nav.passport')}>
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('cabinet')}
            aria-label={t('nav.cabinet')}
            className="p-2 rounded-xl bg-surface text-ink hover:text-brand-ink border border-line hover:border-brand transition-colors"
          >
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
          </button>
          <div>
            <span className="text-[10px] font-mono text-brand-ink tracking-widest uppercase font-semibold">
              {t('passport.title')}
            </span>
            <h1 className="text-2xl font-extrabold text-ink font-display">
              {activeMed.medicine_name}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">Record:</span>
          <select
            aria-label="Select medicine passport"
            value={activeMed.id}
            onChange={(e) => {
              const found = medicines.find((m) => m.id === Number(e.target.value));
              if (found) setSelectedMedicineForPassport(found);
            }}
            className="medora-select bg-surface"
          >
            {medicines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.medicine_name} {m.is_disposed ? '(Disposed)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {shareMsg && (
        <div className="p-3 rounded-xl bg-surface border border-brand text-xs text-brand-ink font-medium">
          {shareMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 space-y-6">
          <div className="p-6 medora-card space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
              <div>
                <span className="text-xs text-brand-ink font-bold block">
                  {activeMed.brand ? `${activeMed.brand} • ` : ''}{activeMed.dosage_form}
                  {activeMed.manufacturer ? ` • ${activeMed.manufacturer}` : ''}
                </span>
                <h2 className="text-xl font-extrabold text-ink font-display mt-0.5">
                  {activeMed.medicine_name}
                </h2>
                <span className="text-xs text-ink-muted">
                  Strength: <strong className="text-ink">{activeMed.strength || 'Standard'}</strong>
                  {activeMed.category ? ` • ${activeMed.category}` : ''}
                </span>
              </div>

              <div className="flex flex-col items-end gap-1.5">
                <ExpiryBadge status={activeMed.expiry_status} days={activeMed.days_until_expiry} size="lg" />
                <span className="text-xs font-mono text-ink-muted">
                  {t('cabinet.label_expiry')} {formatDateDisplay(activeMed.printed_expiry_date)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-3 rounded-2xl bg-field border border-line">
                <span className="text-[10px] text-ink-muted block">{t('passport.batch_lot')}</span>
                <span className="font-mono font-bold text-sm text-ink mt-0.5 block">
                  {activeMed.batch_number || t('common.na')}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-field border border-line">
                <span className="text-[10px] text-ink-muted block">{t('passport.stock_qty')}</span>
                <span className="font-extrabold text-sm text-brand-ink mt-0.5 block">
                  {activeMed.quantity} {activeMed.quantity_unit || t('common.units')}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-field border border-line">
                <span className="text-[10px] text-ink-muted block">{t('cabinet.field_member')}</span>
                <span className="font-bold text-sm text-ink mt-0.5 block">
                  {activeMed.assigned_member?.name || t('common.none')}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-field border border-line">
                <span className="text-[10px] text-ink-muted block">MFG DATE</span>
                <span className="font-medium text-xs text-ink mt-0.5 block">
                  {activeMed.manufacturing_date ? formatDateDisplay(activeMed.manufacturing_date) : 'Not recorded'}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-field border border-line">
                <span className="text-[10px] text-ink-muted block">OPENED DATE</span>
                <span className="font-medium text-xs text-ink mt-0.5 block">
                  {activeMed.opened_date ? formatDateDisplay(activeMed.opened_date) : 'Sealed'}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-field border border-line">
                <span className="text-[10px] text-ink-muted block">VERIFICATION SOURCE</span>
                <span className="font-bold text-xs text-brand-ink mt-0.5 block">
                  {activeMed.data_source} {activeMed.is_confirmed ? '(Confirmed)' : '(Draft)'}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-field border border-line space-y-1.5 text-xs">
              <span className="text-[11px] font-bold text-brand-ink block uppercase tracking-wider">
                {t('passport.storage_conditions')}
              </span>
              <p className="text-ink leading-relaxed">
                {activeMed.storage_instructions || 'Store in a cool, dry place below 25°C away from direct sunlight.'}
              </p>
              {activeMed.prescribed_dosage && (
                <p className="text-brand-ink text-[11px] font-semibold pt-1">
                  Prescribed Dosage: {activeMed.prescribed_dosage}
                </p>
              )}
              {activeMed.notes && (
                <p className="text-ink-muted text-[11px] italic pt-1 border-t border-line/60">
                  Notes: {activeMed.notes}
                </p>
              )}
            </div>
          </div>

          <div className="p-6 medora-card space-y-4">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <Clock className="w-4 h-4 text-brand-ink" />
              <span>{t('passport.audit_trail')}</span>
            </h3>

            {medEvents.length === 0 ? (
              <div className="text-xs text-ink-muted">No audit events logged yet.</div>
            ) : (
              <div className="space-y-2.5">
                {medEvents.map((ev) => (
                  <div key={ev.id} className="p-3 rounded-xl bg-field border border-line flex items-start justify-between text-xs gap-3">
                    <div>
                      <span className="font-bold text-brand-ink block">
                        {ev.action} {ev.quantity_delta !== 0 ? `(${ev.quantity_delta > 0 ? `+${ev.quantity_delta}` : ev.quantity_delta})` : ''}
                      </span>
                      <p className="text-ink text-[11px] mt-0.5">{ev.description}</p>
                    </div>
                    <span className="text-[10px] text-ink-muted font-mono shrink-0">
                      {formatDateDisplay(ev.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Printable Passport Verification Card with Scannable QR */}
        <div className="lg:col-span-4 space-y-4">
          <div className="p-6 rounded-3xl bg-passport text-passport-ink border-4 border-brand shadow-elevated space-y-4">
            <div className="text-center space-y-1 pb-3 border-b border-passport-ink/15">
              <span className="text-[10px] font-mono tracking-widest uppercase text-brand-ink block font-bold">
                MEDORA VERIFIED PASSPORT
              </span>
              <h3 className="text-lg font-black text-passport-ink">{activeMed.medicine_name}</h3>
              <span className="text-xs text-passport-ink/80 font-semibold block">{activeMed.brand || 'Generic'}</span>
            </div>

            <div className="p-4 bg-[#153F40] dark:bg-[#0E393D] rounded-2xl flex flex-col items-center justify-center space-y-2">
              <QrCodeSvg value={qrVerifyUrl} size={148} label={`QR for ${activeMed.medicine_name}`} />
              <span className="text-[9px] font-mono text-[#F3EDE6]/85 tracking-wider">
                {activeMed.passport_token || `MED-${activeMed.id}`}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-passport-sub text-[10px] text-passport-ink flex items-start gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand-ink" />
              <span>
                {t('passport.redacted_note')}
              </span>
            </div>

            <div className="space-y-1.5 text-xs text-passport-ink/85">
              <div className="flex justify-between">
                <span>{t('cabinet.label_expiry')}</span>
                <strong className="text-passport-ink font-mono">{formatDateDisplay(activeMed.printed_expiry_date)}</strong>
              </div>
              <div className="flex justify-between">
                <span>{t('cabinet.label_stock')}</span>
                <strong className={activeMed.is_disposed ? 'text-danger-ink' : 'text-brand-ink'}>
                  {activeMed.is_disposed ? t('disposal.title') : t('status.SAFE')}
                </strong>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="medora-btn-secondary flex-1 bg-surface"
            >
              <Printer className="w-4 h-4" />
              <span>{t('passport.print')}</span>
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="medora-btn-primary"
            >
              <Share2 className="w-4 h-4" />
              <span>{t('passport.share_link')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    </AuthGate>
  );
};
