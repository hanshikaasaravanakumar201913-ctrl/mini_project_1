import React from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './i18n/LanguageContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MedicineProvider, useMedicine } from './context/MedicineContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { AuthPanel } from './components/AuthPanel';
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { CabinetPage } from './pages/CabinetPage';
import { ScanPage } from './pages/ScanPage';
import { TimelinePage } from './pages/TimelinePage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SchedulePage } from './pages/SchedulePage';
import { FamilyPage } from './pages/FamilyPage';
import { CaregiverPage } from './pages/CaregiverPage';
import { PrescriptionsPage } from './pages/PrescriptionsPage';
import { PassportPage } from './pages/PassportPage';
import { PharmacyPage } from './pages/PharmacyPage';
import { InfoEducationPage } from './pages/InfoEducationPage';
import { DisposalPage } from './pages/DisposalPage';
import { SettingsPage } from './pages/SettingsPage';
import { ShieldAlert, X } from 'lucide-react';
import { useLanguage } from './i18n/LanguageContext';

const AppContent: React.FC = () => {
  const { t } = useLanguage();
  const { activeTab } = useMedicine();
  const {
    authStatus,
    sessionExpiredMessage,
    dismissSessionExpired,
    isAuthModalOpen,
    openAuthModal,
    closeAuthModal,
  } = useAuth();

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'landing':
        return <LandingPage />;
      case 'dashboard':
        return <DashboardPage />;
      case 'cabinet':
        return <CabinetPage />;
      case 'scan':
        return <ScanPage />;
      case 'timeline':
        return <TimelinePage />;
      case 'notifications':
        return <NotificationsPage />;
      case 'schedule':
        return <SchedulePage />;
      case 'family':
        return <FamilyPage />;
      case 'caregivers':
        return <CaregiverPage />;
      case 'prescriptions':
        return <PrescriptionsPage />;
      case 'passport':
        return <PassportPage />;
      case 'pharmacy':
        return <PharmacyPage />;
      case 'education':
        return <InfoEducationPage />;
      case 'disposal':
        return <DisposalPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <LandingPage />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink transition-colors duration-200">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-xl focus:bg-brand focus:text-on-brand focus:font-bold focus:text-xs focus:shadow-elevated"
      >
        Skip to content
      </a>
      <Navbar />

      {authStatus === 'expired' && sessionExpiredMessage && (
        <div role="alert" className="bg-danger/15 border-b border-danger px-4 py-2.5 text-xs text-danger-ink">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{sessionExpiredMessage}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openAuthModal}
                className="px-3 py-1 rounded-lg bg-danger text-on-danger font-bold hover:opacity-90"
              >
                {t('auth.sign_in')}
              </button>
              <button
                type="button"
                onClick={dismissSessionExpired}
                aria-label={t('common.close')}
                className="p-1 rounded-lg text-danger-ink hover:bg-danger/15"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <main id="main-content" className="flex-1">
        {renderActiveTab()}
      </main>

      <Footer />

      {/* Shared Global Sign-In / Registration Modal accessible from any page header */}
      {isAuthModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('auth.sign_in')}
          className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm overflow-y-auto"
        >
          <div className="w-full max-w-4xl rounded-3xl bg-canvas border-2 border-brand p-5 sm:p-6 shadow-elevated my-8 space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h2 className="text-lg font-extrabold font-display text-ink">
                  {t('auth.sign_in')} / {t('auth.register')}
                </h2>
                <p className="text-xs text-ink-muted">{t('auth.demo_note')}</p>
              </div>
              <button
                type="button"
                onClick={closeAuthModal}
                aria-label={t('common.close')}
                className="p-2 rounded-xl bg-surface text-ink-muted hover:text-ink border border-line"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <AuthPanel />
          </div>
        </div>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <MedicineProvider>
            <AppContent />
          </MedicineProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
};

export default App;
