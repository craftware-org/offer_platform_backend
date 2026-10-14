import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCustomerLocation } from '@/lib/location';
import type { City } from '@/lib/types';
import { Button, Card, ErrorText, PickerField, Segmented } from './ui';
import { colors } from './theme';

/** "Use my location" or a city, plus the radius for GPS searches. */
export function LocationBar() {
  const { meta } = useAuth();
  const state = useCustomerLocation();
  const [cities, setCities] = useState<City[]>([]);
  useEffect(() => {
    api<City[]>('/cities', { auth: false })
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  const { location } = state;
  return (
    <Card>
      <Text style={{ color: colors.textMuted }}>
        {location?.kind === 'gps'
          ? 'Showing offers near you'
          : location?.kind === 'city'
            ? `Showing offers in ${location.name}`
            : 'Choose where to look'}
      </Text>
      <Button
        title={state.locating ? 'Locating…' : '📍 Use my location'}
        variant="secondary"
        busy={state.locating}
        onPress={() => void state.locateMe()}
      />
      <PickerField
        label="Or choose a city"
        value={location?.kind === 'city' ? location.slug : ''}
        options={cities.map((c) => ({ value: c.slug, label: c.name }))}
        onChange={(slug) => {
          const city = cities.find((c) => c.slug === slug);
          state.setLocation(city ? { kind: 'city', slug: city.slug, name: city.name } : null);
        }}
      />
      {location?.kind === 'gps' && (
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.textMuted }}>Within</Text>
          <Segmented
            options={meta.discovery.radiusOptionsKm.map((km) => ({ value: km, label: `${km} km` }))}
            value={state.radiusKm}
            onChange={state.setRadius}
          />
        </View>
      )}
      <ErrorText>{state.error}</ErrorText>
    </Card>
  );
}
