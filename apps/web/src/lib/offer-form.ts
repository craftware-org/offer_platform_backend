import { paiseToRupeesInput, rupeesToPaise } from './money';
import type { OfferPricing, OfferType } from './types';

/** Pricing fields as typed in the form (strings; rupees for money). */
export interface PricingFields {
  originalPrice: string;
  offerPrice: string;
  discountPercent: string;
  isUpTo: boolean;
  maxDiscountAmount: string;
  flatAmountOff: string;
  minPurchaseAmount: string;
  buyQuantity: string;
  getQuantity: string;
  itemName: string;
  /** One item per line. */
  comboItems: string;
}

export const EMPTY_PRICING: PricingFields = {
  originalPrice: '',
  offerPrice: '',
  discountPercent: '',
  isUpTo: false,
  maxDiscountAmount: '',
  flatAmountOff: '',
  minPurchaseAmount: '',
  buyQuantity: '',
  getQuantity: '',
  itemName: '',
  comboItems: '',
};

export const OFFER_TYPE_LABELS: Record<OfferType, string> = {
  PRICE_DROP: 'Price drop (was ₹X, now ₹Y)',
  PERCENTAGE_OFF: 'Percentage off (e.g. 20% off)',
  FLAT_AMOUNT_OFF: 'Flat amount off (e.g. ₹200 off)',
  BUY_X_GET_Y: 'Buy X get Y free',
  FREE_GIFT: 'Free gift with purchase',
  COMBO: 'Combo deal',
  OTHER: 'Other (describe in the details)',
};

export type PricingResult = { ok: true; pricing: Record<string, unknown> } | { ok: false; errors: Record<string, string> };

/**
 * Form fields → the API's `pricing` object (money in integer paise). The discount % for price-based
 * offers is never sent: the API computes it (ADR-0008). The API re-validates everything.
 */
export function buildPricing(type: OfferType, f: PricingFields): PricingResult {
  const errors: Record<string, string> = {};
  const money = (key: keyof PricingFields, required: boolean): number | undefined => {
    const raw = String(f[key]).trim();
    if (!raw) {
      if (required) errors[key] = 'Required';
      return undefined;
    }
    const paise = rupeesToPaise(raw);
    if (paise === null) errors[key] = 'Enter an amount in rupees, e.g. 1999 or 1999.50';
    return paise ?? undefined;
  };
  const int = (key: keyof PricingFields, min: number, max: number): number | undefined => {
    const raw = String(f[key]).trim();
    const n = Number(raw);
    if (!raw || !Number.isInteger(n) || n < min || n > max) {
      errors[key] = `Enter a whole number from ${min} to ${max}`;
      return undefined;
    }
    return n;
  };
  const clean = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));

  let pricing: Record<string, unknown>;
  switch (type) {
    case 'PRICE_DROP': {
      const originalPrice = money('originalPrice', true);
      const offerPrice = money('offerPrice', true);
      if (originalPrice !== undefined && offerPrice !== undefined && offerPrice >= originalPrice)
        errors.offerPrice = 'The offer price must be lower than the original price';
      pricing = { type, originalPrice, offerPrice };
      break;
    }
    case 'PERCENTAGE_OFF':
      pricing = clean({
        type,
        discountPercent: int('discountPercent', 1, 99),
        isUpTo: f.isUpTo,
        maxDiscountAmount: money('maxDiscountAmount', false),
        minPurchaseAmount: money('minPurchaseAmount', false),
      });
      break;
    case 'FLAT_AMOUNT_OFF': {
      const flatAmountOff = money('flatAmountOff', true);
      const minPurchaseAmount = money('minPurchaseAmount', false);
      if (flatAmountOff !== undefined && minPurchaseAmount !== undefined && flatAmountOff >= minPurchaseAmount)
        errors.flatAmountOff = 'The amount off must be less than the minimum purchase';
      pricing = clean({ type, flatAmountOff, minPurchaseAmount });
      break;
    }
    case 'BUY_X_GET_Y':
      pricing = clean({
        type,
        buyQuantity: int('buyQuantity', 1, 20),
        getQuantity: int('getQuantity', 1, 20),
        itemName: f.itemName.trim(),
      });
      break;
    case 'FREE_GIFT':
      if (f.itemName.trim().length < 2) errors.itemName = 'Name the gift';
      pricing = clean({ type, itemName: f.itemName.trim(), minPurchaseAmount: money('minPurchaseAmount', false) });
      break;
    case 'COMBO': {
      const comboItems = f.comboItems
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (comboItems.length < 2 || comboItems.length > 10) errors.comboItems = 'List 2 to 10 items, one per line';
      const offerPrice = money('offerPrice', true);
      const originalPrice = money('originalPrice', false);
      if (offerPrice !== undefined && originalPrice !== undefined && offerPrice >= originalPrice)
        errors.offerPrice = 'The combo price must be lower than the separate price';
      pricing = clean({ type, offerPrice, originalPrice, comboItems });
      break;
    }
    case 'OTHER':
      pricing = { type };
      break;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, pricing };
}

/** An offer's stored pricing → form fields (for editing). */
export function pricingToFields(p: OfferPricing): PricingFields {
  return {
    originalPrice: paiseToRupeesInput(p.originalPrice),
    offerPrice: paiseToRupeesInput(p.offerPrice),
    discountPercent: p.discountPercent === null ? '' : String(p.discountPercent),
    isUpTo: p.isUpTo,
    maxDiscountAmount: paiseToRupeesInput(p.maxDiscountAmount),
    flatAmountOff: paiseToRupeesInput(p.flatAmountOff),
    minPurchaseAmount: paiseToRupeesInput(p.minPurchaseAmount),
    buyQuantity: p.buyQuantity === null ? '' : String(p.buyQuantity),
    getQuantity: p.getQuantity === null ? '' : String(p.getQuantity),
    itemName: p.itemName ?? '',
    comboItems: (p.comboItems ?? []).join('\n'),
  };
}
