import React, { useState } from 'react';
import { UserCheck, UserPlus, ShieldOff, Check, X } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useMedicine } from '../context/MedicineContext';
import { CaregiverPermissions } from '../types';
import { AuthGate } from '../components/AuthGate';

const PERMISSION_KEYS: { key: keyof CaregiverPermissions; label: string }[] = [
  { key: 'can_view_medicines', label: 'View Medicines' },
  { key: 'can_edit_medicines', label: 'Add / Edit Medicines & Disposal' },
  { key: 'can_view_prescriptions', label: 'View Prescription Vault' },
  { key: 'can_manage_schedules', label: 'Manage Medication Schedules' },
  { key: 'can_record_doses', label: 'Record Dose Administration' },
  { key: 'can_view_notifications', label: 'View Notifications' },
  { key: 'can_manage_refills', label: 'Submit Pharmacy Refills & Orders' },
];

export const CaregiverPage: React.FC = () => {
  const { t } = useLanguage();
  const {
    currentUser,
    accessRole,
    caregivers,
    householdInvitations,
    myInvitations,
    activeHouseholdId,
    authFetch,
    refreshFromBackend,
  } = useMedicine();

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFlags, setInviteFlags] = useState<CaregiverPermissions>({
    can_view_medicines: true,
    can_edit_medicines: false,
    can_view_prescriptions: false,
    can_manage_schedules: true,
    can_record_doses: true,
    can_view_notifications: true,
    can_manage_refills: false,
  });
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    setErrorMsg(null);
    const hhSuffix = activeHouseholdId ? `?household_id=${activeHouseholdId}` : '';
    const res = await authFetch(`/api/caregivers/invite${hhSuffix}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caregiver_email: inviteEmail.trim(), ...inviteFlags }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.detail || 'Invitation failed.');
    } else {
      setStatusMsg(`Invitation sent to ${data.caregiver_email}.`);
      setInviteEmail('');
      await refreshFromBackend();
    }
  };

  const handleTogglePermission = async (cgId: number, current: CaregiverPermissions, key: keyof CaregiverPermissions) => {
    const updated: CaregiverPermissions = {
      can_view_medicines: current.can_view_medicines,
      can_edit_medicines: current.can_edit_medicines,
      can_view_prescriptions: current.can_view_prescriptions,
      can_manage_schedules: current.can_manage_schedules,
      can_record_doses: current.can_record_doses,
      can_view_notifications: current.can_view_notifications,
      can_manage_refills: current.can_manage_refills,
      [key]: !current[key],
    };
    const res = await authFetch(`/api/caregivers/${cgId}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (res.ok) {
      await refreshFromBackend();
    }
  };

  const handleRevoke = async (cgId: number) => {
    if (!confirm('Revoke caregiver access immediately?')) return;
    const res = await authFetch(`/api/caregivers/${cgId}`, { method: 'DELETE' });
    if (res.ok) {
      setStatusMsg('Caregiver access revoked immediately.');
      await refreshFromBackend();
    }
  };

  const handleRespondInvite = async (invId: number, action: 'accept' | 'decline') => {
    const res = await authFetch(`/api/caregivers/invitations/${invId}/${action}`, { method: 'POST' });
    if (res.ok) {
      setStatusMsg(`Invitation ${action === 'accept' ? 'accepted' : 'declined'}.`);
      await refreshFromBackend();
    }
  };

  return (
    <AuthGate title={t('caregivers.title')}>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="border-b border-line pb-5">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink font-display">
          {t('caregivers.title')}
        </h1>
        <p className="text-xs sm:text-sm text-ink-muted mt-1">
          {t('caregivers.subtitle')}
        </p>
      </div>

      {statusMsg && (
        <div className="p-3 rounded-xl bg-surface border border-brand text-xs text-brand-ink font-medium">{statusMsg}</div>
      )}
      {errorMsg && (
        <div className="p-3 rounded-xl bg-danger/15 border border-danger text-xs text-danger-ink font-medium">{errorMsg}</div>
      )}

      {/* Pending Invitations Addressed to Me */}
      {myInvitations.length > 0 && (
        <div className="p-6 medora-card border-brand/60 space-y-4">
          <h2 className="text-base font-bold text-brand-ink">Caregiver Invitations for {currentUser?.email}</h2>
          <div className="space-y-2.5 text-xs">
            {myInvitations.map((inv) => (
              <div key={inv.id} className="p-4 rounded-2xl bg-field border border-line flex flex-wrap items-center justify-between gap-3">
                <div>
                  <strong className="text-sm text-ink">{inv.household_name || `Household #${inv.household_id}`}</strong>
                  <span className="block text-ink-muted mt-0.5">Status: {inv.status}</span>
                </div>
                {inv.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleRespondInvite(inv.id, 'accept')}
                      className="px-3.5 py-1.5 rounded-xl bg-brand text-on-brand font-bold flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{t('common.accept')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRespondInvite(inv.id, 'decline')}
                      className="px-3.5 py-1.5 rounded-xl bg-danger/15 text-danger-ink border border-danger/30 font-bold flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>{t('common.decline')}</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {accessRole === 'OWNER' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Invite Form */}
          <div className="lg:col-span-5 p-6 medora-card space-y-4">
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-brand-ink" />
              <span>{t('caregivers.invite_btn')}</span>
            </h2>
            <form onSubmit={handleInvite} className="space-y-3 text-xs">
              <div>
                <label className="block text-ink font-semibold mb-1">{t('caregivers.email_label')}</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="caregiver@example.com"
                  className="medora-input"
                />
              </div>
              <div className="space-y-1.5 pt-1">
                <span className="font-semibold text-brand-ink block">{t('caregivers.assign_perms')}:</span>
                {PERMISSION_KEYS.map((item) => (
                  <label key={item.key} className="flex items-center gap-2 p-2.5 rounded-xl bg-field border border-line cursor-pointer hover:border-brand transition-colors">
                    <input
                      type="checkbox"
                      checked={Boolean(inviteFlags[item.key])}
                      onChange={(e) =>
                        setInviteFlags((prev) => ({ ...prev, [item.key]: e.target.checked }))
                      }
                    />
                    <span className="text-ink font-medium">{item.label}</span>
                  </label>
                ))}
              </div>
              <button
                type="submit"
                className="medora-btn-primary w-full"
              >
                {t('caregivers.send_invite')}
              </button>
            </form>
          </div>

          {/* Active Caregivers & Invitations */}
          <div className="lg:col-span-7 space-y-4">
            <div className="p-6 medora-card space-y-4">
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-brand-ink" />
                <span>{t('caregivers.title')} ({caregivers.length})</span>
              </h2>

              {caregivers.length === 0 ? (
                <p className="text-xs text-ink-muted">{t('caregivers.none_active')}</p>
              ) : (
                <div className="space-y-4">
                  {caregivers.map((cg) => (
                    <div key={cg.id} className="p-4 rounded-2xl bg-field border border-line space-y-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <strong className="text-sm text-ink">{cg.caregiver_name}</strong>
                          <span className="block text-brand-ink font-mono font-medium">{cg.caregiver_email}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRevoke(cg.id)}
                          className="px-3 py-1.5 rounded-xl bg-danger text-on-danger font-bold flex items-center gap-1 hover:opacity-90 transition-opacity"
                        >
                          <ShieldOff className="w-3.5 h-3.5" />
                          <span>{t('caregivers.revoke')}</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {PERMISSION_KEYS.map((item) => (
                          <label key={item.key} className="flex items-center gap-2 p-2 rounded-lg bg-surface border border-line cursor-pointer hover:border-brand transition-colors">
                            <input
                              type="checkbox"
                              checked={Boolean(cg[item.key])}
                              onChange={() => handleTogglePermission(cg.id, cg, item.key)}
                            />
                            <span className="text-ink">{item.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {householdInvitations.length > 0 && (
              <div className="p-6 medora-card space-y-3 text-xs">
                <h3 className="font-bold text-sm text-ink">Invitation History</h3>
                {householdInvitations.map((inv) => (
                  <div key={inv.id} className="p-3 rounded-xl bg-field border border-line flex justify-between items-center">
                    <span className="font-mono text-ink">{inv.caregiver_email}</span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-alt border border-line text-brand-ink font-bold">
                      {inv.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-6 medora-card text-xs text-ink-muted">
          Only a household owner can invite or modify caregiver permissions. Use the switcher in the header if you care for multiple households.
        </div>
      )}
    </div>
    </AuthGate>
  );
};
