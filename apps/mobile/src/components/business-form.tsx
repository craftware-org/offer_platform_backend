import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { api, errorMessage } from '@/lib/api';
import type { City, Day, Locality, OpeningHours, OwnerBusiness } from '@/lib/types';
import { CategoryPicker } from './form-fields';
import { colors } from './theme';
import { Body, Button, Card, ErrorText, Field, Heading, PickerField, Row, SwitchRow } from './ui';

const DAYS: [Day, string][] = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
];

type Hours = Record<Day, { open: boolean; from: string; to: string }>;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function toHours(h: OpeningHours | null | undefined): Hours {
  return Object.fromEntries(
    DAYS.map(([d]) => {
      const first = h?.[d]?.[0];
      return [d, { open: !!first, from: first?.open ?? '09:00', to: first?.close ?? '21:00' }];
    }),
  ) as Hours;
}

function fromHours(h: Hours): OpeningHours {
  return Object.fromEntries(DAYS.map(([d]) => [d, h[d].open ? [{ open: h[d].from, close: h[d].to }] : []]));
}

/**
 * Register a business (no `business`) or edit one. Fields the API has locked for the owner
 * (`lockedFields`, e.g. while under review) are shown read-only and never sent. Same rules as the
 * website's business form.
 */
export function BusinessForm({ business, onSaved }: { business?: OwnerBusiness; onSaved: (b: OwnerBusiness) => void }) {
  const locked = new Set(business?.lockedFields ?? []);
  const [cities, setCities] = useState<City[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [v, setV] = useState({
    name: business?.name ?? '',
    categoryId: business?.category.id ?? '',
    description: business?.description ?? '',
    phone: business?.contact.phone ?? '',
    whatsapp: business?.contact.whatsapp ?? '',
    email: business?.contact.email ?? '',
    website: business?.contact.website ?? '',
    registrationNumber: business?.registrationNumber ?? '',
    addressLine1: business?.address.line1 ?? '',
    addressLine2: business?.address.line2 ?? '',
    cityId: business?.address.city.id ?? '',
    localityId: business?.address.locality?.id ?? '',
    postalCode: business?.address.postalCode ?? '',
    latitude: business ? String(business.coordinates.latitude) : '',
    longitude: business ? String(business.coordinates.longitude) : '',
  });
  const [withHours, setWithHours] = useState(!!business?.openingHours);
  const [hours, setHours] = useState<Hours>(toHours(business?.openingHours));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const set = (key: keyof typeof v) => (text: string) => setV((s) => ({ ...s, [key]: text }));
  const lockNote = (field: string) => (locked.has(field) ? ' (locked during review)' : '');

  useEffect(() => {
    api<City[]>('/cities', { auth: false })
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  const citySlug = cities.find((c) => c.id === v.cityId)?.slug;
  useEffect(() => {
    if (!citySlug) {
      setLocalities([]);
      return;
    }
    api<Locality[]>(`/cities/${citySlug}/localities`, { auth: false })
      .then(setLocalities)
      .catch(() => setLocalities([]));
  }, [citySlug]);

  async function locateShop() {
    setLocating(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError('Location permission is off. Allow it in Settings, or enter the coordinates from Google Maps.');
        return;
      }
      // The shop's own position: high accuracy, used once, sent only as the shop's address point.
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setV((s) => ({ ...s, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
    } catch {
      setError('Could not get your location. Enter the coordinates from Google Maps instead.');
    } finally {
      setLocating(false);
    }
  }

  async function submit() {
    setError(null);
    const orNull = (s: string) => (s.trim() ? s.trim() : null);
    const lat = Number(v.latitude);
    const lng = Number(v.longitude);
    if (!locked.has('location') && (!v.latitude || !v.longitude || Number.isNaN(lat) || Number.isNaN(lng))) {
      setError('Set the shop location (use "I am at the shop now" or enter the coordinates).');
      return;
    }
    if (withHours) {
      const bad = DAYS.find(([d]) => hours[d].open && (!HHMM.test(hours[d].from) || !HHMM.test(hours[d].to)));
      if (bad) {
        setError(`Opening hours for ${bad[1]}: use 24-hour times like 09:00 and 21:30.`);
        return;
      }
    }
    const body: Record<string, unknown> = {
      name: v.name.trim(),
      categoryId: v.categoryId,
      description: orNull(v.description),
      phone: v.phone.trim(),
      whatsapp: orNull(v.whatsapp),
      email: orNull(v.email),
      website: orNull(v.website),
      registrationNumber: orNull(v.registrationNumber),
      openingHours: withHours ? fromHours(hours) : null,
      location: {
        addressLine1: v.addressLine1.trim(),
        addressLine2: orNull(v.addressLine2),
        cityId: v.cityId,
        localityId: v.localityId || null,
        postalCode: orNull(v.postalCode),
        latitude: lat,
        longitude: lng,
      },
    };
    for (const field of locked) delete body[field];
    if (!business) for (const [k, val] of Object.entries(body)) if (val === null) delete body[k];
    setBusy(true);
    try {
      const saved = business
        ? await api<OwnerBusiness>(`/me/businesses/${business.id}`, { method: 'PATCH', body })
        : await api<OwnerBusiness>('/me/businesses', { method: 'POST', body });
      onSaved(saved);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <Card>
        <Heading>About the business</Heading>
        <Field label={`Business name${lockNote('name')}`} value={v.name} onChangeText={set('name')} maxLength={120} editable={!locked.has('name')} />
        <CategoryPicker value={v.categoryId} onChange={(id) => setV((s) => ({ ...s, categoryId: id }))} />
        <Field label={`Shop phone${lockNote('phone')}`} value={v.phone} onChangeText={set('phone')} keyboardType="phone-pad" editable={!locked.has('phone')} />
        <Field label="WhatsApp" optional value={v.whatsapp} onChangeText={set('whatsapp')} keyboardType="phone-pad" />
        <Field label="Email" optional value={v.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Website" optional value={v.website} onChangeText={set('website')} keyboardType="url" autoCapitalize="none" placeholder="https://" />
        <Field
          label={`Shop registration number${lockNote('registrationNumber')}`}
          optional
          value={v.registrationNumber}
          onChangeText={set('registrationNumber')}
          editable={!locked.has('registrationNumber')}
        />
        <Field label="About the business" optional multiline maxLength={2000} value={v.description} onChangeText={set('description')} />
      </Card>

      <Card>
        <Heading>Address and map location{lockNote('location')}</Heading>
        <Field
          label="Shop / door number, building, street"
          value={v.addressLine1}
          onChangeText={set('addressLine1')}
          editable={!locked.has('location')}
          placeholder="Shop 12, Laxmi Complex, Station Road"
        />
        <Field label="Landmark" optional value={v.addressLine2} onChangeText={set('addressLine2')} editable={!locked.has('location')} />
        <PickerField
          label="City"
          value={v.cityId}
          disabled={locked.has('location')}
          options={cities.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(id) => setV((s) => ({ ...s, cityId: id, localityId: '' }))}
        />
        <PickerField
          label="Area / locality"
          optional
          value={v.localityId}
          disabled={locked.has('location') || !v.cityId}
          options={localities.map((l) => ({ value: l.id, label: l.name }))}
          onChange={set('localityId')}
        />
        <Field label="PIN code" optional value={v.postalCode} onChangeText={set('postalCode')} keyboardType="number-pad" maxLength={6} editable={!locked.has('location')} />
        {!locked.has('location') && (
          <Button title={locating ? 'Locating…' : '📍 I am at the shop now'} variant="secondary" busy={locating} onPress={() => void locateShop()} />
        )}
        <Row>
          <View style={{ flex: 1 }}>
            <Field label="Latitude" value={v.latitude} onChangeText={set('latitude')} keyboardType="decimal-pad" placeholder="15.3647" editable={!locked.has('location')} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Longitude" value={v.longitude} onChangeText={set('longitude')} keyboardType="decimal-pad" placeholder="75.1240" editable={!locked.has('location')} />
          </View>
        </Row>
        {v.latitude && v.longitude ? (
          <Button
            title="Check this location on Google Maps"
            variant="link"
            style={{ alignSelf: 'flex-start' }}
            onPress={() => void Linking.openURL(`https://www.google.com/maps?q=${encodeURIComponent(`${v.latitude},${v.longitude}`)}`)}
          />
        ) : null}
      </Card>

      <Card>
        <Heading>Opening hours</Heading>
        <SwitchRow label="Show opening hours" value={withHours} onChange={setWithHours} />
        {withHours &&
          DAYS.map(([d, label]) => (
            <View key={d} style={{ gap: 6, borderTopWidth: 1, borderColor: colors.border, paddingTop: 8 }}>
              <SwitchRow label={label} value={hours[d].open} onChange={(open) => setHours((h) => ({ ...h, [d]: { ...h[d], open } }))} />
              {hours[d].open ? (
                <Row>
                  <View style={{ flex: 1 }}>
                    <Field label="Opens" value={hours[d].from} maxLength={5} keyboardType="numbers-and-punctuation" onChangeText={(t) => setHours((h) => ({ ...h, [d]: { ...h[d], from: t } }))} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label="Closes" value={hours[d].to} maxLength={5} keyboardType="numbers-and-punctuation" onChangeText={(t) => setHours((h) => ({ ...h, [d]: { ...h[d], to: t } }))} />
                  </View>
                </Row>
              ) : (
                <Text style={{ color: colors.textFaint }}>Closed</Text>
              )}
            </View>
          ))}
        {withHours && <Body muted small>Use 24-hour times, e.g. 09:00 and 21:30.</Body>}
      </Card>

      <ErrorText>{error}</ErrorText>
      <Button title={busy ? 'Saving…' : business ? 'Save changes' : 'Register business'} busy={busy} onPress={() => void submit()} />
    </View>
  );
}
