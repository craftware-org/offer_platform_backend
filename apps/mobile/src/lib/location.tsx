import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { secureStorage } from './secure-storage';

/**
 * Where the customer is browsing from. GPS coordinates are sent with each discovery request only (the
 * API never stores them) and are kept in memory only, never saved on the phone. A chosen city is
 * remembered between launches.
 */
export type CustomerLocation =
  | { kind: 'gps'; lat: number; lng: number }
  | { kind: 'city'; slug: string; name: string };

const CITY_KEY = 'op.city';

/** ~11 m precision is plenty for "near me" and avoids sending an exact position. */
export const roundCoord = (n: number) => Math.round(n * 10_000) / 10_000;

interface LocationState {
  location: CustomerLocation | null;
  setLocation(value: CustomerLocation | null): void;
  radiusKm: number;
  setRadius(km: number): void;
  locateMe(): Promise<void>;
  locating: boolean;
  error: string | null;
  ready: boolean;
  /** Query parameters for /discover/*. */
  query: Record<string, string | number>;
}

const LocationContext = createContext<LocationState | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const { meta } = useAuth();
  const [location, setLocationState] = useState<CustomerLocation | null>(null);
  const [radiusKm, setRadius] = useState(meta.discovery.defaultRadiusKm);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void secureStorage.get(CITY_KEY).then((raw) => {
      if (raw) {
        try {
          setLocationState(JSON.parse(raw) as CustomerLocation);
        } catch {
          // ignore a damaged value
        }
      }
      setReady(true);
    });
  }, []);

  const setLocation = useCallback((value: CustomerLocation | null) => {
    setLocationState(value);
    setError(null);
    if (value?.kind === 'city') void secureStorage.set(CITY_KEY, JSON.stringify(value));
    else if (value === null) void secureStorage.remove(CITY_KEY);
  }, []);

  const locateMe = useCallback(async () => {
    setLocating(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError('Location permission is off. Allow it in Settings, or choose your city instead.');
        return;
      }
      const pos =
        (await Location.getLastKnownPositionAsync({ maxAge: 300_000 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      setLocationState({ kind: 'gps', lat: roundCoord(pos.coords.latitude), lng: roundCoord(pos.coords.longitude) });
    } catch {
      setError('Could not get your location. Turn on location, or choose your city instead.');
    } finally {
      setLocating(false);
    }
  }, []);

  const value = useMemo<LocationState>(() => {
    const query: Record<string, string | number> =
      location?.kind === 'gps'
        ? { lat: location.lat, lng: location.lng, radiusKm }
        : location?.kind === 'city'
          ? { city: location.slug }
          : {};
    return { location, setLocation, radiusKm, setRadius, locateMe, locating, error, ready, query };
  }, [location, setLocation, radiusKm, locateMe, locating, error, ready]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useCustomerLocation(): LocationState {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useCustomerLocation outside LocationProvider');
  return ctx;
}
