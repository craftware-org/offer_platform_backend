import { z } from 'zod';
import { latitude, longitude } from '../locations/locations.dto.js';

/** http(s) links to a real domain only: rejects javascript:, data:, localhost, IPs without a domain, etc. */
const webUrl = z.url({ protocol: /^https?$/, hostname: z.regexes.domain }).max(300);
const phone = z.string().trim().min(5).max(20);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM');

const interval = z
  .strictObject({ open: time, close: time })
  .refine((i) => i.open < i.close, { message: 'Closing time must be after opening time' });

export const openingHoursSchema = z.strictObject(
  Object.fromEntries(
    (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((d) => [
      d,
      z.array(interval).max(3).optional(),
    ]),
  ) as Record<
    'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun',
    z.ZodOptional<z.ZodArray<typeof interval>>
  >,
);

export const socialLinksSchema = z.strictObject({
  instagram: webUrl.optional(),
  facebook: webUrl.optional(),
  x: webUrl.optional(),
  youtube: webUrl.optional(),
});

export const businessLocationSchema = z.strictObject({
  /** Include the door/shop number: "Shop 12, Laxmi Complex, Station Road". */
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: z.string().trim().max(200).nullable().optional(),
  cityId: z.uuid(),
  localityId: z.uuid().nullable().optional(),
  postalCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9 -]{3,10}$/, 'Invalid postal code')
    .nullable()
    .optional(),
  latitude,
  longitude,
});

// No defaults anywhere below: Zod 4 would inject them into partial (PATCH) schemas.
const businessFields = {
  name: z.string().trim().min(2).max(120),
  categoryId: z.uuid(),
  description: z.string().trim().max(2000).nullable(),
  phone,
  whatsapp: phone.nullable(),
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase())
    .nullable(),
  website: webUrl.nullable(),
  socialLinks: socialLinksSchema,
  registrationNumber: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[A-Za-z0-9/ .-]+$/, 'Letters, digits, spaces and / . - only')
    .nullable(),
  openingHours: openingHoursSchema.nullable(),
  location: businessLocationSchema,
};

export const createBusinessSchema = z.strictObject({
  ...businessFields,
  description: businessFields.description.optional(),
  whatsapp: businessFields.whatsapp.optional(),
  email: businessFields.email.optional(),
  website: businessFields.website.optional(),
  socialLinks: businessFields.socialLinks.optional(),
  registrationNumber: businessFields.registrationNumber.optional(),
  openingHours: businessFields.openingHours.optional(),
});
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

export const updateBusinessSchema = z
  .strictObject(businessFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;

export const businessStatusActionSchema = z
  .strictObject({
    action: z.enum(['VERIFY', 'REJECT', 'SUSPEND', 'REACTIVATE']),
    reason: z.string().trim().min(3).max(1000).optional(),
  })
  .refine((v) => (v.action === 'REJECT' || v.action === 'SUSPEND' ? !!v.reason : true), {
    message: 'A reason is required to reject or suspend',
    path: ['reason'],
  });
