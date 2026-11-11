import React, { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useMedicine } from '../context/MedicineContext';
import { formatDateDisplay } from '../utils/dateUtils';
import { AuthGate } from '../components/AuthGate';
import { CheckCheck, AlertTriangle, ShieldAlert, Clock, ArrowRight, CheckCircle2 } from 'lucide-react';

export const NotificationsPage: React.FC = () => {
  const { t } = useLanguage();
  const {
    notifications,
    medicines,
    markNotificationRead,
    markAllNotificationsRead,
    setSelectedMedicineForPassport,
    setActiveTab,
  } = useMedicine();

  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const filtered = notifications.filter(
    (n) => typeFilter === 'ALL' || (n.notification_type || 'EXPIRY') === typeFilter
  );

  const handleNotificationClick = (notif: typeof notifications[0]) => {
    markNotificationRead(notif.id);
    if (notif.medicine_id) {
      const med = medicines.find((m) => m.id === notif.medicine_id);
      if (med) {
        setSelectedMedicineForPassport(med);
        setActiveTab('passport');
        return;
      }
    }
    if (notif.notification_type === 'ORDER' || notif.notification_type === 'REFILL_REQUEST') {
      setActiveTab('pharmacy');
    } else if (notif.notification_type === 'PRESCRIPTION_VALIDITY') {
      setActiveTab('prescriptions');
    } else if (notif.notification_type === 'CAREGIVER') {
      setActiveTab('caregivers');
    }
  };

  return (
    <AuthGate title={t('notifications.title')}>
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink font-display flex items-center gap-3">
            <span>{t('notifications.title')}</span>
            {unreadCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-danger text-on-danger font-extrabold text-xs">
                {unreadCount}
              </span>
            )}
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-1">
            {t('notifications.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t('notifications.filter_all')}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="medora-select"
          >
            <option value="ALL">{t('notifications.filter_all')}</option>
            <option value="EXPIRY">{t('notifications.filter_expiry')}</option>
            <option value="LOW_STOCK">{t('notifications.filter_low_stock')}</option>
            <option value="REFILL">{t('notifications.filter_refill')}</option>
            <option value="PRESCRIPTION_VALIDITY">{t('notifications.filter_rx')}</option>
            <option value="CAREGIVER">{t('notifications.filter_caregiver')}</option>
            <option value="REFILL_REQUEST">{t('notifications.filter_order')}</option>
            <option value="ORDER">{t('notifications.filter_order')}</option>
          </select>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllNotificationsRead}
              className="medora-btn-secondary text-brand-ink border-brand/40"
            >
              <CheckCheck className="w-4 h-4" />
              <span>{t('notifications.mark_all_read')}</span>
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 medora-card text-center space-y-3">
          <CheckCircle2 className="w-10 h-10 text-brand-ink mx-auto" />
          <h3 className="text-base font-bold text-ink">{t('notifications.empty')}</h3>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((notif) => {
            const isCritical = notif.severity === 'CRITICAL' || notif.threshold_days <= 1;
            return (
              <button
                key={notif.id}
                type="button"
                onClick={() => handleNotificationClick(notif)}
                className={`w-full text-start p-4 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  !notif.is_read
                    ? 'bg-surface border-brand shadow-card'
                    : 'bg-surface/60 border-line opacity-80 hover:opacity-100'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      isCritical ? 'bg-danger/15 text-danger-ink' : 'bg-surface-alt text-brand-ink'
                    }`}
                  >
                    {isCritical ? <ShieldAlert className="w-4 h-4" /> : notif.notification_type === 'LOW_STOCK' ? <AlertTriangle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-field border border-line text-brand-ink">
                        {notif.notification_type || 'EXPIRY'}
                      </span>
                      {notif.medicine_name && (
                        <span className="font-bold text-sm text-ink">{notif.medicine_name}</span>
                      )}
                      {!notif.is_read && <span className="w-2 h-2 rounded-full bg-brand" />}
                    </div>
                    <p className="text-xs text-ink leading-snug">{notif.message}</p>
                    <span className="text-[10px] text-ink-muted block">
                      {formatDateDisplay(notif.triggered_at)}
                    </span>
                  </div>
                </div>

                <span className="text-xs text-brand-ink font-semibold flex items-center gap-1 shrink-0">
                  <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
    </AuthGate>
  );
};
