import React, { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { LANGUAGE_MAP, SUPPORTED_LANGUAGES } from '../i18n/languages';
import { useMedicine } from '../context/MedicineContext';
import { AuthGate } from '../components/AuthGate';
import { Language } from '../types';
import {
  UserPlus, AlertTriangle, ArrowRight, X, Globe
} from 'lucide-react';

export const FamilyPage: React.FC = () => {
  const { t } = useLanguage();
  const {
    currentUser,
    isApiConnected,
    activeHouseholdId,
    permissions,
    members,
    medicines,
    addMember,
    setActiveMemberFilter,
    setActiveTab,
    authFetch,
    refreshFromBackend,
  } = useMedicine();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    household_id: activeHouseholdId || 1,
    name: '',
    relationship_role: 'Spouse',
    age: 30,
    allergies: 'None',
    notes: '',
    preferred_language: 'en' as Language,
  });

  const handleMemberLangChange = async (memberId: number, newLang: Language) => {
    if (!isApiConnected || !currentUser) return;
    await authFetch(`/api/household/members/${memberId}/language`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferred_language: newLang }),
    });
    await refreshFromBackend();
  };

  const canEdit = !isApiConnected || permissions?.can_edit_medicines !== false;

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !formData.name.trim()) return;
    addMember({
      ...formData,
      household_id: activeHouseholdId || formData.household_id || 1,
    });
    setIsAddModalOpen(false);
    setFormData({
      household_id: activeHouseholdId || 1,
      name: '',
      relationship_role: 'Spouse',
      age: 30,
      allergies: 'None',
      notes: '',
      preferred_language: 'en',
    });
  };

  return (
    <AuthGate title={t('family.title')}>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Title & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink font-display">
            {t('family.title')}
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-1">
            {t('family.subtitle')}
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="medora-btn-primary shadow-md shadow-brand/20"
          >
            <UserPlus className="w-4 h-4" />
            <span>{t('family.add_member')}</span>
          </button>
        )}
      </div>

      {/* Members Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {members.map((member) => {
          const memberMeds = medicines.filter((m) => !m.is_disposed && m.assigned_member_id === member.id);
          const expiringMeds = memberMeds.filter((m) => (m.days_until_expiry ?? 100) <= 10);
          const memberLang = (member.preferred_language || 'en') as Language;

          return (
            <div
              key={member.id}
              className="p-6 medora-card hover:border-brand space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-surface-alt border border-line text-brand-ink flex items-center justify-center font-bold text-lg">
                    {member.name.charAt(0)}
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-field text-brand-ink font-bold text-xs border border-line">
                    {member.relationship_role}
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-ink">{member.name}</h3>
                  <span className="text-xs text-ink-muted">{member.age || t('common.na')}</span>
                </div>

                {/* Member Individual Language Preference */}
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-field border border-line text-[11px]">
                  <span className="flex items-center gap-1.5 text-ink-muted font-medium">
                    <Globe className="w-3.5 h-3.5 text-brand-ink shrink-0" />
                    <span>{t('family.member_lang')}</span>
                  </span>
                  {canEdit && isApiConnected ? (
                    <select
                      aria-label={`${member.name} ${t('family.member_lang')}`}
                      value={memberLang}
                      onChange={(e) => handleMemberLangChange(member.id, e.target.value as Language)}
                      className="bg-surface text-brand-ink font-bold rounded-lg px-2 py-1 border border-line-strong outline-none focus:border-brand cursor-pointer"
                    >
                      {SUPPORTED_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>{l.nativeName}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-bold text-brand-ink">
                      {LANGUAGE_MAP[memberLang]?.nativeName || memberLang}
                    </span>
                  )}
                </div>

                {member.allergies && member.allergies !== 'None' && (
                  <div className="p-2.5 rounded-xl bg-danger/15 border border-danger/50 text-xs text-danger-ink flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span><strong>{t('family.allergies')}:</strong> {member.allergies}</span>
                  </div>
                )}

                {member.notes && (
                  <p className="text-xs text-ink-muted leading-relaxed bg-field p-3 rounded-xl border border-line">
                    {member.notes}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2 text-center text-xs pt-2">
                  <div className="p-2.5 rounded-xl bg-field border border-line">
                    <span className="block text-base font-extrabold text-ink">{memberMeds.length}</span>
                    <span className="text-[10px] text-ink-muted">{t('dashboard.stat_total')}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-field border border-line">
                    <span className={`block text-base font-extrabold ${expiringMeds.length > 0 ? 'text-danger-ink' : 'text-brand-ink'}`}>
                      {expiringMeds.length}
                    </span>
                    <span className="text-[10px] text-ink-muted">{t('dashboard.stat_expiring')}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setActiveMemberFilter(member.id);
                  setActiveTab('cabinet');
                }}
                className="w-full py-2.5 rounded-xl bg-field hover:bg-surface-alt text-brand-ink font-bold text-xs border border-brand/40 transition-colors flex items-center justify-center gap-1.5"
              >
                <span>{t('family.view_cabinet')}</span>
                <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add Member Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-surface border-2 border-brand p-6 shadow-elevated space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-bold text-base text-ink">{t('family.add_modal_title')}</h3>
              <button
                type="button"
                aria-label={t('common.cancel')}
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-ink-muted hover:text-ink"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddMember} className="space-y-3 text-xs">
              <div>
                <label className="block text-ink font-semibold mb-1">{t('auth.full_name')} *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Ramesh Raman"
                  className="medora-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink font-semibold mb-1">{t('auth.role')}</label>
                  <select
                    value={formData.relationship_role}
                    onChange={(e) => setFormData({ ...formData, relationship_role: e.target.value })}
                    className="medora-select w-full"
                  >
                    <option value="Self">Self</option>
                    <option value="Spouse">Spouse</option>
                    <option value="Mother">Mother</option>
                    <option value="Father">Father</option>
                    <option value="Child">Child</option>
                    <option value="Grandparent">Grandparent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-ink font-semibold mb-1">{t('family.member_lang')}</label>
                  <select
                    value={formData.preferred_language}
                    onChange={(e) => setFormData({ ...formData, preferred_language: e.target.value as Language })}
                    className="medora-select w-full"
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>{l.nativeName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1">{t('family.allergies')}</label>
                <input
                  type="text"
                  value={formData.allergies}
                  onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                  placeholder="e.g. Penicillin, None"
                  className="medora-input"
                />
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1">{t('cabinet.field_notes')}</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="medora-input py-2"
                />
              </div>

              <div className="pt-3 border-t border-line flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="medora-btn-secondary"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="medora-btn-primary px-5"
                >
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
