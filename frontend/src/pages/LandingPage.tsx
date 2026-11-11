import React from 'react';
import { OrbitHero } from '../components/OrbitHero';
import { AuthPanel } from '../components/AuthPanel';
import { useAuth } from '../context/AuthContext';
import { useMedicine } from '../context/MedicineContext';
import { useLanguage } from '../i18n/LanguageContext';
import { ArrowRight, Store, ShieldCheck, Loader2 } from 'lucide-react';

export const LandingPage: React.FC = () => {
  const { t } = useLanguage();
  const { authStatus, currentUser, isAuthenticated, isApiConnected } = useAuth();
  const { setActiveTab } = useMedicine();

  return (
    <div className="space-y-12 pb-16">
      <OrbitHero />

      {authStatus === 'initializing' ? (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-surface border border-line text-xs text-ink-muted shadow-card">
            <Loader2 className="w-4 h-4 text-brand-ink animate-spin" />
            <span>Checking session...</span>
          </div>
        </section>
      ) : !isAuthenticated && isApiConnected ? (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          <div className="border-s-4 border-brand ps-4">
            <h2 className="text-2xl font-extrabold text-ink font-display">
              {t('auth.sign_in')} / {t('auth.register')}
            </h2>
            <p className="text-xs text-ink-muted mt-1">
              {t('auth.demo_note')}
            </p>
          </div>
          <AuthPanel />
        </section>
      ) : (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="p-8 medora-card flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-brand-ink uppercase">
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {isAuthenticated && currentUser
                    ? `${t('landing.signed_in_as')} ${currentUser.full_name}`
                    : t('landing.offline_active')}
                </span>
              </div>
              <h2 className="text-2xl font-extrabold text-ink font-display">
                {t('dashboard.title')}
              </h2>
              <p className="text-xs text-ink-muted max-w-xl">
                {t('landing.quick_desc')}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="medora-btn-primary px-5"
              >
                <span>{t('nav.dashboard')}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('pharmacy')}
                className="medora-btn-secondary px-5"
              >
                <Store className="w-4 h-4 text-brand-ink" />
                <span>{t('landing.explore_pharmacy')}</span>
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
