import { createCitySchema, updateCitySchema } from './locations.dto.js';

describe('city schemas', () => {
  it('applies defaults on create', () => {
    const city = createCitySchema.parse({
      name: 'Belagavi',
      state: 'Karnataka',
      center: { latitude: 15.85, longitude: 74.5 },
    });
    expect(city).toMatchObject({ countryCode: 'IN', timezone: 'Asia/Kolkata', serviceRadiusKm: 40 });
  });

  it('never injects defaults into a partial update', () => {
    expect(updateCitySchema.parse({ name: 'Belagavi' })).toEqual({ name: 'Belagavi' });
  });

  it('rejects an empty update', () => {
    expect(updateCitySchema.safeParse({}).success).toBe(false);
  });
});
