import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  AuthorizedHouseholdSummary,
  CaregiverPermissions,
  UserProfile,
} from '../types';
import { useLanguage } from '../i18n/LanguageContext';

export type AuthStatus = 'initializing' | 'authenticated' | 'unauthenticated' | 'expired';

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role: string;
  household_name?: string;
  preferred_language?: string;
}

export const TOKEN_STORAGE_KEY = 'medora_auth_token';
export const HOUSEHOLD_STORAGE_KEY = 'medora_household_id';

const HOUSEHOLD_CACHE_KEYS = [
  'medora_members',
  'medora_medicines',
  'medora_notifications',
  'medora_schedules',
  'medora_disposal',
  'medora_history',
];

export function clearPrivateLocalCaches(): void {
  if (typeof window === 'undefined') return;
  for (const key of HOUSEHOLD_CACHE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage removal errors
    }
  }
}

interface AuthContextValue {
  authStatus: AuthStatus;
  isAuthenticated: boolean;
  isAuthInitializing: boolean;
  isSessionExpired: boolean;
  authToken: string | null;
  currentUser: UserProfile | null;
  activeHouseholdId: number | null;
  householdName: string | null;
  accessRole: string | null;
  permissions: CaregiverPermissions | null;
  authorizedHouseholds: AuthorizedHouseholdSummary[];
  pharmacyId: number | null;
  sessionExpiresAt: string | null;
  isApiConnected: boolean;
  syncStatus: string;
  authError: string | null;
  sessionExpiredMessage: string | null;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  dismissSessionExpired: () => void;
  login: (creds: AuthCredentials) => Promise<boolean>;
  register: (payload: RegisterPayload) => Promise<boolean>;
  logout: () => Promise<void>;
  switchHousehold: (householdId: number) => Promise<void>;
  refreshSession: (tokenOverride?: string | null, hhOverride?: number | null) => Promise<boolean>;
  authFetch: (url: string, init?: RequestInit, tokenOverride?: string | null) => Promise<Response>;
  expireSession: (reason?: string) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { bindUserLanguageScope } = useLanguage();

  const [authStatus, setAuthStatus] = useState<AuthStatus>('initializing');
  const [authToken, setAuthToken] = useState<string | null>(() =>
    typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_STORAGE_KEY) : null
  );
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [activeHouseholdId, setActiveHouseholdId] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = window.localStorage.getItem(HOUSEHOLD_STORAGE_KEY);
    return saved ? Number(saved) : null;
  });
  const [householdName, setHouseholdName] = useState<string | null>(null);
  const [accessRole, setAccessRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<CaregiverPermissions | null>(null);
  const [authorizedHouseholds, setAuthorizedHouseholds] = useState<AuthorizedHouseholdSummary[]>([]);
  const [pharmacyId, setPharmacyId] = useState<number | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [isApiConnected, setIsApiConnected] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string>('Checking API...');
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  const clearSessionState = useCallback((nextStatus: 'unauthenticated' | 'expired', expiredMsg?: string) => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(HOUSEHOLD_STORAGE_KEY);
      clearPrivateLocalCaches();
    }
    setAuthToken(null);
    setCurrentUser(null);
    setActiveHouseholdId(null);
    setHouseholdName(null);
    setAccessRole(null);
    setPermissions(null);
    setAuthorizedHouseholds([]);
    setPharmacyId(null);
    setSessionExpiresAt(null);
    setAuthStatus(nextStatus);
    if (nextStatus === 'expired') {
      setSessionExpiredMessage(expiredMsg || 'Your session has expired or been revoked. Please sign in again.');
    } else {
      setSessionExpiredMessage(null);
    }
  }, []);

  const expireSession = useCallback(
    (reason?: string) => {
      clearSessionState('expired', reason);
    },
    [clearSessionState]
  );

  const rawFetchWithToken = useCallback(
    async (url: string, init: RequestInit = {}, tokenOverride?: string | null): Promise<Response> => {
      const tok = tokenOverride !== undefined ? tokenOverride : authToken;
      const headers = new Headers(init.headers || {});
      if (tok) {
        headers.set('Authorization', `Bearer ${tok}`);
      }
      return fetch(url, { ...init, headers });
    },
    [authToken]
  );

  const authFetch = useCallback(
    async (url: string, init: RequestInit = {}, tokenOverride?: string | null): Promise<Response> => {
      const tok = tokenOverride !== undefined ? tokenOverride : authToken;
      const res = await rawFetchWithToken(url, init, tokenOverride);
      if (res.status === 401 && tok) {
        clearSessionState('expired', 'Your session expired or was revoked. Please sign in again.');
      }
      return res;
    },
    [authToken, rawFetchWithToken, clearSessionState]
  );

  const refreshSession = useCallback(
    async (tokenOverride?: string | null, hhOverride?: number | null): Promise<boolean> => {
      try {
        const healthRes = await fetch('/api/health');
        if (!healthRes.ok) {
          setIsApiConnected(false);
          setSyncStatus('Offline Cache Active');
          setAuthStatus('unauthenticated');
          return false;
        }

        setIsApiConnected(true);
        setSyncStatus('Connected to FastAPI Backend');

        const tok = tokenOverride !== undefined ? tokenOverride : authToken;
        if (!tok) {
          clearSessionState('unauthenticated');
          return false;
        }

        const meRes = await rawFetchWithToken('/api/auth/me', {}, tok);
        if (meRes.status === 401) {
          clearSessionState('expired', 'Your saved session is no longer valid. Please sign in again.');
          return false;
        }
        if (!meRes.ok) {
          setAuthStatus('unauthenticated');
          return false;
        }

        const meData = await meRes.json();
        setAuthToken(tok);
        setCurrentUser(meData.user);
        const resolvedHh = hhOverride !== undefined ? hhOverride : meData.household_id;
        setActiveHouseholdId(resolvedHh || null);
        if (resolvedHh && typeof window !== 'undefined') {
          window.localStorage.setItem(HOUSEHOLD_STORAGE_KEY, String(resolvedHh));
        }
        setHouseholdName(meData.household_name || null);
        setAccessRole(meData.access_role || null);
        setPermissions(meData.permissions || null);
        setAuthorizedHouseholds(meData.authorized_households || []);
        setPharmacyId(meData.pharmacy_id || null);
        setSessionExpiresAt(meData.session_expires_at || null);
        setSessionExpiredMessage(null);
        setAuthStatus('authenticated');
        return true;
      } catch {
        setIsApiConnected(false);
        setSyncStatus('Offline Cache Active');
        setAuthStatus('unauthenticated');
        return false;
      }
    },
    [authToken, rawFetchWithToken, clearSessionState]
  );

  const didBootRef = useRef(false);

  useEffect(() => {
    if (didBootRef.current) return;
    didBootRef.current = true;
    refreshSession();
  }, [refreshSession]);

  // Synchronize auth state cleanly across open browser tabs
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === TOKEN_STORAGE_KEY) {
        if (!e.newValue) {
          clearSessionState('unauthenticated');
        } else if (e.newValue !== authToken) {
          refreshSession(e.newValue);
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [authToken, clearSessionState, refreshSession]);

  useEffect(() => {
    bindUserLanguageScope(currentUser?.id ?? null, currentUser?.preferred_language ?? null);
  }, [currentUser?.id, currentUser?.preferred_language, bindUserLanguageScope]);

  const login = async (creds: AuthCredentials): Promise<boolean> => {
    setAuthError(null);
    setSessionExpiredMessage(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.detail || 'Invalid credentials.');
        return false;
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, data.access_token);
        if (data.household_id) {
          window.localStorage.setItem(HOUSEHOLD_STORAGE_KEY, String(data.household_id));
        }
      }
      setAuthToken(data.access_token);
      setCurrentUser(data.user);
      setActiveHouseholdId(data.household_id || null);
      setHouseholdName(data.household_name || null);
      setAccessRole(data.access_role || null);
      setPermissions(data.permissions || null);
      setPharmacyId(data.pharmacy_id || null);
      setSessionExpiresAt(data.expires_at || null);
      setIsApiConnected(true);
      setAuthStatus('authenticated');
      setIsAuthModalOpen(false);
      await refreshSession(data.access_token, data.household_id || null);
      return true;
    } catch {
      setAuthError('Unable to reach backend authentication service.');
      return false;
    }
  };

  const register = async (payload: RegisterPayload): Promise<boolean> => {
    setAuthError(null);
    setSessionExpiredMessage(null);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.detail || 'Registration failed.');
        return false;
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, data.access_token);
        if (data.household_id) {
          window.localStorage.setItem(HOUSEHOLD_STORAGE_KEY, String(data.household_id));
        }
      }
      setAuthToken(data.access_token);
      setCurrentUser(data.user);
      setActiveHouseholdId(data.household_id || null);
      setIsApiConnected(true);
      setAuthStatus('authenticated');
      setIsAuthModalOpen(false);
      await refreshSession(data.access_token, data.household_id || null);
      return true;
    } catch {
      setAuthError('Unable to reach backend registration service.');
      return false;
    }
  };

  const logout = async () => {
    if (authToken && isApiConnected) {
      try {
        await rawFetchWithToken('/api/auth/logout', { method: 'POST' }, authToken);
      } catch {
        // Ignore network errors on logout
      }
    }
    clearSessionState('unauthenticated');
  };

  const switchHousehold = async (householdId: number) => {
    setActiveHouseholdId(householdId);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(HOUSEHOLD_STORAGE_KEY, String(householdId));
    }
    await refreshSession(authToken, householdId);
  };

  return (
    <AuthContext.Provider
      value={{
        authStatus,
        isAuthenticated: authStatus === 'authenticated' && Boolean(currentUser),
        isAuthInitializing: authStatus === 'initializing',
        isSessionExpired: authStatus === 'expired',
        authToken,
        currentUser,
        activeHouseholdId,
        householdName,
        accessRole,
        permissions,
        authorizedHouseholds,
        pharmacyId,
        sessionExpiresAt,
        isApiConnected,
        syncStatus,
        authError,
        sessionExpiredMessage,
        isAuthModalOpen,
        openAuthModal: () => setIsAuthModalOpen(true),
        closeAuthModal: () => setIsAuthModalOpen(false),
        dismissSessionExpired: () => {
          setSessionExpiredMessage(null);
          if (authStatus === 'expired') {
            setAuthStatus('unauthenticated');
          }
        },
        login,
        register,
        logout,
        switchHousehold,
        refreshSession,
        authFetch,
        expireSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};
