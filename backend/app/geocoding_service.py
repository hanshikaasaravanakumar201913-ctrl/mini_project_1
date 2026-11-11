"""Geographical geocoding service for Medora Pharmacy Discovery.

Resolution order:
1. Bounded in-memory TTL cache (prevents redundant external geocoding calls).
2. OpenCage Geocoding API when OPENCAGE_API_KEY is configured.
3. OpenStreetMap Nominatim HTTP API when external HTTP requests are available and permitted.
4. Built-in Indian regional gazetteer fallback when offline or rate-limited (explicitly flagged).
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Tuple

import httpx

from backend.app.config import settings

# (cache_key -> (expires_monotonic, results))
_GEOCODE_CACHE: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
_CACHE_TTL_SEC = 1800.0  # 30 minutes
_MAX_CACHE_SIZE = 250

# Built-in fallback coordinates for common cities, localities, and Tamil Nadu / India hubs
LOCAL_GAZETTEER: List[Dict[str, Any]] = [
    {
        "aliases": ["pollachi", "642001", "642002", "pollachi, tamil nadu"],
        "display_name": "Pollachi, Coimbatore District, Tamil Nadu 642001, India",
        "city": "Pollachi",
        "state": "Tamil Nadu",
        "postal_code": "642001",
        "latitude": 10.6589,
        "longitude": 77.0087,
    },
    {
        "aliases": ["coimbatore", "kovai", "gandhipuram", "rs puram", "641001", "641002", "641012"],
        "display_name": "Coimbatore, Tamil Nadu 641001, India",
        "city": "Coimbatore",
        "state": "Tamil Nadu",
        "postal_code": "641001",
        "latitude": 11.0168,
        "longitude": 76.9558,
    },
    {
        "aliases": ["erode", "638001", "638002"],
        "display_name": "Erode, Tamil Nadu 638001, India",
        "city": "Erode",
        "state": "Tamil Nadu",
        "postal_code": "638001",
        "latitude": 11.3410,
        "longitude": 77.7172,
    },
    {
        "aliases": ["chennai", "madras", "600001", "gopalapuram", "600086"],
        "display_name": "Chennai, Tamil Nadu 600001, India",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "postal_code": "600001",
        "latitude": 13.0827,
        "longitude": 80.2707,
    },
    {
        "aliases": ["anna nagar", "anna nagar, chennai", "600040"],
        "display_name": "Anna Nagar, Chennai, Tamil Nadu 600040, India",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "postal_code": "600040",
        "latitude": 13.0850,
        "longitude": 80.2101,
    },
    {
        "aliases": ["adyar", "adyar, chennai", "600020"],
        "display_name": "Adyar, Chennai, Tamil Nadu 600020, India",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "postal_code": "600020",
        "latitude": 13.0012,
        "longitude": 80.2565,
    },
    {
        "aliases": ["velachery", "600042"],
        "display_name": "Velachery, Chennai, Tamil Nadu 600042, India",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "postal_code": "600042",
        "latitude": 12.9815,
        "longitude": 80.2180,
    },
    {
        "aliases": ["madurai", "625001"],
        "display_name": "Madurai, Tamil Nadu 625001, India",
        "city": "Madurai",
        "state": "Tamil Nadu",
        "postal_code": "625001",
        "latitude": 9.9252,
        "longitude": 78.1198,
    },
    {
        "aliases": ["salem", "636001"],
        "display_name": "Salem, Tamil Nadu 636001, India",
        "city": "Salem",
        "state": "Tamil Nadu",
        "postal_code": "636001",
        "latitude": 11.6643,
        "longitude": 78.1460,
    },
    {
        "aliases": ["trichy", "tiruchirappalli", "620001"],
        "display_name": "Tiruchirappalli, Tamil Nadu 620001, India",
        "city": "Tiruchirappalli",
        "state": "Tamil Nadu",
        "postal_code": "620001",
        "latitude": 10.7905,
        "longitude": 78.7047,
    },
    {
        "aliases": ["bengaluru", "bangalore", "560001"],
        "display_name": "Bengaluru, Karnataka 560001, India",
        "city": "Bengaluru",
        "state": "Karnataka",
        "postal_code": "560001",
        "latitude": 12.9716,
        "longitude": 77.5946,
    },
    {
        "aliases": ["hyderabad", "500001"],
        "display_name": "Hyderabad, Telangana 500001, India",
        "city": "Hyderabad",
        "state": "Telangana",
        "postal_code": "500001",
        "latitude": 17.3850,
        "longitude": 78.4867,
    },
    {
        "aliases": ["mumbai", "400001"],
        "display_name": "Mumbai, Maharashtra 400001, India",
        "city": "Mumbai",
        "state": "Maharashtra",
        "postal_code": "400001",
        "latitude": 19.0760,
        "longitude": 72.8777,
    },
    {
        "aliases": ["delhi", "new delhi", "110001"],
        "display_name": "New Delhi, Delhi 110001, India",
        "city": "New Delhi",
        "state": "Delhi",
        "postal_code": "110001",
        "latitude": 28.6139,
        "longitude": 77.2090,
    },
]


def _lookup_local_gazetteer(query: str, limit: int) -> List[Dict[str, Any]]:
    norm = query.strip().lower()
    if not norm:
        return []
    matches: List[Dict[str, Any]] = []
    for entry in LOCAL_GAZETTEER:
        if any(norm == a or norm in a or a in norm for a in entry["aliases"]):
            matches.append(
                {
                    "display_name": entry["display_name"],
                    "city": entry["city"],
                    "state": entry["state"],
                    "postal_code": entry["postal_code"],
                    "latitude": entry["latitude"],
                    "longitude": entry["longitude"],
                    "provider": "local_gazetteer_fallback",
                    "is_fallback": True,
                }
            )
            if len(matches) >= limit:
                break
    return matches


def _query_opencage(query: str, limit: int) -> Optional[List[Dict[str, Any]]]:
    if not settings.OPENCAGE_API_KEY:
        return None
    try:
        with httpx.Client(timeout=4.0) as client:
            res = client.get(
                "https://api.opencagedata.com/geocode/v1/json",
                params={
                    "q": query,
                    "key": settings.OPENCAGE_API_KEY,
                    "limit": limit,
                    "countrycode": "in",
                    "no_annotations": 1,
                },
            )
            if res.status_code != 200:
                return None
            data = res.json()
            out: List[Dict[str, Any]] = []
            for item in data.get("results", []):
                geom = item.get("geometry", {})
                comp = item.get("components", {})
                lat = geom.get("lat")
                lng = geom.get("lng")
                if lat is None or lng is None:
                    continue
                out.append(
                    {
                        "display_name": item.get("formatted", query),
                        "city": comp.get("city") or comp.get("town") or comp.get("village") or comp.get("county"),
                        "state": comp.get("state"),
                        "postal_code": comp.get("postcode"),
                        "latitude": round(float(lat), 6),
                        "longitude": round(float(lng), 6),
                        "provider": "opencage",
                        "is_fallback": False,
                    }
                )
            return out
    except Exception:
        return None


def _query_nominatim(query: str, limit: int) -> Optional[List[Dict[str, Any]]]:
    try:
        with httpx.Client(
            timeout=4.0,
            headers={"User-Agent": settings.NOMINATIM_USER_AGENT},
        ) as client:
            res = client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": query,
                    "format": "jsonv2",
                    "addressdetails": 1,
                    "limit": limit,
                    "countrycodes": "in",
                },
            )
            if res.status_code != 200:
                return None
            rows = res.json()
            if not isinstance(rows, list):
                return None
            out: List[Dict[str, Any]] = []
            for row in rows:
                lat = row.get("lat")
                lon = row.get("lon")
                if lat is None or lon is None:
                    continue
                addr = row.get("address", {})
                out.append(
                    {
                        "display_name": row.get("display_name", query),
                        "city": addr.get("city") or addr.get("town") or addr.get("village") or addr.get("county"),
                        "state": addr.get("state"),
                        "postal_code": addr.get("postcode"),
                        "latitude": round(float(lat), 6),
                        "longitude": round(float(lon), 6),
                        "provider": "nominatim_osm",
                        "is_fallback": False,
                    }
                )
            return out
    except Exception:
        return None


def geocode_location(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    clean = (query or "").strip()
    if len(clean) < 2:
        return []

    cache_key = f"{clean.lower()}::{limit}::{settings.GEOCODING_PROVIDER}"
    now = time.monotonic()
    cached = _GEOCODE_CACHE.get(cache_key)
    if cached and cached[0] > now:
        return cached[1]

    provider_mode = settings.GEOCODING_PROVIDER
    results: Optional[List[Dict[str, Any]]] = None

    if provider_mode == "local_only":
        results = _lookup_local_gazetteer(clean, limit)
    elif provider_mode == "opencage":
        results = _query_opencage(clean, limit)
    elif provider_mode == "nominatim":
        results = _query_nominatim(clean, limit)
    else:
        # auto mode: OpenCage (if key) -> Nominatim (OSM) -> local regional gazetteer fallback
        if settings.OPENCAGE_API_KEY:
            results = _query_opencage(clean, limit)
        if results is None:
            results = _query_nominatim(clean, limit)
        if not results:
            local_hits = _lookup_local_gazetteer(clean, limit)
            if local_hits:
                results = local_hits

    final_results = results or []
    if len(_GEOCODE_CACHE) >= _MAX_CACHE_SIZE:
        _GEOCODE_CACHE.clear()
    _GEOCODE_CACHE[cache_key] = (now + _CACHE_TTL_SEC, final_results)
    return final_results
