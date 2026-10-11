import { describe, expect, it } from 'vitest';
import { buildPricing, EMPTY_PRICING, pricingToFields } from './offer-form';

const f = (over: Partial<typeof EMPTY_PRICING>) => ({ ...EMPTY_PRICING, ...over });

describe('buildPricing', () => {
  it('price drop sends paise and never a discount %', () => {
    expect(buildPricing('PRICE_DROP', f({ originalPrice: '1,999', offerPrice: '1199.5' }))).toEqual({
      ok: true,
      pricing: { type: 'PRICE_DROP', originalPrice: 199900, offerPrice: 119950 },
    });
  });

  it('price drop rejects an offer price that is not lower', () => {
    const r = buildPricing('PRICE_DROP', f({ originalPrice: '100', offerPrice: '100' }));
    expect(r).toMatchObject({ ok: false, errors: { offerPrice: expect.any(String) } });
  });

  it('percentage off keeps optional caps only when given', () => {
    expect(buildPricing('PERCENTAGE_OFF', f({ discountPercent: '20', isUpTo: true }))).toEqual({
      ok: true,
      pricing: { type: 'PERCENTAGE_OFF', discountPercent: 20, isUpTo: true },
    });
    expect(buildPricing('PERCENTAGE_OFF', f({ discountPercent: '100' })).ok).toBe(false);
    expect(buildPricing('PERCENTAGE_OFF', f({ discountPercent: '12.5' })).ok).toBe(false);
  });

  it('flat amount must be below the minimum purchase', () => {
    expect(buildPricing('FLAT_AMOUNT_OFF', f({ flatAmountOff: '500', minPurchaseAmount: '400' })).ok).toBe(false);
    expect(buildPricing('FLAT_AMOUNT_OFF', f({ flatAmountOff: '200', minPurchaseAmount: '1000' }))).toEqual({
      ok: true,
      pricing: { type: 'FLAT_AMOUNT_OFF', flatAmountOff: 20000, minPurchaseAmount: 100000 },
    });
  });

  it('combo needs 2-10 items, one per line', () => {
    expect(buildPricing('COMBO', f({ offerPrice: '299', comboItems: 'Burger' })).ok).toBe(false);
    expect(buildPricing('COMBO', f({ offerPrice: '299', comboItems: 'Burger\n Fries \n\nCoke' }))).toEqual({
      ok: true,
      pricing: { type: 'COMBO', offerPrice: 29900, comboItems: ['Burger', 'Fries', 'Coke'] },
    });
  });

  it('buy x get y and free gift', () => {
    expect(buildPricing('BUY_X_GET_Y', f({ buyQuantity: '2', getQuantity: '1' }))).toEqual({
      ok: true,
      pricing: { type: 'BUY_X_GET_Y', buyQuantity: 2, getQuantity: 1 },
    });
    expect(buildPricing('FREE_GIFT', f({ itemName: '' })).ok).toBe(false);
  });

  it('rejects malformed money', () => {
    expect(buildPricing('PRICE_DROP', f({ originalPrice: '12.345', offerPrice: '1' })).ok).toBe(false);
    expect(buildPricing('PRICE_DROP', f({ originalPrice: 'abc', offerPrice: '1' })).ok).toBe(false);
  });

  it('round-trips stored pricing back into the form', () => {
    const fields = pricingToFields({
      originalPrice: 199900,
      offerPrice: 119950,
      discountPercent: 40,
      isUpTo: false,
      maxDiscountAmount: null,
      flatAmountOff: null,
      minPurchaseAmount: null,
      buyQuantity: null,
      getQuantity: null,
      itemName: null,
      comboItems: null,
      currency: 'INR',
    });
    expect(buildPricing('PRICE_DROP', fields)).toEqual({
      ok: true,
      pricing: { type: 'PRICE_DROP', originalPrice: 199900, offerPrice: 119950 },
    });
  });
});
