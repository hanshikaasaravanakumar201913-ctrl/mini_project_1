import React, { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useMedicine } from '../context/MedicineContext';
import { ExpiryBadge } from '../components/ExpiryBadge';
import { AuthGate } from '../components/AuthGate';
import { formatDateDisplay } from '../utils/dateUtils';
import {
  Clock, AlertTriangle, CheckCircle, Users, ChevronRight
} from 'lucide-react';

export const TimelinePage: React.FC = () => {
  const { t } = useLanguage();
  const { medicines, members, setSelectedMedicineForPassport, setActiveTab } = useMedicine();
  const [selectedMember, setSelectedMember] = useState<number | 'ALL'>('ALL');

  const activeMeds = medicines
    .filter((m) => !m.is_disposed)
    .filter((m) => selectedMember === 'ALL' || m.assigned_member_id === selectedMember)
    .sort((a, b) => (a.days_until_expiry ?? 0) - (b.days_until_expiry ?? 0));

  const criticalSection = activeMeds.filter((m) => (m.days_until_expiry ?? 0) <= 3);
  const approachingSection = activeMeds.filter((m) => (m.days_until_expiry ?? 0) > 3 && (m.days_until_expiry ?? 0) <= 10);
  const safeSection = activeMeds.filter((m) => (m.days_until_expiry ?? 0) > 10);

  const renderTimelineCard = (med: typeof medicines[0]) => (
    <button
      key={med.id}
      type="button"
      onClick={() => {
        setSelectedMedicineForPassport(med);
        setActiveTab('passport');
      }}
      className="w-full text-start p-4 rounded-2xl bg-surface border border-line hover:border-brand shadow-card transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group"
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-sm text-ink group-hover:text-brand-ink transition-colors">
            {med.medicine_name}
          </span>
          {med.brand && (
            <span className="text-xs text-brand-ink font-medium">({med.brand})</span>
          )}
        </div>
        <div className="text-xs text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{med.strength || t('common.na')} • {med.dosage_form}</span>
          <span className="font-mono">{t('cabinet.label_batch')} {med.batch_number || t('common.na')}</span>
          {med.assigned_member && (
            <span className="text-brand-ink font-semibold">{med.assigned_member.name}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <ExpiryBadge status={med.expiry_status} days={med.days_until_expiry} />
        <span className="text-xs font-mono text-ink-muted min-w-[85px] text-end">
          {formatDateDisplay(med.printed_expiry_date)}
        </span>
        <ChevronRight className="w-4 h-4 text-ink-muted group-hover:text-brand-ink transition-colors rtl:rotate-180" />
      </div>
    </button>
  );

  return (
    <AuthGate title={t('nav.timeline')}>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Title & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink font-display">
            {t('timeline.title')}
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-1">
            {t('timeline.subtitle')}
          </p>
        </div>

        {/* Member filter */}
        <div className="flex items-center gap-2 bg-surface p-1.5 rounded-xl border border-line shadow-card">
          <Users className="w-4 h-4 text-brand-ink ms-2" />
          <select
            aria-label={t('common.all_members')}
            value={selectedMember}
            onChange={(e) => setSelectedMember(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
            className="medora-select"
          >
            <option value="ALL">{t('common.all_members')}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({m.relationship_role})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tier 1: Critical Urgency (<=3 Days) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 border-b border-danger/40 pb-2">
          <AlertTriangle className="w-5 h-5 text-danger-ink" />
          <h2 className="text-sm font-bold text-danger-ink uppercase tracking-wider">
            {t('timeline.critical_section')}
          </h2>
          <span className="ms-auto text-xs px-2 py-0.5 rounded-full bg-danger/15 text-danger-ink border border-danger/30 font-mono font-bold">
            {criticalSection.length}
          </span>
        </div>

        {criticalSection.length === 0 ? (
          <div className="p-4 rounded-xl bg-surface/60 border border-line text-xs text-ink-muted">
            {t('cabinet.empty')}
          </div>
        ) : (
          <div className="space-y-2.5">
            {criticalSection.map(renderTimelineCard)}
          </div>
        )}
      </div>

      {/* Tier 2: Approaching (4 - 10 Days) */}
      <div className="space-y-3 pt-4">
        <div className="flex items-center gap-2 border-b border-brand/40 pb-2">
          <Clock className="w-5 h-5 text-brand-ink" />
          <h2 className="text-sm font-bold text-brand-ink uppercase tracking-wider">
            {t('timeline.approaching_section')}
          </h2>
          <span className="ms-auto text-xs px-2 py-0.5 rounded-full bg-brand/15 text-brand-ink border border-brand/30 font-mono font-bold">
            {approachingSection.length}
          </span>
        </div>

        {approachingSection.length === 0 ? (
          <div className="p-4 rounded-xl bg-surface/60 border border-line text-xs text-ink-muted">
            {t('cabinet.empty')}
          </div>
        ) : (
          <div className="space-y-2.5">
            {approachingSection.map(renderTimelineCard)}
          </div>
        )}
      </div>

      {/* Tier 3: Safe Inventory (> 10 Days) */}
      <div className="space-y-3 pt-4">
        <div className="flex items-center gap-2 border-b border-line pb-2">
          <CheckCircle className="w-5 h-5 text-success-ink" />
          <h2 className="text-sm font-bold text-ink uppercase tracking-wider">
            {t('timeline.safe_section')}
          </h2>
          <span className="ms-auto text-xs px-2 py-0.5 rounded-full bg-surface-alt text-ink border border-line font-mono font-bold">
            {safeSection.length}
          </span>
        </div>

        {safeSection.length === 0 ? (
          <div className="p-4 rounded-xl bg-surface/60 border border-line text-xs text-ink-muted">
            {t('cabinet.empty')}
          </div>
        ) : (
          <div className="space-y-2.5">
            {safeSection.map(renderTimelineCard)}
          </div>
        )}
      </div>
    </div>
    </AuthGate>
  );
};
