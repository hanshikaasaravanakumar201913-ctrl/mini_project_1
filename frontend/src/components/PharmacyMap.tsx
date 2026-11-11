import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { NearbyPharmacyResult } from '../types';
import { useTheme } from '../context/ThemeContext';
import { AlertTriangle, Compass, Layers } from 'lucide-react';

interface PharmacyMapProps {
  pharmacies: NearbyPharmacyResult[];
  centerLat: number | null;
  centerLng: number | null;
  radiusKm: number;
  locationLabel?: string;
  selectedPharmacyId: number | null;
  hasUserLocation?: boolean;
  onSelectPharmacy: (pharmacy: NearbyPharmacyResult) => void;
  onInspectPharmacy: (pharmacyId: number) => void;
}

function escapeHtml(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidCoords(lat?: number | null, lng?: number | null): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) return false;
  return true;
}

export const PharmacyMap: React.FC<PharmacyMapProps> = ({
  pharmacies,
  centerLat,
  centerLng,
  radiusKm,
  locationLabel,
  selectedPharmacyId,
  hasUserLocation = false,
  onSelectPharmacy,
  onInspectPharmacy,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const centerLayerRef = useRef<L.LayerGroup | null>(null);
  const markerByIdRef = useRef<Map<number, L.Marker>>(new Map());
  const prevBoundsKeyRef = useRef<string>('');

  const { resolvedTheme } = useTheme();
  const [tileError, setTileError] = useState(false);
  const [tileCountLoaded, setTileCountLoaded] = useState(0);

  // Initialize Leaflet Map instance once cleanly
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [11.1271, 78.6569], // Broad Tamil Nadu regional framing before user picks/detects city
      zoom: 7,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    });

    tiles.on('tileload', () => {
      setTileCountLoaded((c) => c + 1);
      setTileError(false);
    });
    tiles.on('tileerror', () => {
      setTileError(true);
    });
    tiles.addTo(map);

    const centerLayer = L.layerGroup().addTo(map);
    const markersLayer = L.layerGroup().addTo(map);

    mapRef.current = map;
    centerLayerRef.current = centerLayer;
    markersLayerRef.current = markersLayer;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      centerLayerRef.current = null;
      markerByIdRef.current.clear();
    };
  }, []);

  // Update Search Center + Radius Circle
  useEffect(() => {
    const map = mapRef.current;
    const centerLayer = centerLayerRef.current;
    if (!map || !centerLayer) return;

    centerLayer.clearLayers();
    if (isValidCoords(centerLat, centerLng)) {
      const latlng: L.LatLngExpression = [centerLat!, centerLng!];

      L.circle(latlng, {
        radius: radiusKm * 1000,
        color: resolvedTheme === 'light' ? '#087F7A' : '#12B8B0',
        weight: 1.5,
        dashArray: '5 5',
        fillColor: resolvedTheme === 'light' ? '#12AFA7' : '#12B8B0',
        fillOpacity: 0.08,
      }).addTo(centerLayer);

      const userPin = L.divIcon({
        className: 'medora-user-pin',
        html: `<div style="width:18px;height:18px;border-radius:9999px;background:${
          hasUserLocation ? '#2563EB' : resolvedTheme === 'light' ? '#087F7A' : '#12B8B0'
        };border:3px solid #FFFFFF;box-shadow:0 0 0 4px rgba(18,184,176,0.35);"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      const centerMarker = L.marker(latlng, { icon: userPin, zIndexOffset: 500 }).addTo(centerLayer);
      centerMarker.bindPopup(
        `<div style="font-size:12px;line-height:1.4"><strong>${escapeHtml(
          hasUserLocation ? 'Your Current Location' : locationLabel || 'Search Center'
        )}</strong><br/><span style="opacity:0.75;font-family:monospace">${centerLat!.toFixed(4)}, ${centerLng!.toFixed(
          4
        )} • ${radiusKm} km radius</span></div>`
      );
    }
  }, [centerLat, centerLng, radiusKm, hasUserLocation, locationLabel, resolvedTheme]);

  // Synchronize Pharmacy Markers + Popups + Bounds
  useEffect(() => {
    const map = mapRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();
    markerByIdRef.current.clear();

    const validPharmacies = pharmacies.filter((p) => isValidCoords(p.latitude, p.longitude));
    const placedPositions: { lat: number; lng: number }[] = [];

    validPharmacies.forEach((ph) => {
      // Subtle anti-overlap radial offset if two pharmacies share near-identical coordinates
      const overlapCount = placedPositions.filter(
        (pos) => Math.abs(pos.lat - ph.latitude) < 0.0005 && Math.abs(pos.lng - ph.longitude) < 0.0005
      ).length;
      const angle = overlapCount * (Math.PI / 3);
      const radiusOffset = overlapCount > 0 ? 0.0012 : 0;
      const lat = ph.latitude + Math.sin(angle) * radiusOffset;
      const lng = ph.longitude + Math.cos(angle) * radiusOffset;
      placedPositions.push({ lat, lng });

      const isSelected = ph.id === selectedPharmacyId;
      const isVerified = ph.verification_status === 'VERIFIED' && !ph.location_needs_verification;
      const isDemo = ph.data_origin === 'SAMPLE_DEMO';

      const bgColor = isSelected
        ? resolvedTheme === 'light'
          ? '#BD4631'
          : '#D97F6C'
        : isVerified
        ? resolvedTheme === 'light'
          ? '#087F7A'
          : '#12B8B0'
        : '#D97706';

      const textColor = isSelected || resolvedTheme === 'light' ? '#FFFFFF' : '#0E393D';
      const size = isSelected ? 34 : 28;

      const pinIcon = L.divIcon({
        className: 'medora-pharmacy-pin',
        html: `<div style="position:relative;width:${size}px;height:${size}px;border-radius:9999px;background:${bgColor};color:${textColor};border:2.5px solid #FFFFFF;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${
          isSelected ? '13px' : '11px'
        };box-shadow:0 4px 12px rgba(0,0,0,0.35);transition:transform 0.15s ease;">Rx${
          isDemo
            ? '<span style="position:absolute;top:-4px;right:-6px;padding:0 3px;border-radius:4px;background:#153F40;color:#F3EDE6;font-size:8px;line-height:1.3;border:1px solid #fff;">D</span>'
            : ''
        }</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([lat, lng], {
        icon: pinIcon,
        zIndexOffset: isSelected ? 1000 : 100,
      }).addTo(markersLayer);

      const openColor = resolvedTheme === 'light' ? '#0B6B58' : '#5EEAD4';
      const closedColor = resolvedTheme === 'light' ? '#B8432E' : '#FDA4AF';
      const openStatus =
        ph.is_open_now === true
          ? `<span style="color:${openColor};font-weight:700">Open Now</span>`
          : ph.is_open_now === false
          ? `<span style="color:${closedColor};font-weight:700">Closed Now</span>`
          : '<span style="opacity:0.8">Hours Unverified</span>';

      const medSummary =
        ph.matching_medicines && ph.matching_medicines.length > 0
          ? `<div style="margin-top:6px;padding:4px 6px;border-radius:6px;background:rgba(18,184,176,0.12);font-size:11px;">
              <strong>${escapeHtml(ph.matching_medicines[0].medicine_name)}</strong>: ₹${ph.matching_medicines[0].unit_price.toFixed(
              2
            )} (${ph.matching_medicines[0].available_quantity} in stock)${
              ph.matching_medicines.length > 1 ? ` +${ph.matching_medicines.length - 1} more` : ''
            }
            </div>`
          : '';

      const popupEl = document.createElement('div');
      popupEl.style.minWidth = '215px';
      popupEl.style.maxWidth = '270px';
      popupEl.style.fontSize = '12px';
      popupEl.style.lineHeight = '1.4';
      popupEl.innerHTML = `
        <div style="font-weight:800;font-size:13px;margin-bottom:2px;">${escapeHtml(ph.name)}</div>
        <div style="opacity:0.8;font-size:11px;">${escapeHtml(ph.address)}, ${escapeHtml(ph.city)}</div>
        <div style="margin-top:5px;display:flex;flex-wrap:wrap;gap:4px;font-size:10px;font-weight:700;">
          <span style="padding:1px 6px;border-radius:999px;background:${
            isVerified ? 'rgba(18,184,176,0.18)' : 'rgba(217,119,6,0.2)'
          };">${escapeHtml(isVerified ? 'Verified Partner' : 'Location Needs Verification')}</span>
          ${
            isDemo
              ? '<span style="padding:1px 6px;border-radius:999px;background:rgba(217,127,108,0.2);">Sample Demo</span>'
              : ''
          }
        </div>
        <div style="margin-top:5px;font-size:11px;">
          ${ph.distance_km !== null && ph.distance_km !== undefined ? `<strong>${ph.distance_km} km away</strong> • ` : ''}${openStatus}
        </div>
        <div style="margin-top:2px;font-size:11px;opacity:0.85;">
          ${ph.business_hours ? `${escapeHtml(ph.business_hours)} • ` : ''}${
        ph.supports_pickup ? 'Pickup' : ''
      }${ph.supports_pickup && ph.supports_delivery ? ' & ' : ''}${ph.supports_delivery ? 'Delivery' : ''}
        </div>
        ${medSummary}
        <button type="button" data-inspect-id="${ph.id}" style="margin-top:8px;width:100%;padding:6px 10px;border-radius:8px;border:none;background:${
        resolvedTheme === 'light' ? '#087F7A' : '#12B8B0'
      };color:${
        resolvedTheme === 'light' ? '#FFFFFF' : '#0E393D'
      };font-weight:700;font-size:11px;cursor:pointer;">View Pharmacy Details & Stock</button>
      `;

      const btn = popupEl.querySelector('[data-inspect-id]');
      btn?.addEventListener('click', () => {
        onInspectPharmacy(ph.id);
      });

      marker.bindPopup(popupEl);
      marker.on('click', () => {
        onSelectPharmacy(ph);
      });

      markerByIdRef.current.set(ph.id, marker);
    });

    // Fit bounds nicely around user center and matching markers only when location, radius, or pharmacy list changes
    const boundsKey = JSON.stringify({
      centerLat,
      centerLng,
      radiusKm,
      ids: validPharmacies.map((p) => p.id),
    });
    if (boundsKey !== prevBoundsKeyRef.current) {
      prevBoundsKeyRef.current = boundsKey;
      if (isValidCoords(centerLat, centerLng)) {
        if (validPharmacies.length > 0) {
          const pts: L.LatLngExpression[] = [
            [centerLat!, centerLng!],
            ...validPharmacies.map((p) => [p.latitude, p.longitude] as L.LatLngExpression),
          ];
          const bounds = L.latLngBounds(pts);
          map.fitBounds(bounds, { padding: [38, 38], maxZoom: 14 });
        } else {
          const zoom = radiusKm <= 5 ? 13 : radiusKm <= 12 ? 12 : radiusKm <= 30 ? 11 : 10;
          map.setView([centerLat!, centerLng!], zoom);
        }
      } else if (validPharmacies.length > 0) {
        const bounds = L.latLngBounds(
          validPharmacies.map((p) => [p.latitude, p.longitude] as L.LatLngExpression)
        );
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      }
    }
  }, [pharmacies, centerLat, centerLng, radiusKm, resolvedTheme]);

  // Synchronize external list selection -> open marker popup & pan smoothly
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedPharmacyId) return;
    const marker = markerByIdRef.current.get(selectedPharmacyId);
    if (marker) {
      map.panTo(marker.getLatLng(), { animate: true });
      marker.openPopup();
    }
  }, [selectedPharmacyId]);

  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map) return;
    const valid = pharmacies.filter((p) => isValidCoords(p.latitude, p.longitude));
    if (isValidCoords(centerLat, centerLng)) {
      if (valid.length > 0) {
        map.fitBounds(
          L.latLngBounds([
            [centerLat!, centerLng!],
            ...valid.map((p) => [p.latitude, p.longitude] as L.LatLngExpression),
          ]),
          { padding: [38, 38], maxZoom: 14 }
        );
      } else {
        map.setView([centerLat!, centerLng!], 12);
      }
    } else if (valid.length > 0) {
      map.fitBounds(
        L.latLngBounds(valid.map((p) => [p.latitude, p.longitude] as L.LatLngExpression)),
        { padding: [40, 40], maxZoom: 12 }
      );
    }
  };

  return (
    <div className="space-y-2.5">
      <div
        className={`relative rounded-2xl overflow-hidden border border-line bg-field ${
          resolvedTheme === 'dark' ? 'medora-leaflet-dark' : ''
        }`}
      >
        {/* Keep containerRef className static so React never strips Leaflet's runtime .leaflet-container classes */}
        <div
          ref={containerRef}
          className="w-full h-72 sm:h-80"
          aria-label="Interactive OpenStreetMap Pharmacy Discovery Map"
        />

        <button
          type="button"
          onClick={handleRecenter}
          title="Fit all visible markers"
          className="absolute top-3 end-3 z-[400] px-2.5 py-1.5 rounded-xl bg-surface/95 text-ink border border-line hover:border-brand text-[11px] font-bold shadow-card flex items-center gap-1"
        >
          <Compass className="w-3.5 h-3.5 text-brand-ink" />
          <span>Fit Map</span>
        </button>

        {tileError && tileCountLoaded === 0 && (
          <div
            role="status"
            className="absolute bottom-3 start-3 end-3 z-[400] p-2.5 rounded-xl bg-surface/95 border border-warning text-[11px] text-warning-ink flex items-center gap-2 shadow-card"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Map street tiles could not load (offline or blocked). Coordinates, distances, and verified pharmacy addresses remain active below.
            </span>
          </div>
        )}
      </div>

      {/* Clear Marker Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-muted px-1">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-brand inline-block border border-white" />
            <span>Verified Pharmacy (D = Demo Sample)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-warning inline-block border border-white" />
            <span>Pending Verification</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-danger inline-block border border-white" />
            <span>Selected</span>
          </span>
        </div>
        <span className="inline-flex items-center gap-1 font-mono">
          <Layers className="w-3 h-3 text-brand-ink" />
          <span>OpenStreetMap • {pharmacies.length} plotted</span>
        </span>
      </div>
    </div>
  );
};
