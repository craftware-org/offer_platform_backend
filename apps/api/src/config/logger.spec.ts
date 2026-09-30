import { maskCoordinates } from './logger.js';

describe('maskCoordinates', () => {
  it('never lets customer coordinates reach the logs', () => {
    expect(maskCoordinates('/api/v1/discover/offers?q=shoes&lat=15.3647&lng=75.1240&radiusKm=5')).toBe(
      '/api/v1/discover/offers?q=shoes&lat=~&lng=~&radiusKm=5',
    );
    expect(maskCoordinates('/api/v1/discover/home?latitude=15.3&longitude=75.1')).toBe(
      '/api/v1/discover/home?latitude=~&longitude=~',
    );
  });

  it('leaves other URLs untouched', () => {
    expect(maskCoordinates('/api/v1/offers?category=fashion&plateau=1')).toBe(
      '/api/v1/offers?category=fashion&plateau=1',
    );
  });
});
