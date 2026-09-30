import { z } from 'zod';

/**
 * Every runtime-editable setting: its schema and default. A setting that has never been
 * saved uses its default, so the platform works on an empty table.
 */
export const SETTINGS = {
  /** What a business must provide before it can submit for verification. */
  'business.verification': {
    description: 'Required items before a business can submit for verification',
    schema: z.strictObject({
      requireRegistrationNumber: z.boolean(),
      requireShopPhoto: z.boolean(),
      requireOwnerPhoto: z.boolean(),
    }),
    defaultValue: { requireRegistrationNumber: false, requireShopPhoto: true, requireOwnerPhoto: false },
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]['schema']>;
export const SETTING_KEYS = Object.keys(SETTINGS) as [SettingKey, ...SettingKey[]];
