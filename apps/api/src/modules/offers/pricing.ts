import { z } from 'zod';

/**
 * The seven offer types and their pricing rules. Money is always integer paise (ADR-0008).
 * A discount percentage is NEVER accepted for price-based offers: it is computed here.
 */
export const OFFER_TYPES = [
  'PRICE_DROP',
  'PERCENTAGE_OFF',
  'FLAT_AMOUNT_OFF',
  'BUY_X_GET_Y',
  'FREE_GIFT',
  'COMBO',
  'OTHER',
] as const;
export type OfferType = (typeof OFFER_TYPES)[number];

/** ₹10 crore in paise: far above any local offer, still a safe integer. */
const MAX_PAISE = 10_000_000_000;
const money = z.int().min(0).max(MAX_PAISE);
const positiveMoney = z.int().min(1).max(MAX_PAISE);
const quantity = z.int().min(1).max(20);
const itemName = z.string().trim().min(2).max(120);

export const pricingSchema = z.discriminatedUnion('type', [
  z
    .strictObject({ type: z.literal('PRICE_DROP'), originalPrice: positiveMoney, offerPrice: money })
    .refine((p) => p.offerPrice < p.originalPrice, {
      message: 'The offer price must be lower than the original price',
      path: ['offerPrice'],
    }),
  z.strictObject({
    type: z.literal('PERCENTAGE_OFF'),
    discountPercent: z.int().min(1).max(99),
    /** "Up to 50% off" (varies by item) rather than a flat 50% off. */
    isUpTo: z.boolean().default(false),
    /** "20% off, maximum ₹200". */
    maxDiscountAmount: positiveMoney.optional(),
    minPurchaseAmount: positiveMoney.optional(),
  }),
  z
    .strictObject({
      type: z.literal('FLAT_AMOUNT_OFF'),
      flatAmountOff: positiveMoney,
      minPurchaseAmount: positiveMoney.optional(),
    })
    .refine((p) => p.minPurchaseAmount === undefined || p.flatAmountOff < p.minPurchaseAmount, {
      message: 'The amount off must be less than the minimum purchase',
      path: ['flatAmountOff'],
    }),
  z.strictObject({
    type: z.literal('BUY_X_GET_Y'),
    buyQuantity: quantity,
    getQuantity: quantity,
    itemName: itemName.optional(),
  }),
  z.strictObject({
    type: z.literal('FREE_GIFT'),
    itemName,
    minPurchaseAmount: positiveMoney.optional(),
  }),
  z
    .strictObject({
      type: z.literal('COMBO'),
      offerPrice: positiveMoney,
      /** Price of the items bought separately, if the business wants to show the saving. */
      originalPrice: positiveMoney.optional(),
      comboItems: z.array(z.string().trim().min(1).max(80)).min(2).max(10),
    })
    .refine((p) => p.originalPrice === undefined || p.offerPrice < p.originalPrice, {
      message: 'The combo price must be lower than the separate price',
      path: ['offerPrice'],
    }),
  z.strictObject({ type: z.literal('OTHER') }),
]);
export type PricingInput = z.infer<typeof pricingSchema>;

/** Flat, storage-shaped pricing (one column per field; fields not used by the type are null). */
export interface OfferPricing {
  type: OfferType;
  originalPrice: number | null;
  offerPrice: number | null;
  discountPercent: number | null;
  isUpTo: boolean;
  maxDiscountAmount: number | null;
  flatAmountOff: number | null;
  minPurchaseAmount: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  itemName: string | null;
  comboItems: string[] | null;
}

/** Discount % with one decimal, from integer paise: ₹1,999 → ₹1,199 = 40.0. */
export function computeDiscountPercent(originalPaise: number, offerPaise: number): number {
  if (originalPaise <= 0) throw new Error('Original price must be positive');
  return Math.round(((originalPaise - offerPaise) * 1000) / originalPaise) / 10;
}

export function normalizePricing(input: PricingInput): OfferPricing {
  const base: OfferPricing = {
    type: input.type,
    originalPrice: null,
    offerPrice: null,
    discountPercent: null,
    isUpTo: false,
    maxDiscountAmount: null,
    flatAmountOff: null,
    minPurchaseAmount: null,
    buyQuantity: null,
    getQuantity: null,
    itemName: null,
    comboItems: null,
  };
  switch (input.type) {
    case 'PRICE_DROP':
      return {
        ...base,
        originalPrice: input.originalPrice,
        offerPrice: input.offerPrice,
        discountPercent: computeDiscountPercent(input.originalPrice, input.offerPrice),
      };
    case 'PERCENTAGE_OFF':
      return {
        ...base,
        discountPercent: input.discountPercent,
        isUpTo: input.isUpTo,
        maxDiscountAmount: input.maxDiscountAmount ?? null,
        minPurchaseAmount: input.minPurchaseAmount ?? null,
      };
    case 'FLAT_AMOUNT_OFF':
      return {
        ...base,
        flatAmountOff: input.flatAmountOff,
        minPurchaseAmount: input.minPurchaseAmount ?? null,
      };
    case 'BUY_X_GET_Y':
      return {
        ...base,
        buyQuantity: input.buyQuantity,
        getQuantity: input.getQuantity,
        itemName: input.itemName ?? null,
      };
    case 'FREE_GIFT':
      return { ...base, itemName: input.itemName, minPurchaseAmount: input.minPurchaseAmount ?? null };
    case 'COMBO':
      return {
        ...base,
        offerPrice: input.offerPrice,
        originalPrice: input.originalPrice ?? null,
        discountPercent:
          input.originalPrice === undefined
            ? null
            : computeDiscountPercent(input.originalPrice, input.offerPrice),
        comboItems: input.comboItems,
      };
    case 'OTHER':
      return base;
  }
}

/** Pricing fields that matter for price-history records. */
export function pricingSnapshot(p: OfferPricing) {
  return {
    type: p.type,
    originalPrice: p.originalPrice,
    offerPrice: p.offerPrice,
    discountPercent: p.discountPercent,
    isUpTo: p.isUpTo,
    maxDiscountAmount: p.maxDiscountAmount,
    flatAmountOff: p.flatAmountOff,
    minPurchaseAmount: p.minPurchaseAmount,
    buyQuantity: p.buyQuantity,
    getQuantity: p.getQuantity,
  };
}

export const samePricing = (a: OfferPricing, b: OfferPricing) =>
  JSON.stringify(pricingSnapshot(a)) === JSON.stringify(pricingSnapshot(b));

const inr = (paise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
  }).format(paise / 100);

const percent = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)}%`;

/** Short, human headline for cards and share previews, e.g. "40% OFF", "Buy 2 Get 1 Free". */
export function offerHeadline(p: OfferPricing): string | null {
  const onMin = p.minPurchaseAmount !== null ? ` on ${inr(p.minPurchaseAmount)}+` : '';
  switch (p.type) {
    case 'PRICE_DROP':
      return `${percent(p.discountPercent!)} OFF`;
    case 'PERCENTAGE_OFF':
      return `${p.isUpTo ? 'Up to ' : ''}${percent(p.discountPercent!)} OFF${onMin}`;
    case 'FLAT_AMOUNT_OFF':
      return `${inr(p.flatAmountOff!)} OFF${onMin}`;
    case 'BUY_X_GET_Y':
      return `Buy ${p.buyQuantity} Get ${p.getQuantity} Free`;
    case 'FREE_GIFT':
      return `Free ${p.itemName}${onMin}`;
    case 'COMBO':
      return `Combo at ${inr(p.offerPrice!)}`;
    case 'OTHER':
      return null;
  }
}

export { inr as formatInr };
