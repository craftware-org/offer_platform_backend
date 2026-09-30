import type { SettingValue } from '../platform-settings/settings.registry.js';

export interface ChecklistItem {
  key: 'shopPhoto' | 'ownerPhoto' | 'registrationNumber';
  label: string;
  required: boolean;
  done: boolean;
}

export interface VerificationChecklist {
  items: ChecklistItem[];
  /** True when every required item is done. */
  complete: boolean;
}

/** What the owner still has to provide before submitting, based on the admin-configurable setting. */
export function verificationChecklist(
  requirements: SettingValue<'business.verification'>,
  state: { shopPhotos: number; ownerPhotos: number; registrationNumber: string | null },
): VerificationChecklist {
  const items: ChecklistItem[] = [
    {
      key: 'shopPhoto',
      label: 'Photo of the shop (front, with signboard if any)',
      required: requirements.requireShopPhoto,
      done: state.shopPhotos > 0,
    },
    {
      key: 'ownerPhoto',
      label: "Owner's photo",
      required: requirements.requireOwnerPhoto,
      done: state.ownerPhotos > 0,
    },
    {
      key: 'registrationNumber',
      label: 'Shop registration number',
      required: requirements.requireRegistrationNumber,
      done: !!state.registrationNumber,
    },
  ];
  return { items, complete: items.every((i) => !i.required || i.done) };
}
