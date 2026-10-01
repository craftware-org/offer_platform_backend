import { parseSearch } from './search-parser.js';

describe('parseSearch (the examples from the product spec, and more)', () => {
  it.each([
    ['clothes', { text: 'clothes', nearMe: false }],
    ['restaurants', { text: 'restaurants', nearMe: false }],
    ['offers near me', { text: '', nearMe: true }],
    ['fashion in Vidya Nagar', { text: 'fashion', nearMe: false, place: 'vidya nagar' }],
    ['50% discount', { text: '', nearMe: false, minDiscount: 50 }],
    ['shoes under 2000', { text: 'shoes', nearMe: false, maxPrice: 200000 }],
    ['shoes under ₹2,000', { text: 'shoes', nearMe: false, maxPrice: 200000 }],
    ['mobiles below Rs 15000 nearby', { text: 'mobiles', nearMe: true, maxPrice: 1500000 }],
    ['30% off electronics', { text: 'electronics', nearMe: false, minDiscount: 30 }],
    ['best biryani deals near me', { text: 'biryani', nearMe: true }],
    ['home & furniture', { text: 'home & furniture', nearMe: false }],
    ['ಬಟ್ಟೆ', { text: 'ಬಟ್ಟೆ', nearMe: false }], // Kannada "clothes": combining marks must survive
    ['ಸೀರೆ under 1500', { text: 'ಸೀರೆ', nearMe: false, maxPrice: 150000 }],
  ])('%j', (input, expected) => {
    expect(parseSearch(input)).toEqual(expected);
  });

  it('ignores absurd values but still removes them from the text', () => {
    expect(parseSearch('tv under 0')).toEqual({ text: 'tv', nearMe: false });
    expect(parseSearch('shirts 0% off')).toEqual({ text: 'shirts', nearMe: false });
  });

  it('strips characters that could break the text query', () => {
    expect(parseSearch('shirts"; drop table users; --').text).toBe('shirts drop table users --');
  });
});
