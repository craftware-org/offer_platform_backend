import { z } from 'zod';
import { pricingSchema } from './pricing.js';

/** ISO-8601 with an explicit offset, e.g. 2026-10-01T09:00:00+05:30 (no ambiguous local times). */
const instant = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

// No top-level defaults: Zod 4 would inject them into the partial (PATCH) schema.
// `pricing` is always replaced as a whole object, so its own defaults are safe.
const offerFields = {
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).nullable(),
  categoryId: z.uuid(),
  pricing: pricingSchema,
  startsAt: instant,
  expiresAt: instant,
  terms: z.string().trim().max(2000).nullable(),
  eligibility: z.string().trim().max(500).nullable(),
  quantityLimit: z.int().min(1).max(1_000_000).nullable(),
};

const datesInOrder = (v: { startsAt?: Date; expiresAt?: Date }) =>
  v.startsAt === undefined || v.expiresAt === undefined || v.startsAt < v.expiresAt;
const datesMessage = { message: 'The offer must end after it starts', path: ['expiresAt'] };

export const createOfferSchema = z
  .strictObject({
    ...offerFields,
    description: offerFields.description.optional(),
    terms: offerFields.terms.optional(),
    eligibility: offerFields.eligibility.optional(),
    quantityLimit: offerFields.quantityLimit.optional(),
  })
  .refine(datesInOrder, datesMessage);
export type CreateOfferInput = z.infer<typeof createOfferSchema>;

export const updateOfferSchema = z
  .strictObject(offerFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' })
  .refine(datesInOrder, datesMessage);
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;

export const offerModerationSchema = z
  .strictObject({
    action: z.enum(['APPROVE', 'REJECT', 'REQUEST_CHANGES', 'SUSPEND', 'REACTIVATE']),
    reason: z.string().trim().min(3).max(1000).optional(),
  })
  .refine((v) => !['REJECT', 'REQUEST_CHANGES', 'SUSPEND'].includes(v.action) || !!v.reason, {
    message: 'A reason is required to reject, request changes or suspend',
    path: ['reason'],
  });
export type OfferModerationInput = z.infer<typeof offerModerationSchema>;
