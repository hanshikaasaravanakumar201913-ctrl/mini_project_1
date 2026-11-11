import React, { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';
import { useAuth } from '../context/AuthContext';
import { useMedicine } from '../context/MedicineContext';
import { ThemePreference, useTheme } from '../context/ThemeContext';
import { Language, NavigationTab, PrimarySection } from '../types';
import {
  Bell,
  LayoutDashboard,
  Pill,
  Users,
  Store,
  MoreHorizontal,
  Globe,
  Menu,
  X,
  LogOut,
  LogIn,
  Sun,
  Moon,
  Monitor,
  Loader2,
  User as UserIcon,
} from 'lucide-react';

const TAB_TO_SECTION: Record<NavigationTab, PrimarySection> = {
  landing: 'overview',
  dashboard: 'overview',
  cabinet: 'medicines',
  scan: 'medicines',
  timeline: 'medicines',
  passport: 'medicines',
  family: 'family_care',
  caregivers: 'family_care',
  prescriptions: 'family_care',
  schedule: 'family_care',
  pharmacy: 'pharmacy',
  notifications: 'more',
  disposal: 'more',
  education: 'more',
  settings: 'more',
};

export const Navbar: React.FC = () => {
  const { t, language, setLanguage } = useLanguage();
  const { themePreference, setThemePreference } = useTheme();
  const {
    authStatus,
    currentUser,
    isAuthenticated,
    isApiConnected,
    syncStatus,
    householdName,
    authorizedHouseholds,
    activeHouseholdId,
    switchHousehold,
    openAuthModal,
  } = useAuth();
  const {
    activeTab,
    setActiveTab,
    notifications,
    logout,
  } = useMedicine();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const unreadCount = isAuthenticated ? notifications.filter((n) => !n.is_read).length : 0;
  const activeSection = TAB_TO_SECTION[activeTab] || 'overview';

  const themeOptions: {
    pref: ThemePreference;
    label: string;
    shortLabel: string;
    icon: React.ReactNode;
  }[] = [
    {
      pref: 'light',
      label: t('theme.light'),
      shortLabel: t('theme.light'),
      icon: <Sun className="w-3.5 h-3.5" />,
    },
    {
      pref: 'dark',
      label: t('theme.dark'),
      shortLabel: t('theme.dark'),
      icon: <Moon className="w-3.5 h-3.5" />,
    },
    {
      pref: 'system',
      label: t('theme.system_default'),
      shortLabel: t('theme.system'),
      icon: <Monitor className="w-3.5 h-3.5" />,
    },
  ];

  const primarySections: {
    section: PrimarySection;
    defaultTab: NavigationTab;
    labelKey: string;
    icon: React.ReactNode;
  }[] = [
    {
      section: 'overview',
      defaultTab: isAuthenticated ? 'dashboard' : 'landing',
      labelKey: 'section.overview',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      section: 'medicines',
      defaultTab: 'cabinet',
      labelKey: 'section.medicines',
      icon: <Pill className="w-4 h-4" />,
    },
    {
      section: 'family_care',
      defaultTab: 'family',
      labelKey: 'section.family_care',
      icon: <Users className="w-4 h-4" />,
    },
    {
      section: 'pharmacy',
      defaultTab: 'pharmacy',
      labelKey: 'section.pharmacy',
      icon: <Store className="w-4 h-4" />,
    },
    {
      section: 'more',
      defaultTab: 'notifications',
      labelKey: 'section.more',
      icon: <MoreHorizontal className="w-4 h-4" />,
    },
  ];

  const subTabsBySection: Record<PrimarySection, { tab: NavigationTab; labelKey: string }[]> = {
    overview: [
      { tab: 'landing', labelKey: 'nav.landing' },
      { tab: 'dashboard', labelKey: 'nav.dashboard' },
    ],
    medicines: [
      { tab: 'cabinet', labelKey: 'nav.cabinet' },
      { tab: 'scan', labelKey: 'nav.scan' },
      { tab: 'timeline', labelKey: 'nav.timeline' },
      { tab: 'passport', labelKey: 'nav.passport' },
    ],
    family_care: [
      { tab: 'family', labelKey: 'nav.family' },
      { tab: 'caregivers', labelKey: 'nav.caregivers' },
      { tab: 'prescriptions', labelKey: 'nav.prescriptions' },
      { tab: 'schedule', labelKey: 'nav.schedule' },
    ],
    pharmacy: [],
    more: [
      { tab: 'notifications', labelKey: 'nav.notifications' },
      { tab: 'disposal', labelKey: 'nav.disposal' },
      { tab: 'education', labelKey: 'nav.education' },
      { tab: 'settings', labelKey: 'nav.settings' },
    ],
  };

  const handleNavClick = (tab: NavigationTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const currentSubTabs = subTabsBySection[activeSection];

  const roleBadgeLabel = (role?: string) => {
    switch (role) {
      case 'HOUSEHOLD_OWNER':
        return 'Owner';
      case 'CAREGIVER':
        return 'Caregiver';
      case 'PHARMACY_STAFF':
        return 'Pharmacy';
      case 'PLATFORM_ADMIN':
        return 'Admin';
      default:
        return role || '';
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-canvas/95 backdrop-blur-md border-b border-line transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Brand Wordmark */}
          <button
            type="button"
            onClick={() => handleNavClick(isAuthenticated ? 'dashboard' : 'landing')}
            className="flex items-center gap-2.5 text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-xl p-1 shrink-0"
            aria-label={t('nav.landing')}
          >
            <div className="w-9 h-9 rounded-xl bg-surface-alt border border-brand flex items-center justify-center text-brand-ink shrink-0">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="rgb(var(--color-brand-ink-rgb))" strokeWidth="2" strokeDasharray="3 3" />
                <circle cx="18" cy="10" r="2.5" fill="rgb(var(--color-danger-rgb))" />
                <path d="M9 15L15 9" stroke="rgb(var(--color-ink-rgb))" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <span className="font-display font-extrabold text-lg tracking-tight text-ink block leading-none">
                {t('brand.name')}
              </span>
              <span className="hidden sm:block text-[10px] text-brand-ink font-semibold tracking-wider uppercase mt-0.5">
                {isAuthenticated ? householdName || roleBadgeLabel(currentUser?.role) : t('brand.short_sub')}
              </span>
            </div>
          </button>

          {/* Clean 5-Section Desktop Primary Navigation */}
          <nav aria-label={t('section.overview')} className="hidden lg:flex items-center gap-1">
            {primarySections.map((item) => {
              const isSelected = activeSection === item.section;
              return (
                <button
                  key={item.section}
                  type="button"
                  aria-current={isSelected ? 'page' : undefined}
                  onClick={() => handleNavClick(item.defaultTab)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand whitespace-nowrap ${
                    isSelected
                      ? 'bg-surface-alt text-brand-ink border border-brand/60 shadow-card'
                      : 'text-ink-muted hover:text-ink hover:bg-surface'
                  }`}
                >
                  {item.icon}
                  <span>{t(item.labelKey)}</span>
                  {item.section === 'more' && unreadCount > 0 && (
                    <span className="px-1.5 py-0.2 bg-danger text-on-danger font-bold text-[10px] rounded-full">
                      {unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Action Bar */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Multi-household switcher when authenticated user has >1 household */}
            {isAuthenticated && authorizedHouseholds.length > 1 && (
              <select
                aria-label={t('nav.switch_household')}
                value={activeHouseholdId ?? ''}
                onChange={(e) => switchHousehold(Number(e.target.value))}
                className="hidden xl:block px-2 py-1.5 rounded-lg bg-surface text-ink text-[11px] border border-line-strong focus:border-brand outline-none"
              >
                {authorizedHouseholds.map((hh) => (
                  <option key={hh.id} value={hh.id} className="bg-surface text-ink">
                    {hh.name} ({hh.access_role})
                  </option>
                ))}
              </select>
            )}

            {/* Theme Switcher Pill (Light / Dark / System) */}
            <div
              role="radiogroup"
              aria-label={t('theme.switcher_aria')}
              className="hidden sm:inline-flex items-center p-0.5 rounded-lg bg-surface border border-line gap-0.5"
            >
              {themeOptions.map((opt) => {
                const active = themePreference === opt.pref;
                return (
                  <button
                    key={opt.pref}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={opt.label}
                    title={opt.label}
                    onClick={() => setThemePreference(opt.pref)}
                    className={`p-1.5 rounded-md transition-all flex items-center justify-center ${
                      active
                        ? 'bg-brand text-on-brand font-bold shadow-sm'
                        : 'text-ink-muted hover:text-ink hover:bg-surface-alt'
                    }`}
                  >
                    {opt.icon}
                  </button>
                );
              })}
            </div>

            {/* 13-Language Native Selector */}
            <div className="flex items-center bg-surface rounded-lg px-1.5 py-1.5 border border-line gap-1">
              <Globe className="w-3.5 h-3.5 text-brand-ink shrink-0 hidden sm:block" />
              <select
                aria-label={t('settings.select_language')}
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="bg-surface text-ink text-[11px] font-bold outline-none cursor-pointer"
              >
                {SUPPORTED_LANGUAGES.map((langMeta) => (
                  <option key={langMeta.code} value={langMeta.code} className="bg-surface text-ink">
                    {langMeta.nativeName} ({langMeta.code.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {/* API Sync Indicator */}
            <div
              className={`hidden md:flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono border ${
                isApiConnected
                  ? 'bg-success-bg text-success-ink border-success/40'
                  : 'bg-surface text-ink-muted border-line'
              }`}
              title={syncStatus}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isApiConnected ? 'bg-success' : 'bg-danger'}`} />
              <span>{isApiConnected ? t('nav.api_live') : t('nav.offline_mode')}</span>
            </div>

            {/* Notification Bell (only interactive badge count when authenticated) */}
            <button
              type="button"
              onClick={() => handleNavClick('notifications')}
              aria-label={t('nav.notifications')}
              className="relative p-2 rounded-lg bg-surface text-ink hover:text-brand-ink border border-line hover:border-brand transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -end-1 px-1.5 py-0.5 text-[9px] font-extrabold bg-danger text-on-danger rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Unified Auth Control: Initializing | Authenticated User + Logout | Sign In */}
            {authStatus === 'initializing' ? (
              <div
                aria-label="Checking authentication session"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-line text-ink-muted text-xs"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-ink" />
                <span className="text-[11px] font-medium">Session...</span>
              </div>
            ) : isAuthenticated && currentUser ? (
              <div className="hidden sm:flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleNavClick('settings')}
                  title={`${currentUser.full_name} (${currentUser.email})`}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-line hover:border-brand text-xs text-ink transition-colors"
                >
                  <UserIcon className="w-3.5 h-3.5 text-brand-ink shrink-0" />
                  <span className="max-w-[90px] truncate font-semibold">{currentUser.full_name.split(' ')[0]}</span>
                  <span className="px-1.5 py-0.2 rounded bg-surface-alt text-[9px] font-bold text-brand-ink uppercase">
                    {roleBadgeLabel(currentUser.role)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={logout}
                  aria-label={t('auth.logout')}
                  title={t('auth.logout')}
                  className="p-2 rounded-lg bg-surface border border-line hover:border-danger text-danger-ink transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 rtl:rotate-180" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={openAuthModal}
                data-testid="header-sign-in"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-on-brand font-bold text-xs whitespace-nowrap hover:opacity-90 transition-opacity"
              >
                <LogIn className="w-3.5 h-3.5 rtl:rotate-180" />
                <span>{t('auth.sign_in')}</span>
              </button>
            )}

            {/* Mobile Drawer Toggle */}
            <button
              type="button"
              aria-label={t('nav.toggle_menu')}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg bg-surface text-ink border border-line hover:border-brand transition-colors"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Clean Contextual Sub-Navigation Strip */}
        {currentSubTabs.length > 0 && (
          <div className="hidden lg:flex items-center gap-2 pb-2.5 pt-0.5 text-xs overflow-x-auto">
            {currentSubTabs.map((sub) => (
              <button
                key={sub.tab}
                type="button"
                onClick={() => handleNavClick(sub.tab)}
                className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                  activeTab === sub.tab
                    ? 'bg-brand text-on-brand shadow-sm'
                    : 'bg-surface/80 text-ink-muted hover:text-ink hover:bg-surface border border-transparent hover:border-line'
                }`}
              >
                {t(sub.labelKey)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-canvas border-b border-line px-4 pt-2 pb-6 space-y-4">
          {/* Theme Switcher in Mobile Drawer */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-brand-ink">
              {t('theme.title')}
            </div>
            <div role="radiogroup" aria-label={t('theme.switcher_aria')} className="grid grid-cols-3 gap-1.5">
              {themeOptions.map((opt) => {
                const active = themePreference === opt.pref;
                return (
                  <button
                    key={opt.pref}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setThemePreference(opt.pref)}
                    className={`px-2.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors ${
                      active
                        ? 'bg-brand text-on-brand border-brand'
                        : 'bg-surface text-ink border-line hover:border-brand'
                    }`}
                  >
                    {opt.icon}
                    <span>{opt.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {Object.entries(subTabsBySection).map(([sectionKey, items]) => (
            <div key={sectionKey} className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-brand-ink">
                {t(`section.${sectionKey}`)}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {sectionKey === 'pharmacy' ? (
                  <button
                    type="button"
                    onClick={() => handleNavClick('pharmacy')}
                    className={`px-3 py-2 rounded-xl text-start text-xs font-semibold border ${
                      activeTab === 'pharmacy'
                        ? 'bg-surface-alt text-brand-ink border-brand'
                        : 'bg-surface text-ink border-line'
                    }`}
                  >
                    {t('nav.pharmacy')}
                  </button>
                ) : (
                  items.map((item) => (
                    <button
                      key={item.tab}
                      type="button"
                      onClick={() => handleNavClick(item.tab)}
                      className={`px-3 py-2 rounded-xl text-start text-xs font-semibold border ${
                        activeTab === item.tab
                          ? 'bg-surface-alt text-brand-ink border-brand'
                          : 'bg-surface text-ink border-line'
                      }`}
                    >
                      {t(item.labelKey)}
                    </button>
                  ))
                )}
              </div>
            </div>
          ))}

          {authStatus === 'initializing' ? (
            <div className="w-full py-2.5 rounded-xl bg-surface border border-line text-center text-xs text-ink-muted">
              Verifying session...
            </div>
          ) : isAuthenticated && currentUser ? (
            <button
              type="button"
              onClick={logout}
              className="w-full py-2.5 rounded-xl bg-danger text-on-danger font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5 rtl:rotate-180" />
              <span>{t('auth.logout')} ({currentUser.full_name})</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                openAuthModal();
              }}
              className="w-full py-2.5 rounded-xl bg-brand text-on-brand font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5 rtl:rotate-180" />
              <span>{t('auth.sign_in')}</span>
            </button>
          )}
        </div>
      )}
    </header>
  );
};
