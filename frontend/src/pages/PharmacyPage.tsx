import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  MapPin,
  Store,
  ShoppingCart,
  Package,
  Truck,
  CheckCircle2,
  XCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Navigation,
  AlertTriangle,
  Clock,
  SlidersHorizontal,
  Crosshair,
  LogIn,
  X,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useMedicine } from '../context/MedicineContext';
import {
  GeocodeCandidate,
  NearbyPharmaciesResponse,
  NearbyPharmacyResult,
  PharmacyInfo,
  PharmacyMedicineItem,
} from '../types';
import { VoiceSearchBar } from '../components/VoiceSearchBar';
import { NlpMedicineFinder } from '../components/NlpMedicineFinder';
import { AuthGate } from '../components/AuthGate';
import { PharmacyMap } from '../components/PharmacyMap';

interface CartItem {
  item: PharmacyMedicineItem;
  quantity: number;
}

type GeoStatus = 'idle' | 'detecting' | 'granted' | 'denied' | 'unavailable' | 'timeout';
type GeocodeStatus = 'idle' | 'loading' | 'ready' | 'ambiguous' | 'not_found' | 'error';

const QUICK_REGIONS = ['Pollachi', 'Coimbatore', 'Erode', 'Chennai'];

function formatFreshness(iso?: string | null): string | null {
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const PharmacyPage: React.FC = () => {
  const { t } = useLanguage();
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
    prescriptions,
    householdOrders,
    householdRefillRequests,
    pharmacyPrefillQuery,
    setPharmacyPrefillQuery,
    refreshFromBackend,
  } = useMedicine();

  const isPharmacyRole = isAuthenticated && currentUser?.role === 'PHARMACY_STAFF';
  const isAdminRole = isAuthenticated && currentUser?.role === 'PLATFORM_ADMIN';

  const [subTab, setSubTab] = useState<'discover' | 'orders' | 'portal' | 'admin'>(
    isPharmacyRole ? 'portal' : isAdminRole ? 'admin' : 'discover'
  );

  useEffect(() => {
    if (!isPharmacyRole && subTab === 'portal') {
      setSubTab('discover');
    } else if (!isAdminRole && subTab === 'admin') {
      setSubTab('discover');
    }
  }, [isPharmacyRole, isAdminRole, subTab]);

  // Discovery, Location & Map State (No hardcoded city fallback)
  const [medQuery, setMedQuery] = useState(pharmacyPrefillQuery || '');
  const [debouncedMedQuery, setDebouncedMedQuery] = useState(pharmacyPrefillQuery || '');
  const [locationInput, setLocationInput] = useState('');
  const [activeLocationLabel, setActiveLocationLabel] = useState('');
  const [centerLat, setCenterLat] = useState<number | null>(null);
  const [centerLng, setCenterLng] = useState<number | null>(null);
  const [hasUserLocation, setHasUserLocation] = useState(false);

  const [geocodeCandidates, setGeocodeCandidates] = useState<GeocodeCandidate[]>([]);
  const [geocodeStatus, setGeocodeStatus] = useState<GeocodeStatus>('idle');
  const [geocodeMessage, setGeocodeMessage] = useState<string | null>(null);

  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const [geoMessage, setGeoMessage] = useState<string | null>(null);

  const [radiusKm, setRadiusKm] = useState<number>(25);
  const [sortBy, setSortBy] = useState<'distance' | 'price' | 'availability'>('distance');
  const [verifiedOnly, setVerifiedOnly] = useState<boolean>(true);
  const [pickupOnly, setPickupOnly] = useState(false);
  const [deliveryOnly, setDeliveryOnly] = useState(false);
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(true);

  const [nearbyPharmacies, setNearbyPharmacies] = useState<NearbyPharmacyResult[]>([]);
  const [resolvedMedicineTerms, setResolvedMedicineTerms] = useState<string[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedMapPharmacyId, setSelectedMapPharmacyId] = useState<number | null>(null);
  const [selectedPharmacy, setSelectedPharmacy] = useState<PharmacyInfo | null>(null);
  const [selectedPhMeds, setSelectedPhMeds] = useState<PharmacyMedicineItem[]>([]);

  // Cart & Ordering
  const [cart, setCart] = useState<CartItem[]>([]);
  const [fulfilmentType, setFulfilmentType] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'PAY_AT_PICKUP' | 'CASH_ON_DELIVERY'>('PAY_AT_PICKUP');
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState<string>('');
  const [orderFeedback, setOrderFeedback] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Pharmacy Staff Portal State
  const [myPharmacy, setMyPharmacy] = useState<PharmacyInfo | null>(null);
  const [portalInventory, setPortalInventory] = useState<PharmacyMedicineItem[]>([]);
  const [portalTransactions, setPortalTransactions] = useState<any[]>([]);
  const [portalOrders, setPortalOrders] = useState<any[]>([]);
  const [portalRefills, setPortalRefills] = useState<any[]>([]);
  const [adminPharmacies, setAdminPharmacies] = useState<PharmacyInfo[]>([]);
  const [adminCoordEdits, setAdminCoordEdits] = useState<Record<number, { lat: string; lng: string }>>({});

  const [regForm, setRegForm] = useState({
    name: '',
    license_number: '',
    address: '',
    city: '',
    phone: '',
    latitude: '',
    longitude: '',
    business_hours: '08:00 AM - 10:00 PM',
    supports_pickup: true,
    supports_delivery: true,
    delivery_radius_km: 10,
  });

  const [newInvForm, setNewInvForm] = useState({
    medicine_name: '',
    generic_name: '',
    brand: '',
    strength: '',
    dosage_form: 'Tablet',
    prescription_required: false,
    unit_price: 25,
    stock_quantity: 20,
  });

  useEffect(() => {
    if (pharmacyPrefillQuery) {
      setMedQuery(pharmacyPrefillQuery);
      setDebouncedMedQuery(pharmacyPrefillQuery);
      setSubTab('discover');
      setPharmacyPrefillQuery('');
    }
  }, [pharmacyPrefillQuery, setPharmacyPrefillQuery]);

  // Debounce medicine search input for smooth map + list updates
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedMedQuery(medQuery);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [medQuery]);

  const runNearbyDiscovery = useCallback(async () => {
    if (!isApiConnected) return;
    setNearbyLoading(true);
    setNearbyError(null);
    try {
      const params = new URLSearchParams();
      if (centerLat !== null && centerLng !== null) {
        params.set('latitude', String(centerLat));
        params.set('longitude', String(centerLng));
        params.set('radius_km', String(radiusKm));
      } else if (activeLocationLabel.trim()) {
        params.set('location_query', activeLocationLabel.trim());
      }

      if (debouncedMedQuery.trim()) {
        params.set('medicine_query', debouncedMedQuery.trim());
      }
      params.set('verified_only', String(verifiedOnly));
      params.set('pickup_only', String(pickupOnly));
      params.set('delivery_only', String(deliveryOnly));
      params.set('open_now', String(openNowOnly));
      params.set('in_stock_only', String(inStockOnly));
      params.set('sort', sortBy);
      params.set('limit', '50');

      const res = await fetch(`/api/pharmacies/nearby?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setNearbyError(err.detail || 'Could not retrieve nearby pharmacy inventory.');
        setNearbyPharmacies([]);
        return;
      }

      const data: NearbyPharmaciesResponse = await res.json();
      setNearbyPharmacies(data.pharmacies || []);
      setResolvedMedicineTerms(data.resolved_medicine_terms || []);

      // If no matches found for a medicine query, request close spelling suggestions cleanly
      if ((data.pharmacies || []).length === 0 && debouncedMedQuery.trim()) {
        const sugParams = new URLSearchParams({ q: debouncedMedQuery.trim() });
        const sugRes = await fetch(`/api/pharmacies/medicines/search?${sugParams.toString()}`);
        if (sugRes.ok) {
          const sugData = await sugRes.json();
          setSuggestions(sugData.suggestions || []);
        } else {
          setSuggestions([]);
        }
      } else {
        setSuggestions([]);
      }
    } catch {
      setNearbyError('Unable to reach backend pharmacy discovery API.');
    } finally {
      setNearbyLoading(false);
    }
  }, [
    isApiConnected,
    centerLat,
    centerLng,
    radiusKm,
    activeLocationLabel,
    debouncedMedQuery,
    verifiedOnly,
    pickupOnly,
    deliveryOnly,
    openNowOnly,
    inStockOnly,
    sortBy,
  ]);

  useEffect(() => {
    runNearbyDiscovery();
  }, [runNearbyDiscovery]);

  const resolveAndApplyLocation = useCallback(async (rawQuery: string) => {
    const q = rawQuery.trim();
    if (!q) {
      setCenterLat(null);
      setCenterLng(null);
      setActiveLocationLabel('');
      setHasUserLocation(false);
      setGeocodeCandidates([]);
      setGeocodeStatus('idle');
      setGeocodeMessage(null);
      return;
    }

    setGeocodeStatus('loading');
    setGeocodeMessage(null);
    setHasUserLocation(false);
    setGeoStatus('idle');
    setGeoMessage(null);

    try {
      const res = await fetch(`/api/pharmacies/geocode?q=${encodeURIComponent(q)}&limit=5`);
      if (!res.ok) {
        setGeocodeStatus('error');
        setGeocodeMessage('Location lookup failed. Showing text-matched pharmacies if present.');
        setCenterLat(null);
        setCenterLng(null);
        setActiveLocationLabel(q);
        setGeocodeCandidates([]);
        return;
      }
      const data: { results: GeocodeCandidate[] } = await res.json();
      const hits = data.results || [];
      if (hits.length === 0) {
        setGeocodeStatus('not_found');
        setGeocodeCandidates([]);
        setCenterLat(null);
        setCenterLng(null);
        setActiveLocationLabel(q);
        setGeocodeMessage(
          `Could not geocode "${q}" to coordinates. Showing direct city/address text matches if registered.`
        );
        return;
      }

      const primary = hits[0];
      setCenterLat(primary.latitude);
      setCenterLng(primary.longitude);
      setActiveLocationLabel(primary.display_name || q);
      setGeocodeCandidates(hits);
      setGeocodeStatus(hits.length > 1 ? 'ambiguous' : 'ready');
      setGeocodeMessage(
        hits.length > 1
          ? `Centered on "${primary.display_name}". Multiple matches found — select a specific area below if needed.`
          : `Map centered on ${primary.display_name} (${primary.latitude.toFixed(4)}, ${primary.longitude.toFixed(4)}).`
      );
      setSelectedMapPharmacyId(null);
    } catch {
      setGeocodeStatus('error');
      setGeocodeMessage('Unable to contact geocoding service.');
    }
  }, []);

  const handleLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    resolveAndApplyLocation(locationInput);
  };

  const handleSelectGeocodeCandidate = (cand: GeocodeCandidate) => {
    setLocationInput(cand.city || cand.display_name);
    setActiveLocationLabel(cand.display_name);
    setCenterLat(cand.latitude);
    setCenterLng(cand.longitude);
    setHasUserLocation(false);
    setGeocodeStatus('ready');
    setGeocodeMessage(`Map centered on ${cand.display_name} (${cand.latitude.toFixed(4)}, ${cand.longitude.toFixed(4)}).`);
  };

  const handleClearLocation = () => {
    setLocationInput('');
    setActiveLocationLabel('');
    setCenterLat(null);
    setCenterLng(null);
    setHasUserLocation(false);
    setGeocodeCandidates([]);
    setGeocodeStatus('idle');
    setGeocodeMessage(null);
    setGeoStatus('idle');
    setGeoMessage(null);
    setSelectedMapPharmacyId(null);
  };

  const handleUseGeolocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('unavailable');
      setGeoMessage('Browser geolocation is unavailable in this environment. Search your town, city, or PIN manually.');
      return;
    }

    setGeoStatus('detecting');
    setGeoMessage('Requesting your browser location to center the map on nearby pharmacies...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        setCenterLat(lat);
        setCenterLng(lng);
        setHasUserLocation(true);
        setActiveLocationLabel('Current Device Location');
        setLocationInput('');
        setGeocodeCandidates([]);
        setGeocodeStatus('idle');
        setGeocodeMessage(null);
        setGeoStatus('granted');
        setGeoMessage(`Using your live GPS coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)}).`);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoStatus('denied');
          setGeoMessage('Location permission denied. Enter your town, city, or postal PIN above to center the map.');
        } else if (err.code === err.TIMEOUT) {
          setGeoStatus('timeout');
          setGeoMessage('GPS location request timed out. Enter your town, city, or PIN manually.');
        } else {
          setGeoStatus('unavailable');
          setGeoMessage('Could not determine device location. Enter your town, city, or PIN manually.');
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  };

  const inspectPharmacy = useCallback(
    async (phId: number) => {
      setSelectedMapPharmacyId(phId);
      const q = centerLat !== null && centerLng !== null ? `?lat=${centerLat}&lng=${centerLng}` : '';
      const res = await fetch(`/api/pharmacies/${phId}${q}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedPharmacy(data.pharmacy);
        setSelectedPhMeds(data.medicines || []);
      }
    },
    [centerLat, centerLng]
  );

  const handleSelectPharmacyFromMapOrList = useCallback((ph: NearbyPharmacyResult) => {
    setSelectedMapPharmacyId(ph.id);
    const el = document.getElementById(`pharmacy-card-${ph.id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  // Derive flattened medicine offers cleanly from matched pharmacies so map & cards always agree 1:1
  const medicineOffers = useMemo(() => {
    const all = nearbyPharmacies.flatMap((ph) => ph.matching_medicines || []);
    if (sortBy === 'price') {
      return [...all].sort(
        (a, b) => a.unit_price - b.unit_price || (a.distance_km ?? 9999) - (b.distance_km ?? 9999)
      );
    }
    if (sortBy === 'availability') {
      return [...all].sort(
        (a, b) => b.available_quantity - a.available_quantity || a.unit_price - b.unit_price
      );
    }
    return [...all].sort(
      (a, b) => (a.distance_km ?? 9999) - (b.distance_km ?? 9999) || a.unit_price - b.unit_price
    );
  }, [nearbyPharmacies, sortBy]);

  const loadPortalData = useCallback(async () => {
    if (!isApiConnected || !isAuthenticated || !currentUser) return;
    if (isPharmacyRole) {
      const [invRes, ordRes, refRes] = await Promise.all([
        authFetch('/api/pharmacy-portal/inventory'),
        authFetch('/api/pharmacy-portal/orders'),
        authFetch('/api/pharmacy-portal/refill-requests'),
      ]);
      if (invRes.ok) {
        const invData = await invRes.json();
        setMyPharmacy(invData.pharmacy);
        setPortalInventory(invData.items || []);
        setPortalTransactions(invData.transactions || []);
      } else {
        setMyPharmacy(null);
      }
      if (ordRes.ok) setPortalOrders(await ordRes.json());
      if (refRes.ok) setPortalRefills(await refRes.json());
    }
    if (isAdminRole) {
      const admRes = await authFetch('/api/pharmacies/admin/list');
      if (admRes.ok) {
        const list: PharmacyInfo[] = await admRes.json();
        setAdminPharmacies(list);
        const coordSeed: Record<number, { lat: string; lng: string }> = {};
        list.forEach((p) => {
          coordSeed[p.id] = { lat: String(p.latitude ?? ''), lng: String(p.longitude ?? '') };
        });
        setAdminCoordEdits(coordSeed);
      }
    }
  }, [isApiConnected, isAuthenticated, currentUser, isPharmacyRole, isAdminRole, authFetch]);

  useEffect(() => {
    loadPortalData();
  }, [loadPortalData]);

  const addToCart = (offer: PharmacyMedicineItem) => {
    setOrderError(null);
    setOrderFeedback(null);
    setCart((prev) => {
      if (prev.length > 0 && prev[0].item.pharmacy_id !== offer.pharmacy_id) {
        return [{ item: offer, quantity: 1 }];
      }
      const existing = prev.find((c) => c.item.id === offer.id);
      if (existing) {
        return prev.map((c) =>
          c.item.id === offer.id
            ? { ...c, quantity: Math.min(offer.available_quantity, c.quantity + 1) }
            : c
        );
      }
      return [...prev, { item: offer, quantity: 1 }];
    });
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated || !currentUser) {
      setOrderError('Sign in required to reserve stock and place a pharmacy order.');
      openAuthModal();
      return;
    }
    if (cart.length === 0) return;

    setOrderError(null);
    setOrderFeedback(null);
    const hhSuffix = activeHouseholdId ? `?household_id=${activeHouseholdId}` : '';

    const res = await authFetch(`/api/orders${hhSuffix}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pharmacy_id: cart[0].item.pharmacy_id,
        prescription_id: selectedPrescriptionId ? Number(selectedPrescriptionId) : null,
        fulfilment_type: fulfilmentType,
        delivery_address: fulfilmentType === 'DELIVERY' ? deliveryAddress : null,
        payment_method: paymentMethod,
        items: cart.map((c) => ({ pharmacy_medicine_id: c.item.id, quantity: c.quantity })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setOrderError(data.detail || 'Could not place order.');
    } else {
      setOrderFeedback(`Order ${data.order_number} placed (${data.payment_status}). Stock reserved!`);
      setCart([]);
      await refreshFromBackend();
      await runNearbyDiscovery();
      setSubTab('orders');
    }
  };

  const handleSubmitRefillRequest = async (offer: PharmacyMedicineItem) => {
    if (!isAuthenticated || !currentUser) {
      setOrderError('Sign in as a household owner or caregiver to submit a refill request.');
      openAuthModal();
      return;
    }
    setOrderError(null);
    const hhSuffix = activeHouseholdId ? `?household_id=${activeHouseholdId}` : '';
    const res = await authFetch(`/api/orders/refill-requests${hhSuffix}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pharmacy_id: offer.pharmacy_id,
        pharmacy_medicine_id: offer.id,
        prescription_id: selectedPrescriptionId ? Number(selectedPrescriptionId) : null,
        medicine_name: offer.medicine_name,
        requested_quantity: 1,
        fulfilment_type: 'PICKUP',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setOrderError(data.detail || 'Refill request failed.');
    } else {
      setOrderFeedback(`Refill request #${data.id} sent to ${offer.pharmacy_name}.`);
      await refreshFromBackend();
    }
  };

  const handleCancelOrder = async (orderId: number) => {
    const res = await authFetch(`/api/orders/${orderId}/cancel`, { method: 'POST' });
    if (res.ok) {
      await refreshFromBackend();
      await runNearbyDiscovery();
    }
  };

  // Pharmacy Staff Portal Handlers
  const handleGeocodeForRegistration = async () => {
    const q = [regForm.address, regForm.city].filter(Boolean).join(', ');
    if (q.length < 2) {
      setOrderError('Enter an address or city first to look up coordinates.');
      return;
    }
    setOrderError(null);
    const res = await fetch(`/api/pharmacies/geocode?q=${encodeURIComponent(q)}&limit=1`);
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const hit = data.results[0];
        setRegForm((prev) => ({
          ...prev,
          latitude: String(hit.latitude),
          longitude: String(hit.longitude),
        }));
        setOrderFeedback(`Auto-located coordinates for ${hit.display_name}. Verify accuracy before submitting.`);
        return;
      }
    }
    setOrderError('Could not automatically geocode address. Enter latitude & longitude manually.');
  };

  const handleRegisterPharmacy = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderError(null);
    const lat = Number(regForm.latitude);
    const lng = Number(regForm.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6)) {
      setOrderError('Provide valid non-zero latitude and longitude coordinates for map placement.');
      return;
    }
    const res = await authFetch('/api/pharmacy-portal/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...regForm,
        latitude: lat,
        longitude: lng,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setOrderFeedback('Pharmacy submitted for admin verification. Coordinates marked pending review.');
      await loadPortalData();
    } else {
      setOrderError(data.detail || 'Pharmacy registration failed.');
    }
  };

  const handleAddInventoryItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await authFetch('/api/pharmacy-portal/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newInvForm),
    });
    if (res.ok) {
      setNewInvForm({
        medicine_name: '',
        generic_name: '',
        brand: '',
        strength: '',
        dosage_form: 'Tablet',
        prescription_required: false,
        unit_price: 25,
        stock_quantity: 20,
      });
      await loadPortalData();
      await runNearbyDiscovery();
    }
  };

  const handlePortalStockUpdate = async (itemId: number, stock: number, price: number, avail: boolean) => {
    await authFetch(`/api/pharmacy-portal/inventory/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stock_quantity: stock, unit_price: price, is_available: avail }),
    });
    await loadPortalData();
    await runNearbyDiscovery();
  };

  const handlePortalOrderStatus = async (orderId: number, status: string) => {
    await authFetch(`/api/pharmacy-portal/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await loadPortalData();
    await runNearbyDiscovery();
  };

  const handlePortalRefillStatus = async (reqId: number, status: string) => {
    const res = await authFetch(`/api/pharmacy-portal/refill-requests/${reqId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setOrderError(d.detail || 'Unable to update refill request');
    } else {
      await loadPortalData();
    }
  };

  const handleAdminVerifyPharmacy = async (phId: number, status: 'VERIFIED' | 'REJECTED') => {
    setOrderError(null);
    const res = await authFetch(`/api/pharmacies/admin/${phId}/verify`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verification_status: status }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setOrderError(d.detail || 'Verification update failed.');
      return;
    }
    await loadPortalData();
    await runNearbyDiscovery();
  };

  const handleAdminSaveCoordinates = async (phId: number, markVerified: boolean) => {
    setOrderError(null);
    const edit = adminCoordEdits[phId];
    const lat = Number(edit?.lat);
    const lng = Number(edit?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setOrderError('Enter numeric latitude and longitude coordinates.');
      return;
    }
    const res = await authFetch(`/api/pharmacies/admin/${phId}/coordinates`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: lat,
        longitude: lng,
        coordinates_verified: markVerified,
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setOrderError(d.detail || 'Failed to update coordinates.');
      return;
    }
    setOrderFeedback(`Coordinates updated for ${d.name}.`);
    await loadPortalData();
    await runNearbyDiscovery();
  };

  const cartRequiresRx = cart.some((c) => c.item.prescription_required);
  const cartTotal = cart.reduce((acc, c) => acc + c.item.unit_price * c.quantity, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink font-display">
            {t('pharmacy.title')}
          </h1>
          <p className="text-xs text-ink-muted mt-1">{t('pharmacy.subtitle')}</p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => setSubTab('discover')}
            className={`px-3.5 py-2 rounded-xl font-bold border transition-colors ${
              subTab === 'discover'
                ? 'bg-brand text-on-brand border-brand'
                : 'bg-surface text-ink border-line hover:border-brand'
            }`}
          >
            Discover &amp; Map
          </button>
          <button
            type="button"
            onClick={() => setSubTab('orders')}
            className={`px-3.5 py-2 rounded-xl font-bold border transition-colors ${
              subTab === 'orders'
                ? 'bg-brand text-on-brand border-brand'
                : 'bg-surface text-ink border-line hover:border-brand'
            }`}
          >
            My Orders ({isAuthenticated ? householdOrders.length : 0})
          </button>
          {isPharmacyRole && (
            <button
              type="button"
              onClick={() => setSubTab('portal')}
              className={`px-3.5 py-2 rounded-xl font-bold border transition-colors ${
                subTab === 'portal'
                  ? 'bg-brand text-on-brand border-brand'
                  : 'bg-surface text-ink border-line hover:border-brand'
              }`}
            >
              Pharmacy Staff Portal
            </button>
          )}
          {isAdminRole && (
            <button
              type="button"
              onClick={() => setSubTab('admin')}
              className={`px-3.5 py-2 rounded-xl font-bold border transition-colors ${
                subTab === 'admin'
                  ? 'bg-danger text-on-danger border-danger'
                  : 'bg-surface text-ink border-line hover:border-danger'
              }`}
            >
              Admin Verification
            </button>
          )}
        </div>
      </div>

      {orderFeedback && (
        <div role="status" className="p-3 rounded-xl bg-surface border border-brand text-xs text-brand-ink font-medium">
          {orderFeedback}
        </div>
      )}
      {orderError && (
        <div role="alert" className="p-3 rounded-xl bg-danger/15 border border-danger text-xs text-danger-ink font-medium">
          {orderError}
        </div>
      )}

      {/* TAB 1: DISCOVERY, REAL INTERACTIVE MAP & ORDERING */}
      {subTab === 'discover' && (
        <div className="space-y-6">
          <NlpMedicineFinder
            onSelectCanonicalMedicine={(genericQuery) => {
              setMedQuery(genericQuery);
              setDebouncedMedQuery(genericQuery);
            }}
          />

          {/* Search & Geospatial Filter Controls */}
          <div className="p-5 medora-card space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 text-xs">
              {/* Medicine / Generic / Brand / Multilingual Search */}
              <div className="lg:col-span-4 relative">
                <Search className="w-4 h-4 text-ink-muted absolute start-3 top-2.5" />
                <input
                  type="text"
                  aria-label="Search medicines across nearby pharmacies"
                  value={medQuery}
                  onChange={(e) => setMedQuery(e.target.value)}
                  placeholder={t('pharmacy.search_placeholder')}
                  className="medora-input ps-9 pe-8"
                />
                {medQuery && (
                  <button
                    type="button"
                    aria-label="Clear medicine search"
                    onClick={() => {
                      setMedQuery('');
                      setDebouncedMedQuery('');
                    }}
                    className="absolute end-2.5 top-2 text-ink-muted hover:text-ink"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Location Geocoding Search Form */}
              <form onSubmit={handleLocationSubmit} className="lg:col-span-4 flex gap-1.5">
                <div className="relative flex-1">
                  <MapPin className="w-4 h-4 text-brand-ink absolute start-3 top-2.5" />
                  <input
                    type="text"
                    aria-label="Enter city, town, locality, or postal PIN"
                    value={locationInput}
                    onChange={(e) => setLocationInput(e.target.value)}
                    placeholder="City, town or PIN (e.g. Pollachi, Coimbatore, 642001)"
                    className="medora-input ps-9"
                  />
                </div>
                <button
                  type="submit"
                  className="medora-btn-secondary px-3 shrink-0"
                >
                  Locate
                </button>
              </form>

              <select
                aria-label="Search radius"
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                className="medora-select lg:col-span-2"
              >
                <option value={2}>Within 2 km</option>
                <option value={5}>Within 5 km</option>
                <option value={10}>Within 10 km</option>
                <option value={25}>Within 25 km</option>
                <option value={50}>Within 50 km</option>
                <option value={100}>Within 100 km</option>
              </select>

              <select
                aria-label="Sort pharmacy results"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'distance' | 'price' | 'availability')}
                className="medora-select lg:col-span-2"
              >
                <option value="distance">{t('pharmacy.sort_nearest')}</option>
                <option value="price">{t('pharmacy.sort_price')}</option>
                <option value="availability">{t('pharmacy.sort_stock')}</option>
              </select>
            </div>

            {/* Quick Regional Jumps + Use My Location */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={handleUseGeolocation}
                  disabled={geoStatus === 'detecting'}
                  className="medora-btn-secondary px-3 py-1.5 text-brand-ink text-xs"
                  title={t('pharmacy.use_location')}
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>{geoStatus === 'detecting' ? 'Detecting GPS...' : t('pharmacy.use_location')}</span>
                </button>
                <span className="text-[11px] text-ink-muted ps-1">Quick jump:</span>
                {QUICK_REGIONS.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => {
                      setLocationInput(city);
                      resolveAndApplyLocation(city);
                    }}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                      activeLocationLabel.toLowerCase().includes(city.toLowerCase())
                        ? 'bg-brand text-on-brand border-brand'
                        : 'bg-field text-ink border-line hover:border-brand'
                    }`}
                  >
                    {city}
                  </button>
                ))}
                {(activeLocationLabel || centerLat !== null) && (
                  <button
                    type="button"
                    onClick={handleClearLocation}
                    className="px-2.5 py-1 rounded-lg bg-field border border-line text-[11px] text-danger-ink hover:border-danger font-semibold"
                  >
                    Clear area
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-ink font-medium">
                <span className="inline-flex items-center gap-1 text-ink-muted">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={verifiedOnly}
                    onChange={(e) => setVerifiedOnly(e.target.checked)}
                  />
                  <span>Verified only</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(e) => setInStockOnly(e.target.checked)}
                  />
                  <span>In stock</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pickupOnly}
                    onChange={(e) => setPickupOnly(e.target.checked)}
                  />
                  <span>{t('pharmacy.pickup_only')}</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deliveryOnly}
                    onChange={(e) => setDeliveryOnly(e.target.checked)}
                  />
                  <span>{t('pharmacy.delivery_only')}</span>
                </label>
                <label
                  className="flex items-center gap-1.5 cursor-pointer"
                  title="Only matches pharmacies whose published hours confirm they are open right now"
                >
                  <input
                    type="checkbox"
                    checked={openNowOnly}
                    onChange={(e) => setOpenNowOnly(e.target.checked)}
                  />
                  <span>Open now</span>
                </label>
              </div>
            </div>

            <VoiceSearchBar
              onApplyQuery={(q) => {
                setMedQuery(q);
                setDebouncedMedQuery(q);
              }}
              suggestions={suggestions}
            />

            {/* Status / Geocode Disambiguation Feedback */}
            {geoMessage && (
              <div
                role="status"
                className={`p-2.5 rounded-xl border text-[11px] flex items-center gap-2 ${
                  geoStatus === 'granted'
                    ? 'bg-field border-brand text-brand-ink'
                    : geoStatus === 'detecting'
                    ? 'bg-field border-line text-ink-muted'
                    : 'bg-warning-bg border-warning text-warning-ink'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5 shrink-0" />
                <span>{geoMessage}</span>
              </div>
            )}

            {geocodeMessage && (
              <div
                role="status"
                className={`p-2.5 rounded-xl border text-[11px] space-y-2 ${
                  geocodeStatus === 'not_found' || geocodeStatus === 'error'
                    ? 'bg-warning-bg border-warning text-warning-ink'
                    : 'bg-field border-line text-ink'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-brand-ink shrink-0" />
                  <span>{geocodeMessage}</span>
                </div>
                {geocodeCandidates.length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    {geocodeCandidates.map((cand, idx) => (
                      <button
                        key={`${cand.display_name}-${idx}`}
                        type="button"
                        onClick={() => handleSelectGeocodeCandidate(cand)}
                        className="px-2.5 py-1 rounded-lg bg-surface border border-line hover:border-brand text-[11px] font-medium text-ink"
                      >
                        {cand.display_name} ({cand.provider})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {resolvedMedicineTerms.length > 0 && debouncedMedQuery.trim() && (
              <div className="text-[11px] text-brand-ink bg-field border border-line rounded-xl px-3 py-2 flex flex-wrap items-center gap-1.5">
                <span className="font-bold">Matched medicine &amp; NLP terms:</span>
                {resolvedMedicineTerms.map((term) => (
                  <span key={term} className="px-2 py-0.5 rounded-full bg-surface border border-line text-ink font-medium">
                    {term}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Interactive OpenStreetMap + Medicine Comparison + Participating Pharmacies */}
            <div className="lg:col-span-8 space-y-6">
              <div className="p-5 medora-card space-y-3">
                <div className="flex flex-wrap justify-between items-center gap-2 text-xs">
                  <div>
                    <h2 className="font-bold text-sm text-brand-ink uppercase tracking-wider flex items-center gap-1.5">
                      <MapPin className="w-4 h-4" />
                      <span>
                        Interactive Pharmacy Map ({nearbyPharmacies.length} matching)
                      </span>
                    </h2>
                    <p className="text-[11px] text-ink-muted mt-0.5">
                      {centerLat !== null && centerLng !== null
                        ? `Showing results within ${radiusKm} km of ${activeLocationLabel || 'selected pin'}.`
                        : activeLocationLabel
                        ? `Showing text-matched pharmacies for "${activeLocationLabel}".`
                        : 'Select a city/PIN or click "Use My Location" to calculate driving radii, or inspect all verified regional partners.'}
                    </p>
                  </div>
                  {nearbyLoading && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-brand-ink font-semibold">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Updating map...</span>
                    </span>
                  )}
                </div>

                {nearbyError && (
                  <div className="p-3 rounded-xl bg-danger/15 border border-danger text-xs text-danger-ink">
                    {nearbyError}
                  </div>
                )}

                <PharmacyMap
                  pharmacies={nearbyPharmacies}
                  centerLat={centerLat}
                  centerLng={centerLng}
                  radiusKm={radiusKm}
                  locationLabel={activeLocationLabel}
                  selectedPharmacyId={selectedMapPharmacyId}
                  hasUserLocation={hasUserLocation}
                  onSelectPharmacy={handleSelectPharmacyFromMapOrList}
                  onInspectPharmacy={inspectPharmacy}
                />
              </div>

              {/* Participating Pharmacies List (Bidirectionally Linked to Map Pins) */}
              <div className="space-y-3">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <h2 className="text-base font-bold text-ink">
                    Nearby Participating Pharmacies ({nearbyPharmacies.length})
                  </h2>
                  {nearbyPharmacies.some((p) => p.data_origin === 'SAMPLE_DEMO') && (
                    <span className="text-[11px] text-ink-muted">
                      Demo Seed stores are marked <strong className="text-danger-ink">Demo Seed</strong>
                    </span>
                  )}
                </div>

                {nearbyPharmacies.length === 0 ? (
                  <div className="p-6 medora-card text-center space-y-2 text-xs">
                    <AlertTriangle className="w-5 h-5 text-warning-ink mx-auto" />
                    <p className="font-bold text-ink">
                      No matching pharmacies found in this search area and filter set.
                    </p>
                    <p className="text-ink-muted">
                      Try expanding the radius to 50 km, clearing the medicine query, unchecking "Open now", or selecting Pollachi / Coimbatore / Erode / Chennai.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {nearbyPharmacies.map((ph) => {
                      const isSelected = ph.id === selectedMapPharmacyId;
                      return (
                        <div
                          key={ph.id}
                          id={`pharmacy-card-${ph.id}`}
                          onClick={() => setSelectedMapPharmacyId(ph.id)}
                          className={`p-4 medora-card space-y-2.5 text-xs cursor-pointer transition-all ${
                            isSelected ? 'ring-2 ring-brand border-brand' : 'hover:border-brand/60'
                          }`}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <h3 className="font-bold text-sm text-ink">{ph.name}</h3>
                              <p className="text-ink-muted">
                                {ph.address}, {ph.city}
                              </p>
                            </div>
                            <span className="font-mono font-bold text-brand-ink shrink-0">
                              {ph.distance_km !== null && ph.distance_km !== undefined ? `${ph.distance_km} km` : ph.city}
                            </span>
                          </div>

                          {/* Honest Verification + Origin + Hours Status Badges */}
                          <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                            <span
                              className={`px-2 py-0.5 rounded-full ${
                                ph.location_needs_verification
                                  ? 'bg-warning-bg text-warning-ink'
                                  : 'bg-success-bg text-success-ink'
                              }`}
                            >
                              {ph.location_needs_verification ? 'Location Needs Verification' : 'Verified Partner'}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full ${
                                ph.data_origin === 'SAMPLE_DEMO'
                                  ? 'bg-danger/15 text-danger-ink'
                                  : 'bg-field border border-line text-ink'
                              }`}
                            >
                              {ph.data_origin === 'SAMPLE_DEMO' ? 'Demo Seed' : 'Partner Live'}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                ph.is_open_now === true
                                  ? 'bg-success-bg text-success-ink'
                                  : ph.is_open_now === false
                                  ? 'bg-danger/15 text-danger-ink'
                                  : 'bg-field text-ink-muted'
                              }`}
                            >
                              <Clock className="w-3 h-3" />
                              {ph.is_open_now === true
                                ? 'Open Now'
                                : ph.is_open_now === false
                                ? 'Closed Now'
                                : 'Hours Unverified'}
                            </span>
                          </div>

                          <div className="text-ink-muted flex flex-wrap gap-3 text-[11px]">
                            {ph.business_hours && <span>{ph.business_hours}</span>}
                            <span className="font-mono">{ph.phone}</span>
                          </div>

                          {debouncedMedQuery.trim() && ph.matching_medicines.length > 0 && (
                            <div className="p-2 rounded-xl bg-field border border-line text-[11px] flex justify-between items-center">
                              <span className="text-ink font-medium truncate">
                                {ph.matching_medicines[0].medicine_name}
                                {ph.matching_medicines.length > 1 ? ` (+${ph.matching_medicines.length - 1})` : ''}
                              </span>
                              <span className="font-bold text-brand-ink shrink-0 ms-2">
                                From ₹{(ph.lowest_price ?? ph.matching_medicines[0].unit_price).toFixed(2)}
                              </span>
                            </div>
                          )}

                          <div className="flex justify-between items-center pt-2 border-t border-line">
                            <span className="text-[11px] text-brand-ink font-semibold">
                              {ph.supports_pickup ? 'Pickup' : ''}
                              {ph.supports_pickup && ph.supports_delivery ? ' & ' : ''}
                              {ph.supports_delivery ? 'Delivery' : ''}
                            </span>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedMapPharmacyId(ph.id);
                                }}
                                className="text-[11px] font-semibold text-ink-muted hover:text-ink"
                              >
                                Show Pin
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  inspectPharmacy(ph.id);
                                }}
                                className="text-xs font-bold text-brand-ink hover:underline"
                              >
                                View Catalog ➔
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selected Pharmacy Full Catalog Inspector */}
              {selectedPharmacy && (
                <div className="p-5 medora-card border-2 border-brand space-y-3 text-xs">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h3 className="text-base font-bold text-ink">{selectedPharmacy.name}</h3>
                      <p className="text-ink-muted">
                        {selectedPharmacy.address}, {selectedPharmacy.city} • {selectedPharmacy.business_hours}
                      </p>
                      <span className="text-brand-ink font-medium block mt-0.5">
                        {selectedPharmacy.estimated_fulfilment_note}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPharmacy(null)}
                      className="text-danger-ink font-bold hover:underline"
                    >
                      {t('common.close')}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedPhMeds.map((pm) => (
                      <div
                        key={pm.id}
                        className="p-3 rounded-xl bg-field border border-line flex justify-between items-center gap-2"
                      >
                        <div>
                          <strong className="text-ink block">{pm.medicine_name}</strong>
                          <span className="text-ink-muted">
                            {pm.strength} • ₹{pm.unit_price.toFixed(2)} • {pm.available_quantity} {t('common.units')}
                          </span>
                          <span className="block text-[10px] text-ink-muted mt-0.5">
                            {pm.inventory_source === 'SAMPLE_DEMO' ? 'Demo Inventory' : 'Verified Partner Stock'}
                            {formatFreshness(pm.updated_at) ? ` • Updated ${formatFreshness(pm.updated_at)}` : ''}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={!pm.is_available}
                          onClick={() => addToCart(pm)}
                          className="px-2.5 py-1.5 rounded-lg bg-brand text-on-brand font-bold disabled:opacity-40 shrink-0"
                        >
                          {t('pharmacy.add_to_cart')}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Medicine Availability Comparison */}
              <div className="space-y-3">
                <h2 className="text-base font-bold text-ink">
                  Medicine Availability Comparison ({medicineOffers.length} offers)
                </h2>
                {medicineOffers.length === 0 ? (
                  <div className="p-8 medora-card text-center text-xs text-ink-muted">
                    No matching medicine stock found inside the active pharmacies and radius.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {medicineOffers.map((offer) => (
                      <div key={offer.id} className="p-4 medora-card space-y-3 text-xs">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <h3 className="font-bold text-sm text-ink">{offer.medicine_name}</h3>
                            <span className="text-brand-ink font-semibold block">
                              {offer.brand || offer.generic_name} • {offer.strength}
                            </span>
                            <span className="text-ink-muted block mt-1">
                              <Store className="w-3 h-3 inline me-1" />
                              {offer.pharmacy_name}
                              {offer.distance_km !== null && offer.distance_km !== undefined
                                ? ` (${offer.distance_km} km)`
                                : offer.pharmacy_city
                                ? ` (${offer.pharmacy_city})`
                                : ''}
                            </span>
                            {formatFreshness(offer.updated_at) && (
                              <span className="text-[10px] text-ink-muted block mt-0.5">
                                Stock updated: {formatFreshness(offer.updated_at)}
                              </span>
                            )}
                          </div>
                          <div className="text-end shrink-0">
                            <span className="text-lg font-extrabold text-ink block">
                              ₹{offer.unit_price.toFixed(2)}
                            </span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                offer.inventory_source === 'SAMPLE_DEMO'
                                  ? 'bg-danger/15 text-danger-ink'
                                  : 'bg-success-bg text-success-ink'
                              }`}
                            >
                              {offer.inventory_source === 'SAMPLE_DEMO' ? 'Demo Inventory' : 'Verified Stock'}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line">
                          <span
                            className={
                              offer.available_quantity > 0
                                ? 'text-success-ink font-bold'
                                : 'text-danger-ink font-bold'
                            }
                          >
                            {offer.available_quantity > 0
                              ? `${offer.available_quantity} available`
                              : 'Out of stock'}
                            {offer.prescription_required && ' • Rx Required'}
                          </span>

                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSubmitRefillRequest(offer)}
                              className="px-2.5 py-1.5 rounded-lg bg-field text-brand-ink border border-line hover:border-brand font-semibold transition-colors"
                            >
                              Refill Request
                            </button>
                            <button
                              type="button"
                              disabled={!offer.is_available}
                              onClick={() => addToCart(offer)}
                              className="px-3 py-1.5 rounded-lg bg-brand text-on-brand font-bold disabled:opacity-40 hover:opacity-90 transition-opacity"
                            >
                              + Order
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Cart & Transaction-Safe Order Checkout */}
            <div className="lg:col-span-4 p-6 medora-card space-y-4 sticky top-24">
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-brand-ink" />
                <span>Order Cart ({cart.length})</span>
              </h2>

              {!isAuthenticated && authStatus !== 'initializing' && (
                <div className="p-3 rounded-xl bg-field border border-line text-xs space-y-2">
                  <p className="text-ink-muted">
                    Browsing pharmacy locations &amp; stock is open to everyone. Sign in when ready to reserve stock or submit refills.
                  </p>
                  <button
                    type="button"
                    onClick={() => openAuthModal()}
                    className="medora-btn-secondary w-full justify-center py-2 text-xs text-brand-ink"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Sign In to Order / Refill</span>
                  </button>
                </div>
              )}

              {cart.length === 0 ? (
                <p className="text-xs text-ink-muted">
                  Select available medicines from the map or comparison list to reserve stock and place an order.
                </p>
              ) : (
                <form onSubmit={handlePlaceOrder} className="space-y-3 text-xs">
                  <div className="text-brand-ink font-semibold">
                    Pharmacy: {cart[0].item.pharmacy_name}
                  </div>

                  <div className="space-y-2">
                    {cart.map((c) => (
                      <div
                        key={c.item.id}
                        className="p-2.5 rounded-xl bg-field border border-line flex justify-between items-center gap-2"
                      >
                        <div>
                          <strong className="text-ink block">{c.item.medicine_name}</strong>
                          <span className="text-ink-muted">₹{c.item.unit_price.toFixed(2)} each</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={c.item.available_quantity}
                            value={c.quantity}
                            onChange={(e) => {
                              const q = Math.max(
                                1,
                                Math.min(c.item.available_quantity, Number(e.target.value))
                              );
                              setCart((prev) =>
                                prev.map((x) => (x.item.id === c.item.id ? { ...x, quantity: q } : x))
                              );
                            }}
                            className="w-14 px-2 py-1 rounded-lg bg-surface text-ink border border-line-strong"
                          />
                          <button
                            type="button"
                            aria-label={t('common.delete')}
                            onClick={() => setCart((prev) => prev.filter((x) => x.item.id !== c.item.id))}
                            className="text-danger-ink font-bold px-1"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {cartRequiresRx && (
                    <div>
                      <label className="block font-bold text-danger-ink mb-1">
                        Prescription Required (Attach from Vault) *
                      </label>
                      <select
                        required
                        value={selectedPrescriptionId}
                        onChange={(e) => setSelectedPrescriptionId(e.target.value)}
                        className="medora-select w-full border-danger"
                      >
                        <option value="">Select authorized prescription...</option>
                        {prescriptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title} ({p.prescribed_date})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={fulfilmentType}
                      onChange={(e) => {
                        const f = e.target.value as 'PICKUP' | 'DELIVERY';
                        setFulfilmentType(f);
                        setPaymentMethod(f === 'PICKUP' ? 'PAY_AT_PICKUP' : 'CASH_ON_DELIVERY');
                      }}
                      className="medora-select"
                    >
                      <option value="PICKUP">Store Pickup</option>
                      <option value="DELIVERY">Home Delivery</option>
                    </select>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as any)}
                      className="medora-select"
                    >
                      <option value="PAY_AT_PICKUP">Pay at Pickup</option>
                      {fulfilmentType === 'DELIVERY' && (
                        <option value="CASH_ON_DELIVERY">Cash on Delivery</option>
                      )}
                    </select>
                  </div>

                  {fulfilmentType === 'DELIVERY' && (
                    <input
                      type="text"
                      required
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Full delivery address..."
                      className="medora-input"
                    />
                  )}

                  <div className="pt-2 border-t border-line flex justify-between text-sm font-bold text-ink">
                    <span>Order Total (Unpaid):</span>
                    <span className="text-brand-ink">₹{cartTotal.toFixed(2)}</span>
                  </div>

                  <p className="text-[11px] text-ink-muted">{t('pharmacy.checkout_note')}</p>

                  <button
                    type="submit"
                    disabled={authStatus === 'initializing'}
                    className="medora-btn-primary w-full disabled:opacity-50"
                  >
                    {isAuthenticated ? t('pharmacy.place_order') : 'Sign In & Place Order'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: HOUSEHOLD ORDERS & REFILL REQUESTS */}
      {subTab === 'orders' && (
        <AuthGate title="My Pharmacy Orders & Refill Requests">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <Package className="w-4 h-4 text-brand-ink" />
                <span>Pharmacy Orders ({householdOrders.length})</span>
              </h2>
              {householdOrders.length === 0 ? (
                <div className="p-6 medora-card text-xs text-ink-muted">
                  No orders recorded for this household yet.
                </div>
              ) : (
                householdOrders.map((ord) => (
                  <div key={ord.id} className="p-4 medora-card space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <strong className="font-mono text-sm text-brand-ink">{ord.order_number}</strong>
                      <span className="px-2.5 py-0.5 rounded-full bg-field border border-line text-ink font-bold">
                        {ord.status}
                      </span>
                    </div>
                    <div className="text-ink font-medium">
                      {ord.pharmacy_name} • ₹{ord.total_amount.toFixed(2)} • {ord.payment_method}
                    </div>
                    <ul className="ps-4 list-disc text-ink-muted">
                      {ord.items.map((it) => (
                        <li key={it.id}>
                          {it.medicine_name} x{it.quantity} (₹{it.line_total.toFixed(2)})
                        </li>
                      ))}
                    </ul>
                    {['PENDING', 'ACCEPTED', 'PREPARING'].includes(ord.status) && (
                      <button
                        type="button"
                        onClick={() => handleCancelOrder(ord.id)}
                        className="px-3 py-1 rounded-lg bg-danger/15 text-danger-ink border border-danger/30 font-bold"
                      >
                        Cancel Order
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="space-y-3">
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <Truck className="w-4 h-4 text-brand-ink" />
                <span>Refill Requests ({householdRefillRequests.length})</span>
              </h2>
              {householdRefillRequests.length === 0 ? (
                <div className="p-6 medora-card text-xs text-ink-muted">
                  No refill requests submitted yet.
                </div>
              ) : (
                householdRefillRequests.map((req) => (
                  <div key={req.id} className="p-4 medora-card space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <strong className="text-sm text-ink">{req.medicine_name}</strong>
                      <span className="px-2.5 py-0.5 rounded-full bg-field border border-line text-brand-ink font-bold">
                        {req.status}
                      </span>
                    </div>
                    <div className="text-ink-muted">
                      {req.pharmacy_name} • Qty: {req.requested_quantity} • {req.fulfilment_type}
                    </div>
                    {req.pharmacist_notes && <p className="text-ink-muted">{req.pharmacist_notes}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </AuthGate>
      )}

      {/* TAB 3: PHARMACY STAFF PORTAL */}
      {subTab === 'portal' && isPharmacyRole && (
        <div className="space-y-6">
          {!myPharmacy ? (
            <form onSubmit={handleRegisterPharmacy} className="max-w-xl p-6 medora-card space-y-3 text-xs">
              <h2 className="text-base font-bold text-ink">Register Your Pharmacy</h2>
              <p className="text-ink-muted">
                Provide verified address details and accurate map coordinates so nearby patients can locate your pharmacy reliably.
              </p>
              <input
                type="text"
                required
                placeholder="Pharmacy Name"
                value={regForm.name}
                onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                className="medora-input"
              />
              <input
                type="text"
                required
                placeholder="Drug License Number"
                value={regForm.license_number}
                onChange={(e) => setRegForm({ ...regForm, license_number: e.target.value })}
                className="medora-input"
              />
              <input
                type="text"
                required
                placeholder="Street Address"
                value={regForm.address}
                onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                className="medora-input"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="City / Town (e.g. Pollachi)"
                  value={regForm.city}
                  onChange={(e) => setRegForm({ ...regForm, city: e.target.value })}
                  className="medora-input"
                />
                <input
                  type="text"
                  required
                  placeholder="Phone"
                  value={regForm.phone}
                  onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                  className="medora-input"
                />
              </div>

              <div className="p-3 rounded-xl bg-field border border-line space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-ink">Geographical Coordinates (Required)</span>
                  <button
                    type="button"
                    onClick={handleGeocodeForRegistration}
                    className="text-[11px] font-bold text-brand-ink hover:underline"
                  >
                    Auto-Locate Address
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    step="0.0001"
                    required
                    placeholder="Latitude (e.g. 10.6589)"
                    value={regForm.latitude}
                    onChange={(e) => setRegForm({ ...regForm, latitude: e.target.value })}
                    className="medora-input font-mono"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    required
                    placeholder="Longitude (e.g. 77.0087)"
                    value={regForm.longitude}
                    onChange={(e) => setRegForm({ ...regForm, longitude: e.target.value })}
                    className="medora-input font-mono"
                  />
                </div>
              </div>

              <button type="submit" className="medora-btn-primary">
                Submit Pharmacy Registration
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="p-5 medora-card flex flex-wrap justify-between items-center gap-3 text-xs">
                <div>
                  <h2 className="text-lg font-bold text-ink">{myPharmacy.name}</h2>
                  <p className="text-ink-muted">
                    License: {myPharmacy.license_number} • {myPharmacy.address}, {myPharmacy.city}
                  </p>
                  <p className="font-mono text-[11px] text-ink-muted mt-1">
                    Coordinates: {myPharmacy.latitude}, {myPharmacy.longitude} •{' '}
                    {myPharmacy.coordinates_verified ? 'Coordinates Verified' : 'Coordinates Pending Admin Verification'}
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-field border border-line text-brand-ink font-bold">
                  Status: {myPharmacy.verification_status}
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <form onSubmit={handleAddInventoryItem} className="lg:col-span-4 p-5 medora-card space-y-3 text-xs">
                  <h3 className="font-bold text-sm text-brand-ink flex items-center gap-1.5">
                    <Plus className="w-4 h-4" />
                    <span>Add Inventory Medicine</span>
                  </h3>
                  <input
                    type="text"
                    required
                    placeholder="Medicine Name *"
                    value={newInvForm.medicine_name}
                    onChange={(e) => setNewInvForm({ ...newInvForm, medicine_name: e.target.value })}
                    className="medora-input"
                  />
                  <input
                    type="text"
                    placeholder="Brand"
                    value={newInvForm.brand}
                    onChange={(e) => setNewInvForm({ ...newInvForm, brand: e.target.value })}
                    className="medora-input"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Strength (e.g. 500mg)"
                      value={newInvForm.strength}
                      onChange={(e) => setNewInvForm({ ...newInvForm, strength: e.target.value })}
                      className="medora-input"
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      placeholder="Price (INR)"
                      value={newInvForm.unit_price}
                      onChange={(e) => setNewInvForm({ ...newInvForm, unit_price: Number(e.target.value) })}
                      className="medora-input"
                    />
                  </div>
                  <input
                    type="number"
                    min={0}
                    placeholder="Initial Stock Qty"
                    value={newInvForm.stock_quantity}
                    onChange={(e) => setNewInvForm({ ...newInvForm, stock_quantity: Number(e.target.value) })}
                    className="medora-input"
                  />
                  <label className="flex items-center gap-2 text-ink font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newInvForm.prescription_required}
                      onChange={(e) => setNewInvForm({ ...newInvForm, prescription_required: e.target.checked })}
                    />
                    <span>Prescription Required</span>
                  </label>
                  <button type="submit" className="medora-btn-primary w-full">
                    Add to Pharmacy Stock
                  </button>
                </form>

                <div className="lg:col-span-8 space-y-4">
                  <div className="p-5 medora-card space-y-3 text-xs">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-sm text-ink">Inventory ({portalInventory.length})</h3>
                      <button
                        type="button"
                        onClick={loadPortalData}
                        className="text-brand-ink font-semibold flex items-center gap-1 hover:underline"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Refresh
                      </button>
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {portalInventory.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 rounded-xl bg-field border border-line flex flex-wrap justify-between items-center gap-2"
                        >
                          <div>
                            <strong className="text-ink">{item.medicine_name}</strong> ({item.strength})
                            <span className="block text-ink-muted">
                              ₹{item.unit_price.toFixed(2)} • Stock {item.stock_quantity} (Reserved{' '}
                              {item.reserved_quantity})
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handlePortalStockUpdate(
                                  item.id,
                                  item.stock_quantity + 10,
                                  item.unit_price,
                                  true
                                )
                              }
                              className="px-2.5 py-1 rounded-lg bg-surface-alt border border-line text-brand-ink font-bold hover:border-brand"
                            >
                              +10 Stock
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handlePortalStockUpdate(
                                  item.id,
                                  item.stock_quantity,
                                  item.unit_price,
                                  !item.is_available
                                )
                              }
                              className="px-2.5 py-1 rounded-lg bg-surface text-ink border border-line hover:border-brand"
                            >
                              {item.is_available ? 'Mark Unavailable' : 'Mark Available'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Incoming Orders & Refills */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="p-5 medora-card space-y-2">
                      <h3 className="font-bold text-sm text-ink">Incoming Orders ({portalOrders.length})</h3>
                      {portalOrders.map((ord) => (
                        <div key={ord.id} className="p-3 rounded-xl bg-field border border-line space-y-2">
                          <div className="flex justify-between">
                            <strong className="font-mono text-brand-ink">{ord.order_number}</strong>
                            <span className="font-bold text-ink">{ord.status}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'COMPLETED', 'REJECTED'].map((st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => handlePortalOrderStatus(ord.id, st)}
                                className="px-2 py-0.5 rounded bg-surface-alt text-ink border border-line text-[10px] font-semibold hover:bg-brand hover:text-on-brand transition-colors"
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-5 medora-card space-y-2">
                      <h3 className="font-bold text-sm text-ink">Refill Requests ({portalRefills.length})</h3>
                      {portalRefills.map((req) => (
                        <div key={req.id} className="p-3 rounded-xl bg-field border border-line space-y-2">
                          <div className="flex justify-between">
                            <strong className="text-ink">
                              {req.medicine_name} (x{req.requested_quantity})
                            </strong>
                            <span className="font-bold text-brand-ink">{req.status}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {['ACCEPTED', 'READY_FOR_PICKUP', 'COMPLETED', 'REJECTED'].map((st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => handlePortalRefillStatus(req.id, st)}
                                className="px-2 py-0.5 rounded bg-surface-alt text-ink border border-line text-[10px] font-semibold hover:bg-brand hover:text-on-brand transition-colors"
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {portalTransactions.length > 0 && (
                <div className="p-5 medora-card space-y-2 text-xs">
                  <h3 className="font-bold text-sm text-ink">Recent Inventory Transactions</h3>
                  {portalTransactions.slice(0, 8).map((tx) => (
                    <div
                      key={tx.id}
                      className="p-2 rounded-lg bg-field border border-line flex justify-between font-mono text-[11px]"
                    >
                      <span className="text-ink">
                        {tx.tx_type} ({tx.quantity_change >= 0 ? `+${tx.quantity_change}` : tx.quantity_change}) → Bal{' '}
                        {tx.balance_after}
                      </span>
                      <span className="text-ink-muted">{tx.notes}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ADMIN PHARMACY VERIFICATION & COORDINATE MANAGEMENT */}
      {subTab === 'admin' && isAdminRole && (
        <div className="p-6 medora-card space-y-4 text-xs">
          <h2 className="text-base font-bold text-ink flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand-ink" />
            <span>Platform Admin — Pharmacy Verification &amp; Coordinates</span>
          </h2>
          {adminPharmacies.map((ph) => {
            const coordVal = adminCoordEdits[ph.id] || {
              lat: String(ph.latitude ?? ''),
              lng: String(ph.longitude ?? ''),
            };
            return (
              <div
                key={ph.id}
                className="p-4 rounded-2xl bg-field border border-line space-y-3"
              >
                <div className="flex flex-wrap justify-between items-start gap-3">
                  <div>
                    <strong className="text-sm text-ink">{ph.name}</strong>
                    <span className="block text-ink-muted">
                      License: {ph.license_number} • {ph.address}, {ph.city} • Origin: {ph.data_origin}
                    </span>
                    <span className="block font-mono text-[11px] text-ink-muted mt-0.5">
                      Coordinates: {ph.latitude}, {ph.longitude} •{' '}
                      {ph.coordinates_verified ? 'Coordinates Verified' : 'Coordinates Unverified'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-surface-alt border border-line text-brand-ink font-bold">
                      {ph.verification_status}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAdminVerifyPharmacy(ph.id, 'VERIFIED')}
                      className="px-3 py-1 rounded-lg bg-brand text-on-brand font-bold flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verify
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAdminVerifyPharmacy(ph.id, 'REJECTED')}
                      className="px-3 py-1 rounded-lg bg-danger text-on-danger font-bold flex items-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>

                {/* Inline Coordinate Correction Tool */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line">
                  <span className="text-[11px] font-semibold text-ink-muted">Edit Map Coordinates:</span>
                  <input
                    type="number"
                    step="0.0001"
                    aria-label={`Latitude for ${ph.name}`}
                    value={coordVal.lat}
                    onChange={(e) =>
                      setAdminCoordEdits((prev) => ({
                        ...prev,
                        [ph.id]: { ...coordVal, lat: e.target.value },
                      }))
                    }
                    className="medora-input w-28 font-mono py-1"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    aria-label={`Longitude for ${ph.name}`}
                    value={coordVal.lng}
                    onChange={(e) =>
                      setAdminCoordEdits((prev) => ({
                        ...prev,
                        [ph.id]: { ...coordVal, lng: e.target.value },
                      }))
                    }
                    className="medora-input w-28 font-mono py-1"
                  />
                  <button
                    type="button"
                    onClick={() => handleAdminSaveCoordinates(ph.id, true)}
                    className="px-3 py-1.5 rounded-lg bg-surface border border-brand text-brand-ink font-bold hover:bg-brand hover:text-on-brand transition-colors"
                  >
                    Save &amp; Verify Coordinates
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
