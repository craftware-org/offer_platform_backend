'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Where the customer is browsing from. GPS coordinates are sent with each discovery request only
 * (the API never stores them) and are kept just in this browser tab (sessionStorage).
 */
export type CustomerLocation =
  | { kind: 'gps'; lat: number; lng: number }
  | { kind: 'city'; slug: string; name: string };

const KEY = 'offer-platform.location';
const RADIUS_KEY = 'offer-platform.radius';

function read<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode): keep it in memory only
  }
}

export function useCustomerLocation(defaultRadiusKm: number) {
  const [location, setLocationState] = useState<CustomerLocation | null>(null);
  const [radiusKm, setRadiusState] = useState(defaultRadiusKm);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLocationState(read<CustomerLocation>(KEY));
    setRadiusState(read<number>(RADIUS_KEY) ?? defaultRadiusKm);
    setReady(true);
  }, [defaultRadiusKm]);

  const setLocation = useCallback((value: CustomerLocation | null) => {
    setLocationState(value);
    write(KEY, value);
  }, []);

  const setRadius = useCallback((km: number) => {
    setRadiusState(km);
    write(RADIUS_KEY, km);
  }, []);

  const locateMe = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('Location is not available in this browser. Choose your city instead.');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        // ~11 m precision is plenty for "near me" and avoids sending an exact position.
        const round = (n: number) => Math.round(n * 10_000) / 10_000;
        setLocation({ kind: 'gps', lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) });
      },
      () => {
        setLocating(false);
        setError('Could not get your location. Allow location access or choose your city.');
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 },
    );
  }, [setLocation]);

  /** Query parameters for /discover/*. */
  const query =
    location?.kind === 'gps'
      ? { lat: location.lat, lng: location.lng, radiusKm }
      : location?.kind === 'city'
        ? { city: location.slug }
        : {};

  return { location, setLocation, radiusKm, setRadius, locateMe, locating, error, ready, query };
}
