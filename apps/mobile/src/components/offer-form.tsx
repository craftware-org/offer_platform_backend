import { useState } from 'react';
import { View } from 'react-native';
import { api, errorMessage } from '@/lib/api';
import { buildPricing, EMPTY_PRICING, OFFER_TYPE_LABELS, pricingToFields, type PricingFields } from '@/lib/offer-form';
import { toOffsetIso } from '@/lib/time';
import { OFFER_TYPES, type OfferType, type OwnerOffer } from '@/lib/types';
import { CategoryPicker, DateTimeField } from './form-fields';
import { Body, Button, Card, ErrorText, Field, Heading, Notice, PickerField, SwitchRow } from './ui';

/** Create an offer for `businessId`, or edit `offer`. Same validation as the website (the API re-checks). */
export function OfferForm({
  businessId,
  defaultCategoryId,
  offer,
  onSaved,
}: {
  businessId?: string;
  defaultCategoryId?: string;
  offer?: OwnerOffer;
  onSaved: (o: OwnerOffer) => void;
}) {
  const [type, setType] = useState<OfferType>(offer?.type ?? 'PERCENTAGE_OFF');
  const [pricing, setPricing] = useState<PricingFields>(offer ? pricingToFields(offer.pricing) : EMPTY_PRICING);
  const [v, setV] = useState(() => ({
    title: offer?.title ?? '',
    categoryId: offer?.category.id ?? defaultCategoryId ?? '',
    description: offer?.description ?? '',
    terms: offer?.terms ?? '',
    eligibility: offer?.eligibility ?? '',
    quantityLimit: offer?.quantityLimit ? String(offer.quantityLimit) : '',
  }));
  // New offers default to "from now, for one week".
  const [startsAt, setStartsAt] = useState(() => (offer ? new Date(offer.startsAt) : new Date()));
  const [expiresAt, setExpiresAt] = useState(() => (offer ? new Date(offer.expiresAt) : new Date(Date.now() + 7 * 86_400_000)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof v) => (text: string) => setV((s) => ({ ...s, [key]: text }));
  const setP = (key: keyof PricingFields) => (text: string) => setPricing((s) => ({ ...s, [key]: text }));

  async function submit() {
    setError(null);
    const built = buildPricing(type, pricing);
    const fieldErrors: Record<string, string> = built.ok ? {} : { ...built.errors };
    if (v.title.trim().length < 3) fieldErrors.title = 'Write a title of at least 3 characters';
    if (!v.categoryId) fieldErrors.categoryId = 'Choose a category';
    if (expiresAt <= startsAt) fieldErrors.expiresAt = 'The offer must end after it starts';
    if (v.quantityLimit && !/^[1-9]\d{0,6}$/.test(v.quantityLimit.trim())) fieldErrors.quantityLimit = 'Enter a whole number';
    setErrors(fieldErrors);
    if (!built.ok || Object.keys(fieldErrors).length) {
      setError('Please fix the highlighted fields.');
      return;
    }

    const orNull = (s: string) => (s.trim() ? s.trim() : null);
    const body: Record<string, unknown> = {
      title: v.title.trim(),
      categoryId: v.categoryId,
      pricing: built.pricing,
      startsAt: toOffsetIso(startsAt),
      expiresAt: toOffsetIso(expiresAt),
      description: orNull(v.description),
      terms: orNull(v.terms),
      eligibility: orNull(v.eligibility),
      quantityLimit: v.quantityLimit ? Number(v.quantityLimit) : null,
    };
    if (!offer) for (const [k, val] of Object.entries(body)) if (val === null) delete body[k];

    setBusy(true);
    try {
      const saved = offer
        ? await api<OwnerOffer>(`/me/offers/${offer.id}`, { method: 'PATCH', body })
        : await api<OwnerOffer>(`/me/businesses/${businessId}/offers`, { method: 'POST', body });
      onSaved(saved);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const money = (key: keyof PricingFields, label: string, required = false) => (
    <Field
      key={key}
      label={`${label} (₹)`}
      optional={!required}
      value={String(pricing[key])}
      onChangeText={setP(key)}
      keyboardType="decimal-pad"
      error={errors[key]}
    />
  );
  const whole = (key: keyof PricingFields, label: string) => (
    <Field key={key} label={label} value={String(pricing[key])} onChangeText={setP(key)} keyboardType="number-pad" error={errors[key]} />
  );

  return (
    <View style={{ gap: 16 }}>
      {offer?.editRequiresReview && (
        <Notice>This offer is approved. Saving changes sends it back to admin review, and it is hidden until approved again.</Notice>
      )}
      <Card>
        <Field label="Offer title" value={v.title} onChangeText={set('title')} maxLength={120} placeholder="Diwali sale on all sarees" error={errors.title} />
        <PickerField
          label="Offer type"
          value={type}
          options={OFFER_TYPES.map((t) => ({ value: t, label: OFFER_TYPE_LABELS[t] }))}
          onChange={(t) => setType(t as OfferType)}
        />
        <CategoryPicker value={v.categoryId} onChange={(id) => setV((s) => ({ ...s, categoryId: id }))} error={errors.categoryId} />
      </Card>

      <Card>
        <Heading>Price details</Heading>
        {type === 'PRICE_DROP' && (
          <>
            {money('originalPrice', 'Original price', true)}
            {money('offerPrice', 'Offer price', true)}
            <Body muted small>The discount % is calculated automatically.</Body>
          </>
        )}
        {type === 'PERCENTAGE_OFF' && (
          <>
            {whole('discountPercent', 'Discount %')}
            <SwitchRow label="“Up to” (varies by item)" value={pricing.isUpTo} onChange={(isUpTo) => setPricing((s) => ({ ...s, isUpTo }))} />
            {money('maxDiscountAmount', 'Maximum discount')}
            {money('minPurchaseAmount', 'Minimum purchase')}
          </>
        )}
        {type === 'FLAT_AMOUNT_OFF' && (
          <>
            {money('flatAmountOff', 'Amount off', true)}
            {money('minPurchaseAmount', 'Minimum purchase')}
          </>
        )}
        {type === 'BUY_X_GET_Y' && (
          <>
            {whole('buyQuantity', 'Buy (quantity)')}
            {whole('getQuantity', 'Get free (quantity)')}
            <Field label="On which item" optional value={pricing.itemName} onChangeText={setP('itemName')} />
          </>
        )}
        {type === 'FREE_GIFT' && (
          <>
            <Field label="Free gift" value={pricing.itemName} onChangeText={setP('itemName')} placeholder="Steel water bottle" error={errors.itemName} />
            {money('minPurchaseAmount', 'Minimum purchase')}
          </>
        )}
        {type === 'COMBO' && (
          <>
            {money('offerPrice', 'Combo price', true)}
            {money('originalPrice', 'Price if bought separately')}
            <Field label="Items in the combo (one per line)" multiline value={pricing.comboItems} onChangeText={setP('comboItems')} error={errors.comboItems} />
          </>
        )}
        {type === 'OTHER' && <Body muted>Describe the offer in the details below.</Body>}
      </Card>

      <Card>
        <DateTimeField label="Starts" value={startsAt} onChange={setStartsAt} />
        <DateTimeField label="Ends" value={expiresAt} onChange={setExpiresAt} minimumDate={startsAt} error={errors.expiresAt} />
      </Card>

      <Card>
        <Field label="Details" optional multiline maxLength={2000} value={v.description} onChangeText={set('description')} />
        <Field label="Terms" optional multiline maxLength={2000} value={v.terms} onChangeText={set('terms')} />
        <Field label="Who can use it" optional multiline maxLength={500} value={v.eligibility} onChangeText={set('eligibility')} />
        <Field
          label="Limited to how many customers"
          optional
          value={v.quantityLimit}
          onChangeText={set('quantityLimit')}
          keyboardType="number-pad"
          error={errors.quantityLimit}
        />
      </Card>

      <ErrorText>{error}</ErrorText>
      <Button title={busy ? 'Saving…' : offer ? 'Save changes' : 'Save as draft'} busy={busy} onPress={() => void submit()} />
    </View>
  );
}
