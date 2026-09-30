import { verificationChecklist } from './verification-checklist.js';

const defaults = { requireRegistrationNumber: false, requireShopPhoto: true, requireOwnerPhoto: false };

describe('verificationChecklist', () => {
  it('with default settings only the shop photo is required', () => {
    expect(
      verificationChecklist(defaults, { shopPhotos: 0, ownerPhotos: 0, registrationNumber: null }).complete,
    ).toBe(false);
    expect(
      verificationChecklist(defaults, { shopPhotos: 1, ownerPhotos: 0, registrationNumber: null }).complete,
    ).toBe(true);
  });

  it('follows stricter settings', () => {
    const strict = { requireRegistrationNumber: true, requireShopPhoto: true, requireOwnerPhoto: true };
    const partial = verificationChecklist(strict, {
      shopPhotos: 1,
      ownerPhotos: 1,
      registrationNumber: null,
    });
    expect(partial.complete).toBe(false);
    expect(partial.items.find((i) => i.key === 'registrationNumber')).toMatchObject({
      required: true,
      done: false,
    });
    expect(
      verificationChecklist(strict, { shopPhotos: 1, ownerPhotos: 1, registrationNumber: 'KA-123' }).complete,
    ).toBe(true);
  });
});
