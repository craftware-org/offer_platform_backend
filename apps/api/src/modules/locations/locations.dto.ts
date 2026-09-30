import { z } from 'zod';
import { SLUG_PATTERN } from '../../common/text/slug.js';

export const latitude = z.number().min(-90).max(90);
export const longitude = z.number().min(-180).max(180);
export const geoPointSchema = z.strictObject({ latitude, longitude });

const slug = z.string().min(2).max(100).regex(SLUG_PATTERN, 'Lowercase letters, digits and dashes only');
const name = z.string().trim().min(2).max(100);

// Field definitions WITHOUT defaults. Zod 4 applies defaults even inside .partial(),
// so update schemas must be built from these, or a PATCH would reset untouched fields.
const cityFields = {
  name,
  slug,
  state: z.string().trim().min(2).max(100),
  countryCode: z
    .string()
    .length(2)
    .transform((v) => v.toUpperCase()),
  timezone: z.string().min(3).max(50),
  center: geoPointSchema,
  serviceRadiusKm: z.number().int().min(1).max(200),
};

export const createCitySchema = z.strictObject({
  ...cityFields,
  slug: cityFields.slug.optional(),
  countryCode: cityFields.countryCode.default('IN'),
  timezone: cityFields.timezone.default('Asia/Kolkata'),
  serviceRadiusKm: cityFields.serviceRadiusKm.default(40),
});

export const updateCitySchema = z
  .strictObject({ ...cityFields, isActive: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

export const createLocalitySchema = z.strictObject({ name, slug: slug.optional() });

export const updateLocalitySchema = z
  .strictObject({ name, slug, isActive: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
