import { SLUG_PATTERN, slugify, withRandomSuffix } from './slug.js';

describe('slugify', () => {
  it.each([
    ['Sri Ganesh Stores & Co.', 'sri-ganesh-stores-and-co'],
    ['  Café Déjà Vu  ', 'cafe-deja-vu'],
    ['Home & Furniture', 'home-and-furniture'],
    ['50% OFF!!! Shoes', '50-off-shoes'],
  ])('%j → %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('falls back when the text has no Latin letters or digits', () => {
    expect(slugify('ಶ್ರೀ ಗಣೇಶ', 'business')).toBe('business');
  });

  it('limits length without a trailing dash', () => {
    const slug = slugify('a'.repeat(79) + ' b c d');
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug).toMatch(SLUG_PATTERN);
  });
});

describe('withRandomSuffix', () => {
  it('produces a valid, different slug', () => {
    const a = withRandomSuffix('shop');
    expect(a).toMatch(SLUG_PATTERN);
    expect(a).toMatch(/^shop-[a-z0-9]{4}$/);
  });
});
