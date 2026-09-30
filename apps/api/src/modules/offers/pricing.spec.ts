import {
  computeDiscountPercent,
  formatInr,
  normalizePricing,
  offerHeadline,
  pricingSchema,
  samePricing,
} from './pricing.js';

describe('computeDiscountPercent', () => {
  it.each([
    [199900, 119900, 40], // the spec example: ₹1,999 → ₹1,199
    [100000, 50000, 50],
    [99900, 89900, 10],
    [300, 200, 33.3],
    [300, 100, 66.7],
    [100000, 0, 100],
    [100000, 99999, 0],
  ])('%i → %i paise = %s%%', (original, offer, expected) => {
    expect(computeDiscountPercent(original, offer)).toBe(expected);
  });

  it('refuses a zero original price', () => {
    expect(() => computeDiscountPercent(0, 0)).toThrow();
  });
});

describe('pricingSchema', () => {
  const ok = (input: unknown) => pricingSchema.safeParse(input).success;

  it('never accepts a discount percentage for a price drop', () => {
    expect(ok({ type: 'PRICE_DROP', originalPrice: 199900, offerPrice: 119900 })).toBe(true);
    expect(ok({ type: 'PRICE_DROP', originalPrice: 199900, offerPrice: 119900, discountPercent: 90 })).toBe(
      false,
    );
  });

  it.each<[unknown, string]>([
    [{ type: 'PRICE_DROP', originalPrice: 1000, offerPrice: 1000 }, 'offer not lower'],
    [{ type: 'PRICE_DROP', originalPrice: 1000, offerPrice: -1 }, 'negative price'],
    [{ type: 'PRICE_DROP', originalPrice: 0, offerPrice: 0 }, 'zero original'],
    [{ type: 'PRICE_DROP', originalPrice: 1999.5, offerPrice: 1000 }, 'fractional paise'],
    [{ type: 'PERCENTAGE_OFF', discountPercent: 100 }, '100% is a free gift, not a discount'],
    [{ type: 'PERCENTAGE_OFF', discountPercent: 0 }, 'zero percent'],
    [{ type: 'FLAT_AMOUNT_OFF', flatAmountOff: 50000, minPurchaseAmount: 50000 }, 'amount ≥ minimum'],
    [{ type: 'BUY_X_GET_Y', buyQuantity: 0, getQuantity: 1 }, 'buy 0'],
    [{ type: 'FREE_GIFT' }, 'missing item'],
    [{ type: 'COMBO', offerPrice: 149900, comboItems: ['Shirt'] }, 'one-item combo'],
    [{ type: 'COMBO', offerPrice: 149900, originalPrice: 100000, comboItems: ['a', 'b'] }, 'combo dearer'],
    [{ type: 'CASHBACK' }, 'unknown type'],
  ])('rejects %j (%s)', (input) => {
    expect(ok(input)).toBe(false);
  });
});

describe('normalizePricing + offerHeadline', () => {
  const norm = (input: unknown) => normalizePricing(pricingSchema.parse(input));

  it.each<[unknown, string | null]>([
    [{ type: 'PRICE_DROP', originalPrice: 199900, offerPrice: 119900 }, '40% OFF'],
    [{ type: 'PERCENTAGE_OFF', discountPercent: 30 }, '30% OFF'],
    [{ type: 'PERCENTAGE_OFF', discountPercent: 50, isUpTo: true }, 'Up to 50% OFF'],
    [{ type: 'FLAT_AMOUNT_OFF', flatAmountOff: 20000, minPurchaseAmount: 100000 }, '₹200 OFF on ₹1,000+'],
    [{ type: 'FLAT_AMOUNT_OFF', flatAmountOff: 5050 }, '₹50.50 OFF'],
    [{ type: 'BUY_X_GET_Y', buyQuantity: 2, getQuantity: 1 }, 'Buy 2 Get 1 Free'],
    [{ type: 'FREE_GIFT', itemName: 'Dessert' }, 'Free Dessert'],
    [{ type: 'COMBO', offerPrice: 149900, comboItems: ['Shirt', 'Trousers'] }, 'Combo at ₹1,499'],
    [{ type: 'OTHER' }, null],
  ])('%j → %j', (input, headline) => {
    expect(offerHeadline(norm(input))).toBe(headline);
  });

  it('stores only the fields that belong to the type and computes the discount', () => {
    expect(norm({ type: 'PRICE_DROP', originalPrice: 199900, offerPrice: 119900 })).toMatchObject({
      discountPercent: 40,
      flatAmountOff: null,
      buyQuantity: null,
    });
    expect(
      norm({ type: 'COMBO', offerPrice: 149900, originalPrice: 199900, comboItems: ['a', 'b'] }),
    ).toMatchObject({ discountPercent: 25 });
  });

  it('detects pricing changes (for price history)', () => {
    const a = norm({ type: 'PRICE_DROP', originalPrice: 199900, offerPrice: 119900 });
    const b = norm({ type: 'PRICE_DROP', originalPrice: 199900, offerPrice: 109900 });
    expect(samePricing(a, { ...a })).toBe(true);
    expect(samePricing(a, b)).toBe(false);
  });

  it('formats rupees with Indian digit grouping', () => {
    expect(formatInr(15000000)).toBe('₹1,50,000');
  });
});
