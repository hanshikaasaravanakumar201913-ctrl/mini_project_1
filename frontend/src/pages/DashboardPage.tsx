import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useMedicine } from '../context/MedicineContext';
import { ExpiryBadge } from '../components/ExpiryBadge';
import { formatDateDisplay } from '../utils/dateUtils';
import { AuthGate } from '../components/AuthGate';
import {
  Pill,
  AlertTriangle,
  AlertCircle,
  Clock,
  Plus,
  Camera,
  Store,
  FileText,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { t } = useLanguage();
  const {
    medicines,
    dashboardSummary,
    refillPredictions,
    setActiveTab,
    setSelectedMedicineForPassport,
  } = useMedicine();

  const activeMeds = medicines.filter((m) => !m.is_disposed);
  const urgentMeds = activeMeds
    .filter((m) => m.days_until_expiry !== undefined && m.days_until_expiry <= 10)
    .sort((a, b) => (a.days_until_expiry ?? 0) - (b.days_until_expiry ?? 0));

  const upcomingRefills = refillPredictions.filter(
    (p) => p.remaining_days !== null && p.remaining_days !== undefined && p.remaining_days <= 14
  );

  return (
    <AuthGate title={t('dashboard.title')}>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header & Clear Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink font-display">
            {t('dashboard.title')}
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-1">{t('dashboard.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setActiveTab('scan')}
            className="medora-btn-primary"
          >
            <Camera className="w-4 h-4" />
            <span>{t('dashboard.quick_scan')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cabinet')}
            className="medora-btn-secondary border-brand/40"
          >
            <Plus className="w-4 h-4 text-brand-ink" />
            <span>{t('dashboard.quick_add')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('prescriptions')}
            className="min-h-[38px] px-4 py-2 rounded-xl bg-surface text-ink font-semibold text-xs border border-line hover:border-brand flex items-center gap-1.5 transition-colors"
          >
            <FileText className="w-4 h-4 text-brand-ink" />
            <span>{t('nav.prescriptions')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pharmacy')}
            className="min-h-[38px] px-4 py-2 rounded-xl bg-surface text-brand-ink font-semibold text-xs border border-brand/40 hover:bg-surface-alt flex items-center gap-1.5 transition-colors"
          >
            <Store className="w-4 h-4" />
            <span>{t('section.pharmacy')}</span>
          </button>
        </div>
      </div>

      {/* Minimal 4 Core KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => setActiveTab('cabinet')}
          className="p-5 medora-card hover:border-brand text-start"
        >
          <div className="flex items-center justify-between text-brand-ink mb-2">
            <span className="text-xs font-semibold">{t('dashboard.stat_total')}</span>
            <Pill className="w-4 h-4" />
          </div>
          <div className="text-3xl font-extrabold text-ink">
            {dashboardSummary.total_active_medicines}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('timeline')}
          className="p-5 medora-card border-danger/50 hover:border-danger text-start"
        >
          <div className="flex items-center justify-between text-danger-ink mb-2">
            <span className="text-xs font-semibold">{t('dashboard.stat_expiring')}</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="text-3xl font-extrabold text-danger-ink">
            {dashboardSummary.expiring_soon_count + dashboardSummary.already_expired_count}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cabinet')}
          className="p-5 medora-card hover:border-brand text-start"
        >
          <div className="flex items-center justify-between text-ink mb-2">
            <span className="text-xs font-semibold">{t('dashboard.stat_low_stock')}</span>
            <AlertCircle className="w-4 h-4 text-brand-ink" />
          </div>
          <div className="text-3xl font-extrabold text-ink">
            {dashboardSummary.low_stock_count}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('schedule')}
          className="p-5 medora-card hover:border-brand text-start"
        >
          <div className="flex items-center justify-between text-brand-ink mb-2">
            <span className="text-xs font-semibold">{t('dashboard.stat_refills')}</span>
            <RefreshCw className="w-4 h-4" />
          </div>
          <div className="text-3xl font-extrabold text-brand-ink">
            {dashboardSummary.upcoming_refills_count ?? upcomingRefills.length}
          </div>
        </button>
      </div>

      {/* Main Two-Column Essential Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Urgent Expiries & Refills */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-danger-ink" />
                <span>{t('dashboard.urgent_expiries')}</span>
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('timeline')}
                className="text-xs text-brand-ink font-semibold flex items-center gap-1 hover:underline"
              >
                <span>{t('nav.timeline')}</span>
                <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
              </button>
            </div>

            {urgentMeds.length === 0 ? (
              <div className="p-6 medora-card text-xs text-ink-muted">
                {t('dashboard.no_urgent')}
              </div>
            ) : (
              <div className="space-y-2.5">
                {urgentMeds.slice(0, 5).map((med) => (
                  <button
                    key={med.id}
                    type="button"
                    onClick={() => {
                      setSelectedMedicineForPassport(med);
                      setActiveTab('passport');
                    }}
                    className="w-full text-start p-4 rounded-2xl bg-surface border border-line hover:border-brand shadow-card cursor-pointer flex flex-wrap items-center justify-between gap-3 transition-colors"
                  >
                    <div>
                      <strong className="text-sm text-ink block">{med.medicine_name}</strong>
                      <span className="text-xs text-ink-muted">
                        {med.strength || t('common.na')} • {t('cabinet.label_batch')} {med.batch_number || t('common.na')}
                        {med.assigned_member ? ` • ${med.assigned_member.name}` : ''}
                      </span>
                    </div>
                    <ExpiryBadge status={med.expiry_status} days={med.days_until_expiry} size="sm" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {upcomingRefills.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-brand-ink" />
                <span>{t('dashboard.refill_forecasts')}</span>
              </h2>
              <div className="space-y-2">
                {upcomingRefills.slice(0, 3).map((pred) => (
                  <div key={pred.id} className="p-3.5 rounded-2xl bg-surface border border-line shadow-card flex justify-between items-center text-xs">
                    <div>
                      <strong className="text-ink">{pred.medicine_name}</strong>
                      <span className="block text-ink-muted">
                        {pred.remaining_days} {t('common.days')} • {t('schedule.confidence')}: {pred.confidence_level}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('schedule')}
                      className="text-brand-ink font-bold hover:underline"
                    >
                      {t('nav.schedule')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recent Important Activity */}
        <div className="lg:col-span-5 p-5 medora-card space-y-4">
          <h2 className="text-base font-bold text-ink flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-ink" />
            <span>{t('dashboard.recent_activity')}</span>
          </h2>
          {dashboardSummary.recent_activity.length === 0 ? (
            <p className="text-xs text-ink-muted">{t('dashboard.no_activity')}</p>
          ) : (
            <div className="space-y-3 text-xs">
              {dashboardSummary.recent_activity.map((act) => (
                <div key={act.id} className="pb-2.5 border-b border-line/60 last:border-0 last:pb-0">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="font-bold text-brand-ink">{act.action}</span>
                    <span className="text-ink-muted font-mono">{formatDateDisplay(act.timestamp)}</span>
                  </div>
                  <p className="text-ink mt-0.5">{act.description}</p>
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
