import React from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AuthPanel } from './AuthPanel';

interface AuthGateProps {
  title: string;
  children: React.ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({ title, children }) => {
  const { authStatus, currentUser, isApiConnected, sessionExpiredMessage } = useAuth();

  if (authStatus === 'initializing') {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 space-y-4 text-center">
        <div className="inline-flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-surface border border-line text-xs text-ink-muted shadow-card">
          <RefreshCw className="w-4 h-4 text-brand-ink animate-spin" />
          <span>Verifying active session...</span>
        </div>
      </div>
    );
  }

  if (isApiConnected && (!currentUser || authStatus !== 'authenticated')) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-extrabold font-display text-ink">{title}</h1>
        {authStatus === 'expired' && (
          <div role="alert" className="p-3.5 rounded-2xl bg-danger/15 border border-danger text-xs text-danger-ink flex items-center gap-2.5 font-medium">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{sessionExpiredMessage || 'Your session has expired. Please sign in again to access household data.'}</span>
          </div>
        )}
        <AuthPanel />
      </div>
    );
  }

  return <>{children}</>;
};
