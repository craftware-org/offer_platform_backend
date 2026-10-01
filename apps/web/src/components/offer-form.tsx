'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { buildPricing, EMPTY_PRICING, OFFER_TYPE_LABELS, pricingToFields, type PricingFields } from '@/lib/offer-form';
import { isoToLocalInput, localInputToIso } from '@/lib/time';
import { OFFER_TYPES, type OfferType, type OwnerOffer } from '@/lib/types';
import { CategorySelect } from './category-select';

/** Create an offer for `businessId`, or edit `offer`. */
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
  const [v, setV] = useState(() => {
    // New offers default to "from now, for one week".
    const now = new Date();
    return {
      title: offer?.title ?? '',
      categoryId: offer?.category.id ?? defaultCategoryId ?? '',
      description: offer?.description ?? '',
      terms: offer?.terms ?? '',
      eligibility: offer?.eligibility ?? '',
      quantityLimit: offer?.quantityLimit ? String(offer.quantityLimit) : '',
      startsAt: isoToLocalInput(offer?.startsAt ?? now),
      expiresAt: isoToLocalInput(offer?.expiresAt ?? new Date(now.getTime() + 7 * 86_400_000)),
    };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [key]: e.target.value }));
  const setP = (key: keyof PricingFields) => (e: { target: { value: string } }) =>
    setPricing((s) => ({ ...s, [key]: e.target.value }));

  async function submit() {
    setError(null);
    const built = buildPricing(type, pricing);
    const startsAt = localInputToIso(v.startsAt);
    const expiresAt = localInputToIso(v.expiresAt);
    const fieldErrors: Record<string, string> = built.ok ? {} : { ...built.errors };
    if (!startsAt) fieldErrors.startsAt = 'Choose a start date';
    if (!expiresAt) fieldErrors.expiresAt = 'Choose an end date';
    if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) fieldErrors.expiresAt = 'The offer must end after it starts';
    if (v.quantityLimit && !/^[1-9]\d{0,6}$/.test(v.quantityLimit.trim())) fieldErrors.quantityLimit = 'Enter a whole number';
    setErrors(fieldErrors);
    if (!built.ok || Object.keys(fieldErrors).length) return;

    const orNull = (s: string) => (s.trim() ? s.trim() : null);
    const body: Record<string, unknown> = {
      title: v.title.trim(),
      categoryId: v.categoryId,
      pricing: built.pricing,
      startsAt,
      expiresAt,
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
    <div>
      <label className="label" htmlFor={`p-${key}`}>
        {label} {required ? '' : <span className="text-gray-500">(optional)</span>}
      </label>
      <div className="flex items-center gap-1">
        <span className="text-gray-500">₹</span>
        <input id={`p-${key}`} className="input" inputMode="decimal" value={String(pricing[key])} onChange={setP(key)} />
      </div>
      {errors[key] && <p className="mt-1 text-xs text-red-600">{errors[key]}</p>}
    </div>
  );
  const whole = (key: keyof PricingFields, label: string) => (
    <div>
      <label className="label" htmlFor={`p-${key}`}>
        {label}
      </label>
      <input id={`p-${key}`} className="input" inputMode="numeric" value={String(pricing[key])} onChange={setP(key)} />
      {errors[key] && <p className="mt-1 text-xs text-red-600">{errors[key]}</p>}
    </div>
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {offer?.editRequiresReview && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          This offer is approved. Saving changes sends it back to admin review, and it is hidden until approved again.
        </p>
      )}
      <div>
        <label className="label" htmlFor="o-title">
          Offer title
        </label>
        <input id="o-title" className="input" required minLength={3} maxLength={120} value={v.title} onChange={set('title')} placeholder="Diwali sale on all sarees" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="o-type">
            Offer type
          </label>
          <select id="o-type" className="input" value={type} onChange={(e) => setType(e.target.value as OfferType)}>
            {OFFER_TYPES.map((t) => (
              <option key={t} value={t}>
                {OFFER_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="o-cat">
            Category
          </label>
          <CategorySelect id="o-cat" value={v.categoryId} onChange={(id) => setV((s) => ({ ...s, categoryId: id }))} />
        </div>
      </div>

      <fieldset className="grid gap-4 rounded-xl border border-gray-200 p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Price details</legend>
        {type === 'PRICE_DROP' && (
          <>
            {money('originalPrice', 'Original price', true)}
            {money('offerPrice', 'Offer price', true)}
            <p className="text-xs text-gray-500 sm:col-span-2">The discount % is calculated automatically.</p>
          </>
        )}
        {type === 'PERCENTAGE_OFF' && (
          <>
            {whole('discountPercent', 'Discount %')}
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={pricing.isUpTo} onChange={(e) => setPricing((s) => ({ ...s, isUpTo: e.target.checked }))} />
              “Up to” (varies by item)
            </label>
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
            <div className="sm:col-span-2">
              <label className="label" htmlFor="p-item">
                On which item <span className="text-gray-500">(optional)</span>
              </label>
              <input id="p-item" className="input" value={pricing.itemName} onChange={setP('itemName')} />
            </div>
          </>
        )}
        {type === 'FREE_GIFT' && (
          <>
            <div>
              <label className="label" htmlFor="p-gift">
                Free gift
              </label>
              <input id="p-gift" className="input" value={pricing.itemName} onChange={setP('itemName')} placeholder="Steel water bottle" />
              {errors.itemName && <p className="mt-1 text-xs text-red-600">{errors.itemName}</p>}
            </div>
            {money('minPurchaseAmount', 'Minimum purchase')}
          </>
        )}
        {type === 'COMBO' && (
          <>
            {money('offerPrice', 'Combo price', true)}
            {money('originalPrice', 'Price if bought separately')}
            <div className="sm:col-span-2">
              <label className="label" htmlFor="p-combo">
                Items in the combo (one per line)
              </label>
              <textarea id="p-combo" className="input" rows={3} value={pricing.comboItems} onChange={setP('comboItems')} />
              {errors.comboItems && <p className="mt-1 text-xs text-red-600">{errors.comboItems}</p>}
            </div>
          </>
        )}
        {type === 'OTHER' && <p className="text-sm text-gray-600 sm:col-span-2">Describe the offer in the details below.</p>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="o-start">
            Starts
          </label>
          <input id="o-start" type="datetime-local" className="input" required value={v.startsAt} onChange={set('startsAt')} />
          {errors.startsAt && <p className="mt-1 text-xs text-red-600">{errors.startsAt}</p>}
        </div>
        <div>
          <label className="label" htmlFor="o-end">
            Ends
          </label>
          <input id="o-end" type="datetime-local" className="input" required value={v.expiresAt} onChange={set('expiresAt')} />
          {errors.expiresAt && <p className="mt-1 text-xs text-red-600">{errors.expiresAt}</p>}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="o-desc">
          Details <span className="text-gray-500">(optional)</span>
        </label>
        <textarea id="o-desc" className="input" rows={3} maxLength={2000} value={v.description} onChange={set('description')} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="o-terms">
            Terms <span className="text-gray-500">(optional)</span>
          </label>
          <textarea id="o-terms" className="input" rows={2} maxLength={2000} value={v.terms} onChange={set('terms')} />
        </div>
        <div>
          <label className="label" htmlFor="o-elig">
            Who can use it <span className="text-gray-500">(optional)</span>
          </label>
          <textarea id="o-elig" className="input" rows={2} maxLength={500} value={v.eligibility} onChange={set('eligibility')} />
        </div>
      </div>
      <div className="max-w-xs">
        <label className="label" htmlFor="o-qty">
          Limited to how many customers <span className="text-gray-500">(optional)</span>
        </label>
        <input id="o-qty" className="input" inputMode="numeric" value={v.quantityLimit} onChange={set('quantityLimit')} />
        {errors.quantityLimit && <p className="mt-1 text-xs text-red-600">{errors.quantityLimit}</p>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary" disabled={busy}>
        {busy ? 'Saving…' : offer ? 'Save changes' : 'Save as draft'}
      </button>
    </form>
  );
}
