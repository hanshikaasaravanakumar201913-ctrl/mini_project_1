import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';
import { getTranslationCoverageReport } from '../i18n/translations';
import { useMedicine } from '../context/MedicineContext';
import { useAuth } from '../context/AuthContext';
import { ThemePreference, useTheme } from '../context/ThemeContext';
import { Language } from '../types';
import {
  Globe, RotateCcw, Cpu, Check, RefreshCw, Search, User, ShieldCheck, Sun, Moon, Monitor, Palette, LogIn
} from 'lucide-react';

interface CEngineStatus {
  engine_mode: string;
  native_library_path?: string | null;
  priority_queue_size: number;
  hash_table_size: number;
  hash_table_buckets?: number;
  hash_table_collisions?: number;
  linked_list_event_count: number;
}

export const SettingsPage: React.FC = () => {
  const { t, language, setLanguage, restoreDefaultLanguage } = useLanguage();
  const { themePreference, resolvedTheme, setThemePreference } = useTheme();
  const {
    authStatus,
    isAuthenticated,
    currentUser,
    isApiConnected,
    openAuthModal,
    authFetch,
  } = useAuth();
  const {
    activeHouseholdId,
    resetDemoData,
    medicines,
    refreshFromBackend,
  } = useMedicine();

  const [cStatus, setCStatus] = useState<CEngineStatus | null>(null);
  const [urgentTop, setUrgentTop] = useState<any[]>([]);
  const [lookupKey, setLookupKey] = useState<string>('1');
  const [lookupResult, setLookupResult] = useState<any | null>(null);
  const [loadingDiag, setLoadingDiag] = useState(false);

  const [profileName, setProfileName] = useState(currentUser?.full_name || '');
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [showQaTable, setShowQaTable] = useState(false);

  const coverageReport = useMemo(() => getTranslationCoverageReport(), []);

  useEffect(() => {
    if (currentUser) setProfileName(currentUser.full_name);
  }, [currentUser]);

  const loadCDiagnostics = useCallback(async () => {
    if (!isApiConnected || !isAuthenticated || !currentUser) {
      setCStatus(null);
      setUrgentTop([]);
      setLookupResult(null);
      return;
    }
    setLoadingDiag(true);
    try {
      const hhSuffix = activeHouseholdId ? `&household_id=${activeHouseholdId}` : '';
      const [stRes, pqRes] = await Promise.all([
        authFetch('/api/c-engine/status'),
        authFetch(`/api/c-engine/priority-queue/urgent?limit=5${hhSuffix}`),
      ]);
      if (stRes.ok) setCStatus(await stRes.json());
      if (pqRes.ok) {
        const pqData = await pqRes.json();
        setUrgentTop(pqData.top_events || []);
      }
    } catch {
      // Offline
    } finally {
      setLoadingDiag(false);
    }
  }, [isApiConnected, isAuthenticated, currentUser, activeHouseholdId, authFetch]);

  useEffect(() => {
    loadCDiagnostics();
    if (medicines.length > 0 && lookupKey === '1') {
      setLookupKey(String(medicines[0].id));
    }
  }, [loadCDiagnostics, medicines, lookupKey]);

  const handleHashLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isApiConnected || !lookupKey.trim() || !currentUser) return;
    const hhSuffix = activeHouseholdId ? `?household_id=${activeHouseholdId}` : '';
    const res = await authFetch(`/api/c-engine/hash-table/${encodeURIComponent(lookupKey.trim())}${hhSuffix}`);
    if (res.ok) setLookupResult(await res.json());
  };

  const handleRepopulateC = async () => {
    if (!isApiConnected || !currentUser) return;
    await authFetch('/api/c-engine/repopulate', { method: 'POST' });
    await loadCDiagnostics();
  };

  const saveLanguageToProfile = async () => {
    if (!currentUser || !isApiConnected) return;
    const res = await authFetch('/api/auth/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: profileName || currentUser.full_name, preferred_language: language }),
    });
    if (res.ok) {
      setProfileMsg(`Saved ${language.toUpperCase()} preference to ${currentUser.email}.`);
      await refreshFromBackend();
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveLanguageToProfile();
  };

  const handleResetData = async () => {
    if (confirm(t('settings.reseed_btn') + '?')) {
      await resetDemoData();
      await loadCDiagnostics();
    }
  };

  const themeCards: {
    pref: ThemePreference;
    label: string;
    swatchBg: string;
    swatchCard: string;
    swatchAccent: string;
    icon: React.ReactNode;
  }[] = [
    {
      pref: 'dark',
      label: t('theme.dark'),
      swatchBg: 'bg-[#0E393D]',
      swatchCard: 'bg-[#14464B] border-[#195A5F]',
      swatchAccent: 'bg-[#12B8B0]',
      icon: <Moon className="w-4 h-4" />,
    },
    {
      pref: 'light',
      label: t('theme.light'),
      swatchBg: 'bg-[#F7F9F7]',
      swatchCard: 'bg-[#FFFFFF] border-[#CFE0DA]',
      swatchAccent: 'bg-[#087F7A]',
      icon: <Sun className="w-4 h-4" />,
    },
    {
      pref: 'system',
      label: t('theme.system_default'),
      swatchBg: 'bg-gradient-to-r from-[#0E393D] 50% to-[#F7F9F7] 50%',
      swatchCard: 'bg-surface border-line',
      swatchAccent: 'bg-brand',
      icon: <Monitor className="w-4 h-4" />,
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="border-b border-line pb-5">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink font-display">
          {t('settings.title')}
        </h1>
        <p className="text-xs sm:text-sm text-ink-muted mt-1">
          {t('settings.subtitle')}
        </p>
      </div>

      {/* Appearance & Theme Selector */}
      <div className="p-6 medora-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-alt border border-line text-brand-ink flex items-center justify-center shrink-0">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-ink">{t('theme.title')}</h2>
              <p className="text-xs text-ink-muted">{t('theme.subtitle')}</p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-field border border-line text-[11px] font-mono font-bold text-brand-ink uppercase">
            {resolvedTheme === 'light' ? t('theme.light') : t('theme.dark')}
          </span>
        </div>

        <div role="radiogroup" aria-label={t('theme.switcher_aria')} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {themeCards.map((card) => {
            const isSelected = themePreference === card.pref;
            return (
              <button
                key={card.pref}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setThemePreference(card.pref)}
                className={`p-3.5 rounded-2xl text-start border transition-all space-y-2.5 ${
                  isSelected
                    ? 'bg-field border-2 border-brand shadow-card'
                    : 'bg-field/60 border-line hover:border-brand/60'
                }`}
              >
                <div className={`h-10 rounded-xl border p-2 flex items-center justify-between ${card.swatchBg} border-line`}>
                  <span className={`w-10 h-3 rounded border ${card.swatchCard}`} />
                  <span className={`w-3 h-3 rounded-full ${card.swatchAccent}`} />
                </div>
                <div className="flex items-center justify-between gap-2 text-xs font-bold text-ink">
                  <span className="flex items-center gap-1.5">
                    {card.icon}
                    <span>{card.label}</span>
                  </span>
                  {isSelected && <Check className="w-4 h-4 text-brand-ink shrink-0" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 13-Language Selector with Live Preview, Profile Save, Restore Default & QA Report */}
      <div className="p-6 medora-card space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-alt border border-line text-brand-ink flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-ink">{t('settings.select_language')}</h3>
              <p className="text-xs text-ink-muted">{t('settings.preview_save_note')}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={restoreDefaultLanguage}
              className="medora-btn-secondary bg-field"
            >
              {t('settings.restore_default_lang')}
            </button>
            {currentUser && isApiConnected && (
              <button
                type="button"
                onClick={saveLanguageToProfile}
                className="medora-btn-primary"
              >
                {t('settings.save_lang_profile')}
              </button>
            )}
          </div>
        </div>

        {profileMsg && (
          <div className="p-2.5 rounded-xl bg-field border border-brand text-xs text-brand-ink font-medium">
            {profileMsg}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {SUPPORTED_LANGUAGES.map((langItem) => {
            const isActive = language === langItem.code;
            return (
              <button
                key={langItem.code}
                type="button"
                onClick={() => setLanguage(langItem.code as Language)}
                className={`p-3.5 rounded-2xl text-start border transition-all flex flex-col justify-between gap-2 ${
                  isActive
                    ? 'bg-field border-2 border-brand shadow-card'
                    : 'bg-field/60 border-line hover:border-brand/60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-bold text-sm text-ink block">{langItem.nativeName}</span>
                    <span className="text-[11px] text-ink-muted">
                      {langItem.englishName} ({langItem.script})
                    </span>
                  </div>
                  {isActive && <Check className="w-4 h-4 text-brand-ink shrink-0" />}
                </div>
                <div className="flex flex-wrap gap-1">
                  {langItem.direction === 'rtl' && (
                    <span className="px-1.5 py-0.5 rounded bg-danger/15 text-danger-ink text-[10px] font-bold">
                      {t('settings.rtl_badge')}
                    </span>
                  )}
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      langItem.reviewStatus === 'AUDITED_BASELINE'
                        ? 'bg-success-bg text-success-ink'
                        : 'bg-surface-alt text-ink-muted'
                    }`}
                  >
                    {langItem.reviewStatus === 'AUDITED_BASELINE'
                      ? t('settings.review_baseline_badge')
                      : t('settings.review_pending_badge')}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="pt-2 border-t border-line flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-ink-muted">
            <ShieldCheck className="w-4 h-4 text-brand-ink" />
            <span>
              Translation Coverage: {coverageReport.length} locales •{' '}
              {coverageReport[0]?.totalKeys || 0} UI keys synchronized
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowQaTable((v) => !v)}
            className="text-brand-ink font-bold hover:underline"
          >
            {showQaTable ? 'Hide QA Coverage Matrix' : 'Inspect QA Coverage Matrix'}
          </button>
        </div>

        {showQaTable && (
          <div className="overflow-x-auto rounded-2xl border border-line bg-field">
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="border-b border-line text-brand-ink bg-surface-alt/60">
                  <th className="p-2.5 text-start">Locale</th>
                  <th className="p-2.5 text-start">Script / Dir</th>
                  <th className="p-2.5 text-start">Keys</th>
                  <th className="p-2.5 text-start">Missing</th>
                  <th className="p-2.5 text-start">Review Status</th>
                </tr>
              </thead>
              <tbody>
                {coverageReport.map((row) => (
                  <tr key={row.code} className="border-b border-line/50 last:border-0">
                    <td className="p-2.5 font-semibold text-ink">
                      {row.nativeName} ({row.code})
                    </td>
                    <td className="p-2.5 font-mono text-ink-muted">{row.direction.toUpperCase()}</td>
                    <td className="p-2.5 font-mono text-brand-ink font-semibold">
                      {row.translatedKeys}/{row.totalKeys} ({row.coveragePercent}%)
                    </td>
                    <td className="p-2.5 font-mono text-ink-muted">{row.missingKeys.length}</td>
                    <td className="p-2.5 text-ink-muted">{row.reviewStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* User Profile & Auth Status */}
      {isAuthenticated && currentUser ? (
        <form onSubmit={handleSaveProfile} className="p-6 medora-card space-y-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-alt border border-line text-brand-ink flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-ink">{currentUser.full_name} ({currentUser.role})</h3>
              <span className="text-ink-muted font-mono">{currentUser.email}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="medora-input flex-1 min-w-[200px]"
            />
            <button type="submit" className="medora-btn-primary">
              {t('common.save')}
            </button>
          </div>
        </form>
      ) : isApiConnected && authStatus !== 'initializing' ? (
        <div className="p-6 medora-card flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-alt border border-line text-ink-muted flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-ink">
                {authStatus === 'expired' ? 'Session Expired' : 'Account & Household Profile'}
              </h3>
              <p className="text-ink-muted">
                {authStatus === 'expired'
                  ? 'Your authentication session expired. Sign in again to sync preferences and view household diagnostics.'
                  : 'Sign in to save your preferred language to your profile and inspect private household C99 diagnostics.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openAuthModal()}
            className="medora-btn-primary"
          >
            <LogIn className="w-4 h-4" />
            <span>{t('auth.sign_in')}</span>
          </button>
        </div>
      ) : null}

      {/* C99 Diagnostics */}
      <div className="p-6 medora-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-alt border border-line text-brand-ink flex items-center justify-center">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-ink">{t('settings.c_module_title')}</h3>
              <span className="text-xs text-ink-muted">{t('settings.academic_note')}</span>
            </div>
          </div>

          {isApiConnected && (currentUser?.role === 'HOUSEHOLD_OWNER' || currentUser?.role === 'PLATFORM_ADMIN') && (
            <button
              type="button"
              onClick={handleRepopulateC}
              className="medora-btn-secondary bg-field text-brand-ink border-brand/40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingDiag ? 'animate-spin' : ''}`} />
              <span>{t('settings.resync_c')}</span>
            </button>
          )}
        </div>

        <div className="p-3 rounded-xl bg-field border border-line text-xs flex justify-between">
          <span className="text-ink-muted">{t('settings.exec_mode')}</span>
          <span className="font-mono font-bold text-brand-ink">
            {authStatus === 'initializing'
              ? t('common.loading')
              : !isApiConnected
              ? t('common.na')
              : authStatus === 'expired'
              ? 'Session Expired'
              : isAuthenticated && currentUser
              ? cStatus?.engine_mode || t('common.loading')
              : t('auth.sign_in')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-field border border-line space-y-1">
            <strong className="text-brand-ink block">1. Min-Heap Priority Queue</strong>
            <span className="text-ink-muted block">O(log n) Insert / Extract, O(1) Peek</span>
            <span className="text-[11px] font-mono text-ink font-semibold">
              {cStatus ? cStatus.priority_queue_size : t('common.na')}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-field border border-line space-y-1">
            <strong className="text-brand-ink block">2. Hash Table (djb2)</strong>
            <span className="text-ink-muted block">O(1) Avg Separate Chaining</span>
            <span className="text-[11px] font-mono text-ink font-semibold">
              {cStatus ? `${cStatus.hash_table_size} (${cStatus.hash_table_collisions ?? 0})` : t('common.na')}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-field border border-line space-y-1">
            <strong className="text-brand-ink block">3. Singly Linked List</strong>
            <span className="text-ink-muted block">O(1) Append / Prepend Audit Log</span>
            <span className="text-[11px] font-mono text-ink font-semibold">
              {cStatus ? cStatus.linked_list_event_count : t('common.na')}
            </span>
          </div>
        </div>

        {isApiConnected && urgentTop.length > 0 && (
          <div className="space-y-1.5 text-xs">
            {urgentTop.map((ev, idx) => (
              <div key={idx} className="p-2.5 rounded-xl bg-field border border-line flex justify-between">
                <span>
                  <span className="font-mono text-brand-ink me-2">[{ev.event_type}]</span>
                  <strong className="text-ink">{ev.medicine_name}</strong>
                </span>
                <span className="font-mono font-bold text-danger-ink">{ev.days_until_expiry}d</span>
              </div>
            ))}
          </div>
        )}

        {isApiConnected && currentUser && (
          <form onSubmit={handleHashLookup} className="space-y-2 text-xs">
            <div className="flex gap-2">
              <input
                type="text"
                value={lookupKey}
                onChange={(e) => setLookupKey(e.target.value)}
                className="medora-input flex-1 font-mono"
              />
              <button type="submit" className="medora-btn-primary">
                <Search className="w-3.5 h-3.5" />
                <span>{t('common.search')}</span>
              </button>
            </div>
            {lookupResult && (
              <pre className="p-3 rounded-xl bg-field border border-line text-[11px] font-mono text-brand-ink overflow-x-auto">
                {JSON.stringify(lookupResult, null, 2)}
              </pre>
            )}
          </form>
        )}
      </div>

      {(!isApiConnected || currentUser?.role === 'PLATFORM_ADMIN' || currentUser?.role === 'HOUSEHOLD_OWNER') && (
        <div className="p-6 medora-card space-y-3">
          <button
            type="button"
            onClick={handleResetData}
            className="px-5 py-2.5 rounded-xl bg-danger text-on-danger font-bold text-xs flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{t('settings.reseed_btn')}</span>
          </button>
        </div>
      )}
    </div>
  );
};
