import React, { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useMedicine } from '../context/MedicineContext';
import { formatDateDisplay } from '../utils/dateUtils';
import { Clock, Check, Plus, AlertCircle, X, RefreshCw, Store } from 'lucide-react';
import { AuthGate } from '../components/AuthGate';

export const SchedulePage: React.FC = () => {
  const { t } = useLanguage();
  const {
    schedules,
    medicines,
    members,
    refillPredictions,
    addSchedule,
    logDose,
    setPharmacyPrefillQuery,
    setActiveTab,
  } = useMedicine();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    medicine_id: medicines[0]?.id || 1,
    member_id: members[0]?.id || 1,
    reminder_time: '08:00 AM',
    frequency: 'Daily',
    days_of_week: 'Mon,Tue,Wed,Thu,Fri,Sat,Sun',
    dose_quantity: 1,
    status: 'ACTIVE' as const,
  });

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    await addSchedule(formData);
    setFeedbackMsg('Medication schedule saved and refill prediction updated.');
    setIsAddModalOpen(false);
  };

  const handleDoseAction = async (scheduleId: number, medName: string | undefined, status: 'TAKEN' | 'SKIPPED') => {
    await logDose(scheduleId, status);
    setFeedbackMsg(
      status === 'TAKEN'
        ? `Recorded TAKEN for ${medName || 'medicine'}; cabinet stock & refill prediction updated.`
        : `Recorded SKIPPED for ${medName || 'medicine'}.`
    );
  };

  return (
    <AuthGate title={t('schedule.title')}>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink font-display">
            {t('schedule.title')}
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-1">
            Dose logging, adherence-adjusted refill forecasts, and quick pharmacy refill discovery.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="medora-btn-primary"
        >
          <Plus className="w-4 h-4" />
          <span>{t('schedule.add_reminder')}</span>
        </button>
      </div>

      {feedbackMsg && (
        <div className="p-3 rounded-xl bg-surface border border-brand text-xs text-brand-ink font-medium">
          {feedbackMsg}
        </div>
      )}

      <div className="p-4 medora-card text-xs text-ink flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-brand-ink shrink-0 mt-0.5" />
        <p className="text-ink-muted">
          {t('schedule.notice')}
        </p>
      </div>

      {/* Active Schedules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {schedules.map((sched) => {
          const med = medicines.find((m) => m.id === sched.medicine_id);
          const member = members.find((m) => m.id === sched.member_id);

          return (
            <div
              key={sched.id}
              className="p-6 medora-card space-y-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className="text-[10px] font-bold tracking-wider uppercase text-brand-ink block">
                      {sched.frequency}
                    </span>
                    <h3 className="text-base font-bold text-ink">{sched.medicine_name}</h3>
                    {member && <span className="text-xs text-ink-muted">For: {member.name}</span>}
                  </div>
                  <div className="px-3 py-1 rounded-xl bg-field border border-line text-brand-ink font-mono font-bold text-xs flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{sched.reminder_time}</span>
                  </div>
                </div>

                <div className="space-y-2 py-3 border-y border-line text-xs text-ink">
                  <div className="flex justify-between">
                    <span className="text-ink-muted">{t('schedule.dose_label')}</span>
                    <span className="font-semibold text-ink">{sched.dose_quantity} {t('common.units')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">{t('schedule.stock_remaining')}</span>
                    <span className="font-bold text-brand-ink">{med ? `${med.quantity} ${med.quantity_unit || t('common.units')}` : t('common.na')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-ink-muted">{t('schedule.est_depletion')}:</span>
                    <span className="font-mono text-xs font-bold text-danger-ink">
                      {sched.estimated_depletion_date ? formatDateDisplay(sched.estimated_depletion_date) : t('common.na')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDoseAction(sched.id, sched.medicine_name, 'TAKEN')}
                  className="flex-1 py-2 rounded-xl bg-brand text-on-brand font-bold text-xs flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{t('schedule.mark_taken')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDoseAction(sched.id, sched.medicine_name, 'SKIPPED')}
                  className="px-3 py-2 rounded-xl bg-field text-ink border border-line hover:border-brand text-xs font-semibold transition-colors"
                >
                  {t('schedule.mark_skipped')}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Refill Prediction Engine Output */}
      {refillPredictions.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-line">
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-brand-ink" />
            <span>Refill Prediction Engine Breakdown</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {refillPredictions.map((pred) => (
              <div key={pred.id} className="p-5 medora-card space-y-3 text-xs">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-ink">{pred.medicine_name}</h3>
                    <span className="text-ink-muted">
                      Stock: {pred.current_quantity} {pred.quantity_unit || 'units'}
                      {pred.frequency ? ` • ${pred.frequency}` : ''}
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] border ${
                      pred.confidence_level === 'HIGH'
                        ? 'bg-success-bg text-success-ink border-success/30'
                        : pred.confidence_level === 'AS_NEEDED_ESTIMATE'
                        ? 'bg-warning-bg text-warning-ink border-warning/40'
                        : 'bg-field text-ink border-line'
                    }`}
                  >
                    {pred.confidence_level}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-field border border-line text-center">
                  <div>
                    <span className="text-[10px] text-ink-muted block">{t('schedule.daily_rate')}</span>
                    <strong className="font-mono text-ink">
                      {pred.estimated_daily_consumption > 0 ? `${pred.estimated_daily_consumption}/d` : t('common.na')}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink-muted block">{t('schedule.days_left')}</span>
                    <strong className="font-mono text-brand-ink">
                      {pred.remaining_days !== null && pred.remaining_days !== undefined ? `${pred.remaining_days} ${t('common.days')}` : t('common.na')}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink-muted block">{t('schedule.confidence')}</span>
                    <strong className="font-mono text-danger-ink">
                      {pred.suggested_refill_date ? formatDateDisplay(pred.suggested_refill_date) : t('common.na')}
                    </strong>
                  </div>
                </div>

                <p className="text-ink-muted text-[11px]">{pred.calculation_notes}</p>

                <button
                  type="button"
                  onClick={() => {
                    setPharmacyPrefillQuery(pred.medicine_name || '');
                    setActiveTab('pharmacy');
                  }}
                  className="medora-btn-secondary text-brand-ink hover:bg-brand hover:text-on-brand"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>{t('schedule.order_refill')}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Schedule Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-surface border-2 border-brand p-6 shadow-elevated space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-bold text-base text-ink">{t('schedule.add_reminder')}</h3>
              <button
                type="button"
                aria-label={t('common.cancel')}
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-ink-muted hover:text-ink"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSchedule} className="space-y-3 text-xs">
              <div>
                <label className="block text-ink font-semibold mb-1">Medicine</label>
                <select
                  value={formData.medicine_id}
                  onChange={(e) => setFormData({ ...formData, medicine_id: Number(e.target.value) })}
                  className="medora-select w-full"
                >
                  {medicines.filter((m) => !m.is_disposed).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.medicine_name} ({m.strength})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1">Family Member</label>
                <select
                  value={formData.member_id}
                  onChange={(e) => setFormData({ ...formData, member_id: Number(e.target.value) })}
                  className="medora-select w-full"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.relationship_role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink font-semibold mb-1">Reminder Time</label>
                  <input
                    type="text"
                    value={formData.reminder_time}
                    onChange={(e) => setFormData({ ...formData, reminder_time: e.target.value })}
                    className="medora-input"
                  />
                </div>
                <div>
                  <label className="block text-ink font-semibold mb-1">Dose Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.dose_quantity}
                    onChange={(e) => setFormData({ ...formData, dose_quantity: Number(e.target.value) })}
                    className="medora-input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1">Frequency</label>
                <select
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                  className="medora-select w-full"
                >
                  <option value="Daily">Daily</option>
                  <option value="Twice Daily">Twice Daily</option>
                  <option value="Thrice Daily">Thrice Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="As Needed">As Needed (PRN)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-line flex justify-end gap-2">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="medora-btn-secondary">
                  {t('common.cancel')}
                </button>
                <button type="submit" className="medora-btn-primary px-5">
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </AuthGate>
  );
};
