import React, { useState } from 'react';
import { Lock, Mail, UserPlus, LogIn, KeyRound, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useMedicine } from '../context/MedicineContext';

export const AuthPanel: React.FC = () => {
  const { t, language } = useLanguage();
  const { login, register, authError } = useMedicine();

  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'HOUSEHOLD_OWNER' | 'CAREGIVER' | 'PHARMACY_STAFF'>('HOUSEHOLD_OWNER');
  const [householdName, setHouseholdName] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await login({ email, password });
    setSubmitting(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await register({
      email,
      password,
      full_name: fullName,
      role,
      household_name: role === 'HOUSEHOLD_OWNER' ? householdName : undefined,
      preferred_language: language,
    });
    setSubmitting(false);
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotMsg(null);
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (data.dev_reset_token) {
      setResetToken(data.dev_reset_token);
      setForgotMsg(`Development reset token generated: ${data.dev_reset_token} (${data.dev_notice})`);
    } else {
      setForgotMsg(data.message || 'Check your email for reset instructions.');
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, new_password: newPassword }),
    });
    const data = await res.json();
    if (res.ok) {
      setForgotMsg('Password updated! You can now sign in with your new password.');
      setMode('login');
    } else {
      setForgotMsg(data.detail || 'Reset failed.');
    }
  };

  const demoAccounts = [
    { label: 'Household Owner', email: 'owner@medora.demo', pw: 'MedoraOwner!2026', desc: 'Raman Household full access' },
    { label: 'Caregiver', email: 'caregiver@medora.demo', pw: 'MedoraCare!2026', desc: 'Authorized caregiver permissions' },
    { label: 'Pharmacy Staff', email: 'pharmacy@medora.demo', pw: 'MedoraPharm!2026', desc: 'CareWell Demo Pharmacy portal' },
    { label: 'Admin', email: 'admin@medora.demo', pw: 'MedoraAdmin!2026', desc: 'Verify partner pharmacies' },
  ];

  return (
    <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Main Auth Form */}
      <div className="lg:col-span-7 p-6 sm:p-8 medora-card space-y-5">
        <div className="flex flex-wrap gap-2 border-b border-line pb-3">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
              mode === 'login' ? 'bg-brand text-on-brand' : 'bg-field text-ink-muted hover:text-ink border border-line'
            }`}
          >
            <LogIn className="w-3.5 h-3.5 rtl:rotate-180" />
            <span>{t('auth.sign_in')}</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
              mode === 'register' ? 'bg-brand text-on-brand' : 'bg-field text-ink-muted hover:text-ink border border-line'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{t('auth.register')}</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('forgot')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors ${
              mode === 'forgot' ? 'bg-danger text-on-danger' : 'bg-field text-ink-muted hover:text-ink border border-line'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{t('auth.forgot_password')}</span>
          </button>
        </div>

        {authError && (
          <div role="alert" className="p-3 rounded-xl bg-danger/15 border border-danger text-xs text-danger-ink font-medium">
            {authError}
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            <div>
              <label htmlFor="login-email" className="block text-ink font-semibold mb-1">
                {t('auth.email')}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-brand-ink absolute start-3 top-2.5" />
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="medora-input ps-9"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-ink font-semibold mb-1">
                {t('auth.password')}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-brand-ink absolute start-3 top-2.5" />
                <input
                  id="login-password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="medora-input ps-9"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="medora-btn-primary w-full"
            >
              {submitting ? '...' : t('auth.sign_in')}
            </button>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-ink font-semibold mb-1">{t('auth.full_name')} *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="medora-input"
                />
              </div>
              <div>
                <label className="block text-ink font-semibold mb-1">{t('auth.role')}</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="medora-select w-full"
                >
                  <option value="HOUSEHOLD_OWNER">{t('auth.role_owner')}</option>
                  <option value="CAREGIVER">{t('auth.role_caregiver')}</option>
                  <option value="PHARMACY_STAFF">{t('auth.role_pharmacy')}</option>
                </select>
              </div>
            </div>

            {role === 'HOUSEHOLD_OWNER' && (
              <div>
                <label className="block text-ink font-semibold mb-1">{t('auth.household_name')}</label>
                <input
                  type="text"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  placeholder="e.g. Raman Household"
                  className="medora-input"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-ink font-semibold mb-1">{t('auth.email')} *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="medora-input"
                />
              </div>
              <div>
                <label className="block text-ink font-semibold mb-1">{t('auth.password')} *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="medora-input"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="medora-btn-primary w-full"
            >
              {submitting ? '...' : t('auth.register')}
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <div className="space-y-4 text-xs">
            <form onSubmit={handleRequestReset} className="space-y-2">
              <label className="block text-ink font-semibold">{t('auth.email')}</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="medora-input flex-1"
                />
                <button type="submit" className="medora-btn-secondary font-bold text-brand-ink shrink-0">
                  {t('auth.send_reset')}
                </button>
              </div>
            </form>

            {forgotMsg && (
              <div className="p-3 rounded-xl bg-field border border-brand/50 text-brand-ink break-all">
                {forgotMsg}
              </div>
            )}

            <form onSubmit={handleConfirmReset} className="space-y-2 pt-2 border-t border-line">
              <input
                type="text"
                required
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                placeholder={t('auth.reset_token')}
                className="medora-input font-mono"
              />
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('auth.new_password')}
                className="medora-input"
              />
              <button type="submit" className="w-full py-2.5 rounded-xl bg-danger text-on-danger font-bold hover:opacity-90 transition-opacity">
                {t('auth.confirm_reset')}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Clearly Labeled Demo Evaluation Accounts */}
      <div className="lg:col-span-5 p-6 medora-card space-y-3 text-xs">
        <div className="flex items-center gap-2 text-brand-ink font-bold">
          <ShieldCheck className="w-4 h-4" />
          <span>{t('auth.demo_accounts')}</span>
        </div>
        <p className="text-ink-muted">
          {t('auth.demo_note')}
        </p>
        <div className="space-y-2">
          {demoAccounts.map((acc) => (
            <button
              key={acc.email}
              type="button"
              onClick={() => login({ email: acc.email, password: acc.pw })}
              className="w-full p-3 rounded-xl bg-field hover:bg-surface-alt border border-line hover:border-brand text-start transition-colors"
            >
              <div className="flex justify-between items-center">
                <strong className="text-ink">{acc.label}</strong>
                <span className="text-[10px] font-mono font-bold text-brand-ink">{t('auth.sign_in')}</span>
              </div>
              <span className="block text-[11px] font-mono text-ink-muted">{acc.email}</span>
              <span className="block text-[10px] text-ink-muted/85">{acc.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
