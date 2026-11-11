import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  AuthorizedHouseholdSummary,
  CaregiverAccess,
  CaregiverInvitation,
  CaregiverPermissions,
  DashboardSummary,
  DataSource,
  DisposalRecord,
  ExpiryNotification,
  HouseholdMember,
  MedicationSchedule,
  MedicineEventHistory,
  MedicineRecord,
  NavigationTab,
  PharmacyOrderRecord,
  PrescriptionRecord,
  RefillPrediction,
  RefillRequestRecord,
  UserProfile,
} from '../types';
import { getInitialDemonstrationData } from '../utils/sampleData';
import { calculateDaysUntilExpiry, getExpiryStatus } from '../utils/dateUtils';
import { AuthCredentials, AuthStatus, RegisterPayload, useAuth } from './AuthContext';

interface MedicineContextType {
  // Centralized Auth & Access (mirrored cleanly from AuthContext)
  authStatus: AuthStatus;
  authToken: string | null;
  currentUser: UserProfile | null;
  activeHouseholdId: number | null;
  householdName: string | null;
  accessRole: string | null;
  permissions: CaregiverPermissions | null;
  authorizedHouseholds: AuthorizedHouseholdSummary[];
  pharmacyId: number | null;
  authError: string | null;

  // Navigation & Deep-Linking
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  pharmacyPrefillQuery: string;
  setPharmacyPrefillQuery: (q: string) => void;

  // Data Collections
  medicines: MedicineRecord[];
  members: HouseholdMember[];
  notifications: ExpiryNotification[];
  schedules: MedicationSchedule[];
  disposalRecords: DisposalRecord[];
  eventHistory: MedicineEventHistory[];
  prescriptions: PrescriptionRecord[];
  refillPredictions: RefillPrediction[];
  caregivers: CaregiverAccess[];
  householdInvitations: CaregiverInvitation[];
  myInvitations: CaregiverInvitation[];
  householdOrders: PharmacyOrderRecord[];
  householdRefillRequests: RefillRequestRecord[];
  dashboardSummary: DashboardSummary;

  activeMemberFilter: number | null;
  setActiveMemberFilter: (id: number | null) => void;
  selectedMedicineForPassport: MedicineRecord | null;
  setSelectedMedicineForPassport: (med: MedicineRecord | null) => void;
  isApiConnected: boolean;
  syncStatus: string;

  // Auth Actions
  login: (creds: AuthCredentials) => Promise<boolean>;
  register: (payload: RegisterPayload) => Promise<boolean>;
  logout: () => Promise<void>;
  switchHousehold: (householdId: number) => Promise<void>;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;

  // Domain Actions
  addMedicine: (med: Partial<MedicineRecord>) => Promise<MedicineRecord>;
  updateMedicine: (id: number, updates: Partial<MedicineRecord>) => Promise<void>;
  deleteMedicine: (id: number) => Promise<void>;
  markDisposed: (medicineId: number, method: string, notes?: string, reason?: string) => Promise<void>;
  markNotificationRead: (id: number) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  addSchedule: (sched: Omit<MedicationSchedule, 'id' | 'created_at'>) => Promise<void>;
  logDose: (scheduleId: number, status: 'TAKEN' | 'SKIPPED') => Promise<void>;
  addMember: (member: Omit<HouseholdMember, 'id'>) => Promise<void>;
  adjustMedicineQuantity: (medicineId: number, newQuantity: number, notes?: string) => Promise<void>;
  resetDemoData: () => Promise<void>;
  refreshFromBackend: (tokenOverride?: string | null, hhOverride?: number | null) => Promise<void>;
}

const MedicineContext = createContext<MedicineContextType | undefined>(undefined);

export const MedicineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    authStatus,
    authToken,
    currentUser,
    activeHouseholdId,
    householdName,
    accessRole,
    permissions,
    authorizedHouseholds,
    pharmacyId,
    isApiConnected,
    syncStatus,
    authError,
    login: authLogin,
    register: authRegister,
    logout: authLogout,
    switchHousehold: authSwitchHousehold,
    refreshSession,
    authFetch,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<NavigationTab>('landing');
  const [pharmacyPrefillQuery, setPharmacyPrefillQuery] = useState<string>('');
  const [activeMemberFilter, setActiveMemberFilter] = useState<number | null>(null);
  const [selectedMedicineForPassport, setSelectedMedicineForPassport] = useState<MedicineRecord | null>(null);

  const [members, setMembers] = useState<HouseholdMember[]>(() => {
    const saved = localStorage.getItem('medora_members');
    return saved ? JSON.parse(saved) : [];
  });

  const [medicines, setMedicines] = useState<MedicineRecord[]>(() => {
    const saved = localStorage.getItem('medora_medicines');
    if (saved) {
      const parsed: MedicineRecord[] = JSON.parse(saved);
      return parsed.map((m) => {
        const days = calculateDaysUntilExpiry(m.printed_expiry_date);
        return {
          ...m,
          days_until_expiry: days,
          expiry_status: getExpiryStatus(days),
        };
      });
    }
    return [];
  });

  const [notifications, setNotifications] = useState<ExpiryNotification[]>(() => {
    const saved = localStorage.getItem('medora_notifications');
    return saved ? JSON.parse(saved) : [];
  });

  const [schedules, setSchedules] = useState<MedicationSchedule[]>(() => {
    const saved = localStorage.getItem('medora_schedules');
    return saved ? JSON.parse(saved) : [];
  });

  const [disposalRecords, setDisposalRecords] = useState<DisposalRecord[]>(() => {
    const saved = localStorage.getItem('medora_disposal');
    return saved ? JSON.parse(saved) : [];
  });

  const [eventHistory, setEventHistory] = useState<MedicineEventHistory[]>(() => {
    const saved = localStorage.getItem('medora_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [refillPredictions, setRefillPredictions] = useState<RefillPrediction[]>([]);
  const [caregivers, setCaregivers] = useState<CaregiverAccess[]>([]);
  const [householdInvitations, setHouseholdInvitations] = useState<CaregiverInvitation[]>([]);
  const [myInvitations, setMyInvitations] = useState<CaregiverInvitation[]>([]);
  const [householdOrders, setHouseholdOrders] = useState<PharmacyOrderRecord[]>([]);
  const [householdRefillRequests, setHouseholdRefillRequests] = useState<RefillRequestRecord[]>([]);

  const clearDomainCollections = useCallback(() => {
    setMedicines([]);
    setMembers([]);
    setNotifications([]);
    setSchedules([]);
    setDisposalRecords([]);
    setEventHistory([]);
    setPrescriptions([]);
    setRefillPredictions([]);
    setCaregivers([]);
    setHouseholdInvitations([]);
    setMyInvitations([]);
    setHouseholdOrders([]);
    setHouseholdRefillRequests([]);
    setSelectedMedicineForPassport(null);
    setActiveMemberFilter(null);
  }, []);

  const loadDomainDataFromBackend = useCallback(async () => {
    if (!isApiConnected) {
      // Offline demo fallback ONLY when backend is unreachable and local cache is empty
      if (medicines.length === 0 && members.length === 0) {
        const demo = getInitialDemonstrationData();
        setMembers(demo.members);
        setMedicines(demo.medicines);
        setNotifications(demo.notifications);
        setSchedules(demo.schedules);
        setDisposalRecords(demo.disposalRecords);
        setEventHistory(demo.eventHistory);
      }
      return;
    }

    if (authStatus === 'initializing') {
      return;
    }

    if (authStatus !== 'authenticated' || !authToken || !currentUser) {
      clearDomainCollections();
      return;
    }

    try {
      const myInvRes = await authFetch('/api/caregivers/invitations/mine');
      if (myInvRes.ok) {
        setMyInvitations(await myInvRes.json());
      }

      const hhParam = activeHouseholdId ? `household_id=${activeHouseholdId}` : '';
      const notifRes = await authFetch(`/api/notifications${hhParam ? `?${hhParam}` : ''}`);
      if (notifRes.ok) {
        setNotifications(await notifRes.json());
      }

      if (!activeHouseholdId) {
        setMedicines([]);
        setMembers([]);
        setSchedules([]);
        setEventHistory([]);
        setRefillPredictions([]);
        setPrescriptions([]);
        setHouseholdOrders([]);
        setHouseholdRefillRequests([]);
        setCaregivers([]);
        setHouseholdInvitations([]);
        return;
      }

      const qSuffix = `?household_id=${activeHouseholdId}`;
      const [
        medRes,
        memRes,
        schedRes,
        dispRes,
        evRes,
        refillRes,
        ordersRes,
        refReqRes,
      ] = await Promise.all([
        authFetch(`/api/medicines${qSuffix}&include_disposed=true`),
        authFetch(`/api/household/members${qSuffix}`),
        authFetch(`/api/schedules${qSuffix}`),
        authFetch(`/api/disposal/records${qSuffix}`),
        authFetch(`/api/medicines/events/recent${qSuffix}&limit=50`),
        authFetch(`/api/refill/predictions${qSuffix}`),
        authFetch(`/api/orders${qSuffix}`),
        authFetch(`/api/orders/refill-requests${qSuffix}`),
      ]);

      if (medRes.ok) {
        const remoteMeds = await medRes.json();
        setMedicines(
          remoteMeds.map((m: any) => {
            const days = calculateDaysUntilExpiry(m.printed_expiry_date);
            return {
              ...m,
              days_until_expiry: days,
              expiry_status: getExpiryStatus(days),
            };
          })
        );
      }
      if (memRes.ok) setMembers(await memRes.json());
      if (schedRes.ok) setSchedules(await schedRes.json());
      if (dispRes.ok) setDisposalRecords(await dispRes.json());
      if (evRes.ok) setEventHistory(await evRes.json());
      if (refillRes.ok) setRefillPredictions(await refillRes.json());
      if (ordersRes.ok) setHouseholdOrders(await ordersRes.json());
      if (refReqRes.ok) setHouseholdRefillRequests(await refReqRes.json());

      const prescRes = await authFetch(`/api/prescriptions${qSuffix}`);
      if (prescRes.ok) {
        setPrescriptions(await prescRes.json());
      } else {
        setPrescriptions([]);
      }

      const cgRes = await authFetch(`/api/caregivers/household${qSuffix}`);
      if (cgRes.ok) {
        const cgData = await cgRes.json();
        setCaregivers(cgData.active_caregivers || []);
        setHouseholdInvitations(cgData.invitations || []);
      } else {
        setCaregivers([]);
        setHouseholdInvitations([]);
      }
    } catch {
      // Errors handled via authFetch / offline detection
    }
  }, [
    isApiConnected,
    authStatus,
    authToken,
    currentUser,
    activeHouseholdId,
    authFetch,
    clearDomainCollections,
    medicines.length,
    members.length,
  ]);

  useEffect(() => {
    loadDomainDataFromBackend();
  }, [loadDomainDataFromBackend]);

  // Only persist offline local caches when backend is disconnected (avoid leaking private signed-out data)
  useEffect(() => {
    if (!isApiConnected && authStatus !== 'initializing') {
      localStorage.setItem('medora_members', JSON.stringify(members));
      localStorage.setItem('medora_medicines', JSON.stringify(medicines));
      localStorage.setItem('medora_notifications', JSON.stringify(notifications));
      localStorage.setItem('medora_schedules', JSON.stringify(schedules));
      localStorage.setItem('medora_disposal', JSON.stringify(disposalRecords));
      localStorage.setItem('medora_history', JSON.stringify(eventHistory));
    }
  }, [isApiConnected, authStatus, members, medicines, notifications, schedules, disposalRecords, eventHistory]);

  const refreshFromBackend = useCallback(
    async (tokenOverride?: string | null, hhOverride?: number | null) => {
      if (tokenOverride !== undefined || hhOverride !== undefined) {
        await refreshSession(tokenOverride, hhOverride);
      } else {
        await loadDomainDataFromBackend();
      }
    },
    [refreshSession, loadDomainDataFromBackend]
  );

  const login = async (creds: AuthCredentials): Promise<boolean> => {
    const ok = await authLogin(creds);
    if (ok && activeTab === 'landing') {
      const storedRole = creds.email.includes('pharmacy') ? 'PHARMACY_STAFF' : '';
      setActiveTab(storedRole === 'PHARMACY_STAFF' ? 'pharmacy' : 'dashboard');
    }
    return ok;
  };

  const register = async (payload: RegisterPayload): Promise<boolean> => {
    const ok = await authRegister(payload);
    if (ok && activeTab === 'landing') {
      setActiveTab(payload.role === 'PHARMACY_STAFF' ? 'pharmacy' : 'dashboard');
    }
    return ok;
  };

  const logout = async () => {
    await authLogout();
    clearDomainCollections();
    if (activeTab !== 'pharmacy' && activeTab !== 'education' && activeTab !== 'settings') {
      setActiveTab('landing');
    }
  };

  const switchHousehold = async (householdId: number) => {
    await authSwitchHousehold(householdId);
  };

  // Compute live dashboard metrics
  const activeMeds = medicines.filter((m) => !m.is_disposed);
  const expiringSoonCount = activeMeds.filter(
    (m) => m.days_until_expiry !== undefined && m.days_until_expiry >= 0 && m.days_until_expiry <= 10
  ).length;
  const alreadyExpiredCount = activeMeds.filter(
    (m) => m.days_until_expiry !== undefined && m.days_until_expiry < 0
  ).length;
  const lowStockCount = activeMeds.filter((m) => m.quantity <= m.stock_threshold).length;
  const unconfirmedCount = activeMeds.filter((m) => !m.is_confirmed).length;
  const upcomingRemindersCount = schedules.filter((s) => s.status === 'ACTIVE').length;
  const upcomingRefillsCount = refillPredictions.filter(
    (p) => p.remaining_days !== null && p.remaining_days !== undefined && p.remaining_days <= 7
  ).length;

  const dashboardSummary: DashboardSummary = {
    total_active_medicines: activeMeds.length,
    expiring_soon_count: expiringSoonCount,
    already_expired_count: alreadyExpiredCount,
    low_stock_count: lowStockCount,
    unconfirmed_count: unconfirmedCount,
    upcoming_reminders_count: upcomingRemindersCount,
    upcoming_refills_count: upcomingRefillsCount,
    household_members_count: members.length,
    recent_activity: eventHistory.slice(0, 6).map((e) => ({
      id: e.id,
      medicine_id: e.medicine_id,
      action: e.action,
      description: e.description,
      timestamp: e.timestamp,
    })),
  };

  const addMedicine = async (data: Partial<MedicineRecord>): Promise<MedicineRecord> => {
    const expiryDate = data.printed_expiry_date || new Date().toISOString().split('T')[0];
    const days = calculateDaysUntilExpiry(expiryDate);
    const assignedMember = members.find((m) => m.id === data.assigned_member_id);

    if (isApiConnected && authToken) {
      const hhSuffix = activeHouseholdId ? `?household_id=${activeHouseholdId}` : '';
      const res = await authFetch(`/api/medicines${hhSuffix}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medicine_name: data.medicine_name || 'New Medicine',
          brand: data.brand || '',
          strength: data.strength || '',
          dosage_form: data.dosage_form || 'Tablet',
          manufacturer: data.manufacturer || '',
          category: data.category || 'General',
          prescribed_dosage: data.prescribed_dosage || '',
          prescription_required: data.prescription_required ?? false,
          batch_number: data.batch_number || `BATCH-${new Date().getFullYear()}-01`,
          manufacturing_date: data.manufacturing_date || undefined,
          printed_expiry_date: expiryDate,
          purchase_date: data.purchase_date || new Date().toISOString().split('T')[0],
          opened_date: data.opened_date || undefined,
          quantity: data.quantity ?? 10,
          quantity_unit: data.quantity_unit || 'units',
          stock_threshold: data.stock_threshold ?? 5,
          storage_instructions: data.storage_instructions || 'Store in cool, dry place below 25°C.',
          notes: data.notes || '',
          prescription_id: data.prescription_id || undefined,
          assigned_member_id: data.assigned_member_id,
          data_source: data.data_source || 'MANUAL',
          is_confirmed: data.is_confirmed ?? true,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        await loadDomainDataFromBackend();
        return created;
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'Failed to add medicine');
    }

    const newId = Date.now();
    const newMed: MedicineRecord = {
      id: newId,
      medicine_name: data.medicine_name || 'New Medicine',
      brand: data.brand || '',
      strength: data.strength || '',
      dosage_form: data.dosage_form || 'Tablet',
      batch_number: data.batch_number || `BATCH-${new Date().getFullYear()}-01`,
      printed_expiry_date: expiryDate,
      purchase_date: data.purchase_date || new Date().toISOString().split('T')[0],
      opened_date: data.opened_date,
      quantity: data.quantity ?? 10,
      quantity_unit: data.quantity_unit || 'units',
      stock_threshold: data.stock_threshold ?? 5,
      storage_instructions: data.storage_instructions || 'Store in cool, dry place below 25°C.',
      notes: data.notes || '',
      assigned_member_id: data.assigned_member_id,
      assigned_member: assignedMember,
      data_source: (data.data_source as DataSource) || 'MANUAL',
      is_confirmed: data.is_confirmed ?? true,
      is_disposed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      days_until_expiry: days,
      expiry_status: getExpiryStatus(days),
    };
    setMedicines((prev) => [newMed, ...prev]);
    return newMed;
  };

  const updateMedicine = async (id: number, updates: Partial<MedicineRecord>) => {
    if (isApiConnected && authToken) {
      const res = await authFetch(`/api/medicines/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to update medicine');
      }
      await loadDomainDataFromBackend();
      return;
    }

    setMedicines((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const updatedDate = updates.printed_expiry_date || m.printed_expiry_date;
        const days = calculateDaysUntilExpiry(updatedDate);
        return {
          ...m,
          ...updates,
          printed_expiry_date: updatedDate,
          days_until_expiry: days,
          expiry_status: getExpiryStatus(days),
          updated_at: new Date().toISOString(),
        };
      })
    );
  };

  const deleteMedicine = async (id: number) => {
    if (isApiConnected && authToken) {
      const res = await authFetch(`/api/medicines/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to delete medicine');
      }
      await loadDomainDataFromBackend();
      return;
    }
    setMedicines((prev) => prev.filter((m) => m.id !== id));
    setNotifications((prev) => prev.filter((n) => n.medicine_id !== id));
    setSchedules((prev) => prev.filter((s) => s.medicine_id !== id));
  };

  const markDisposed = async (medicineId: number, method: string, notes?: string, reason = 'Expired') => {
    if (isApiConnected && authToken) {
      const res = await authFetch('/api/disposal/dispose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medicine_id: medicineId,
          disposed_date: new Date().toISOString().split('T')[0],
          disposal_method: method,
          reason,
          notes: notes || 'Safely decommissioned and disposed.',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Disposal failed');
      }
      await loadDomainDataFromBackend();
      return;
    }

    const med = medicines.find((m) => m.id === medicineId);
    if (!med) return;
    await updateMedicine(medicineId, { is_disposed: true, quantity: 0 });
    setDisposalRecords((prev) => [
      {
        id: Date.now(),
        medicine_id: medicineId,
        member_id: med.assigned_member_id,
        disposed_date: new Date().toISOString().split('T')[0],
        disposal_method: method,
        quantity_disposed: med.quantity,
        reason,
        notes,
        created_at: new Date().toISOString(),
        medicine_name: med.medicine_name,
      },
      ...prev,
    ]);
  };

  const markNotificationRead = async (id: number) => {
    if (isApiConnected && authToken) {
      await authFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
    }
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const markAllNotificationsRead = async () => {
    if (isApiConnected && authToken) {
      const hhSuffix = activeHouseholdId ? `?household_id=${activeHouseholdId}` : '';
      await authFetch(`/api/notifications/mark-all-read${hhSuffix}`, { method: 'POST' });
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const addSchedule = async (sched: Omit<MedicationSchedule, 'id' | 'created_at'>) => {
    if (isApiConnected && authToken) {
      const res = await authFetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sched),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to add schedule');
      }
      await loadDomainDataFromBackend();
      return;
    }

    const med = medicines.find((m) => m.id === sched.medicine_id);
    setSchedules((prev) => [
      {
        ...sched,
        id: Date.now(),
        created_at: new Date().toISOString(),
        medicine_name: med?.medicine_name,
      },
      ...prev,
    ]);
  };

  const logDose = async (scheduleId: number, status: 'TAKEN' | 'SKIPPED') => {
    if (isApiConnected && authToken) {
      const res = await authFetch(`/api/schedules/${scheduleId}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule_id: scheduleId, status, notes: 'Logged via UI' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to log dose');
      }
      await loadDomainDataFromBackend();
      return;
    }

    const sched = schedules.find((s) => s.id === scheduleId);
    if (!sched) return;
    if (status === 'TAKEN' && sched.medicine_id) {
      const med = medicines.find((m) => m.id === sched.medicine_id);
      if (med) {
        await updateMedicine(med.id, { quantity: Math.max(0, med.quantity - sched.dose_quantity) });
      }
    }
  };

  const addMember = async (data: Omit<HouseholdMember, 'id'>) => {
    if (isApiConnected && authToken) {
      const res = await authFetch('/api/household/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, household_id: activeHouseholdId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to add member');
      }
      await loadDomainDataFromBackend();
      return;
    }
    setMembers((prev) => [...prev, { ...data, id: Date.now(), created_at: new Date().toISOString() }]);
  };

  const adjustMedicineQuantity = async (medicineId: number, newQuantity: number, notes = 'Manual adjustment') => {
    if (isApiConnected && authToken) {
      const res = await authFetch(`/api/refill/medicines/${medicineId}/adjust-quantity`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_quantity: newQuantity, notes }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Quantity adjustment failed');
      }
      await loadDomainDataFromBackend();
      return;
    }
    await updateMedicine(medicineId, { quantity: newQuantity });
  };

  const resetDemoData = async () => {
    if (isApiConnected && authToken) {
      await authFetch('/api/c-engine/seed-demo?reset=true', { method: 'POST' });
      await loadDomainDataFromBackend();
      return;
    }
    const demo = getInitialDemonstrationData();
    setMembers(demo.members);
    setMedicines(demo.medicines);
    setNotifications(demo.notifications);
    setSchedules(demo.schedules);
    setDisposalRecords(demo.disposalRecords);
    setEventHistory(demo.eventHistory);
  };

  return (
    <MedicineContext.Provider
      value={{
        authStatus,
        authToken,
        currentUser,
        activeHouseholdId,
        householdName,
        accessRole,
        permissions,
        authorizedHouseholds,
        pharmacyId,
        authError,
        activeTab,
        setActiveTab,
        pharmacyPrefillQuery,
        setPharmacyPrefillQuery,
        medicines,
        members,
        notifications,
        schedules,
        disposalRecords,
        eventHistory,
        prescriptions,
        refillPredictions,
        caregivers,
        householdInvitations,
        myInvitations,
        householdOrders,
        householdRefillRequests,
        dashboardSummary,
        activeMemberFilter,
        setActiveMemberFilter,
        selectedMedicineForPassport,
        setSelectedMedicineForPassport,
        isApiConnected,
        syncStatus,
        login,
        register,
        logout,
        switchHousehold,
        authFetch,
        addMedicine,
        updateMedicine,
        deleteMedicine,
        markDisposed,
        markNotificationRead,
        markAllNotificationsRead,
        addSchedule,
        logDose,
        addMember,
        adjustMedicineQuantity,
        resetDemoData,
        refreshFromBackend,
      }}
    >
      {children}
    </MedicineContext.Provider>
  );
};

export const useMedicine = () => {
  const context = useContext(MedicineContext);
  if (!context) {
    throw new Error('useMedicine must be used within a MedicineProvider');
  }
  return context;
};
