import { businessStatusActionSchema, createBusinessSchema, updateBusinessSchema } from './business.dto.js';

const valid = {
  name: 'Sri Ganesh Textiles',
  categoryId: '01a0f1de-0000-7000-8000-000000000001',
  phone: '9845012345',
  location: {
    addressLine1: 'Shop 12, Laxmi Complex, Station Road',
    cityId: '01a0f1de-0000-7000-8000-000000000002',
    latitude: 15.36,
    longitude: 75.12,
  },
};

describe('business schemas', () => {
  it('accepts a minimal registration', () => {
    expect(createBusinessSchema.safeParse(valid).success).toBe(true);
  });

  it.each(['javascript:alert(1)', 'data:text/html,hi', 'ftp://shop.example', 'http://localhost:3000'])(
    'rejects unsafe website %j',
    (website) => {
      expect(createBusinessSchema.safeParse({ ...valid, website }).success).toBe(false);
    },
  );

  it('validates opening hours', () => {
    const ok = {
      mon: [
        { open: '09:00', close: '13:00' },
        { open: '16:00', close: '21:30' },
      ],
    };
    expect(createBusinessSchema.safeParse({ ...valid, openingHours: ok }).success).toBe(true);
    expect(
      createBusinessSchema.safeParse({ ...valid, openingHours: { mon: [{ open: '21:00', close: '09:00' }] } })
        .success,
    ).toBe(false);
    expect(createBusinessSchema.safeParse({ ...valid, openingHours: { funday: [] } }).success).toBe(false);
    expect(
      createBusinessSchema.safeParse({ ...valid, openingHours: { mon: [{ open: '9am', close: '5pm' }] } })
        .success,
    ).toBe(false);
  });

  it('rejects coordinates outside the valid range', () => {
    expect(
      createBusinessSchema.safeParse({ ...valid, location: { ...valid.location, latitude: 95 } }).success,
    ).toBe(false);
  });

  it('a partial update never gains extra fields', () => {
    expect(updateBusinessSchema.parse({ description: 'New stock arrived' })).toEqual({
      description: 'New stock arrived',
    });
  });

  it('requires a reason to reject or suspend', () => {
    expect(businessStatusActionSchema.safeParse({ action: 'REJECT' }).success).toBe(false);
    expect(businessStatusActionSchema.safeParse({ action: 'SUSPEND', reason: 'Fake listing' }).success).toBe(
      true,
    );
    expect(businessStatusActionSchema.safeParse({ action: 'VERIFY' }).success).toBe(true);
  });
});
