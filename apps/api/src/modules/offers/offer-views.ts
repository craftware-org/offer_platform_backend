import { API_BASE_PATH } from '../../common/http/api-prefix.js';
import type { GeoPoint } from '../../infrastructure/database/postgis.js';
import type { BusinessBundle } from '../businesses/business-views.js';
import type { CategoryView } from '../categories/category-tree.js';
import { availableBusinessActions } from './offer-status.machine.js';
import type { OfferImageRow, OfferRow, OfferStatus } from './offers.schema.js';
import { offerHeadline, type OfferPricing, type OfferType } from './pricing.js';

export interface OfferBundle {
  offer: OfferRow;
  images: OfferImageRow[];
  category: CategoryView;
  business: BusinessBundle;
}

export type OfferAudience = 'public' | 'owner' | 'admin';

export interface OfferImageView {
  id: string;
  width: number;
  height: number;
  urls: { full: string; thumb: string };
}

/** What customers see on an offer page (and in lists). */
export interface PublicOfferView {
  id: string;
  slug: string;
  type: OfferType;
  title: string;
  headline: string | null;
  description: string | null;
  category: { id: string; name: string; slug: string };
  pricing: Omit<OfferPricing, 'type'> & { currency: string };
  startsAt: Date;
  expiresAt: Date;
  terms: string | null;
  eligibility: string | null;
  quantityLimit: number | null;
  /** ACTIVE (claimable now), PAUSED (temporarily unavailable) or EXPIRED. */
  availability: 'ACTIVE' | 'PAUSED' | 'EXPIRED';
  images: OfferImageView[];
  business: {
    id: string;
    slug: string;
    name: string;
    isVerified: boolean;
    phone: string;
    whatsapp: string | null;
    website: string | null;
    address: { line1: string; locality: string | null; city: string };
    coordinates: GeoPoint;
  };
}

export interface OwnerOfferView extends Omit<PublicOfferView, 'availability'> {
  status: OfferStatus;
  statusReason: string | null;
  availability: PublicOfferView['availability'] | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  /** Buttons the business can use right now (EDIT, SUBMIT, WITHDRAW, PAUSE, RESUME, END). */
  allowedActions: string[];
  /** True when editing will send the offer back to admin review (it is approved or live). */
  editRequiresReview: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminOfferView extends OwnerOfferView {
  businessStatus: string;
  approvedBy: string | null;
  createdBy: string | null;
}

const imageUrl = (audience: OfferAudience, offerId: string, imageId: string, variant: 'full' | 'thumb') => {
  switch (audience) {
    case 'public':
      return `${API_BASE_PATH}/media/offer-images/${imageId}/${variant}`;
    case 'owner':
      return `${API_BASE_PATH}/me/offers/${offerId}/images/${imageId}/${variant}`;
    case 'admin':
      return `${API_BASE_PATH}/admin/offers/${offerId}/images/${imageId}/${variant}`;
  }
};

export function pricingOf(o: OfferRow): OfferPricing {
  return {
    type: o.type,
    originalPrice: o.originalPrice,
    offerPrice: o.offerPrice,
    discountPercent: o.discountPercent,
    isUpTo: o.isUpTo,
    maxDiscountAmount: o.maxDiscountAmount,
    flatAmountOff: o.flatAmountOff,
    minPurchaseAmount: o.minPurchaseAmount,
    buyQuantity: o.buyQuantity,
    getQuantity: o.getQuantity,
    itemName: o.itemName,
    comboItems: o.comboItems,
  };
}

export function availabilityOf(o: OfferRow, now: Date): PublicOfferView['availability'] | null {
  if (o.status === 'EXPIRED' || (['ACTIVE', 'PAUSED'].includes(o.status) && o.expiresAt <= now))
    return 'EXPIRED';
  if (o.status === 'PAUSED') return 'PAUSED';
  if (o.status === 'ACTIVE' && o.startsAt <= now) return 'ACTIVE';
  return null;
}

function baseView(bundle: OfferBundle, audience: OfferAudience, now: Date) {
  const { offer: o, business: b, category } = bundle;
  const { type: _type, ...pricing } = pricingOf(o);
  return {
    id: o.id,
    slug: o.slug,
    type: o.type,
    title: o.title,
    headline: offerHeadline(pricingOf(o)),
    description: o.description,
    category: { id: category.id, name: category.name, slug: category.slug },
    pricing: { ...pricing, currency: o.currency },
    startsAt: o.startsAt,
    expiresAt: o.expiresAt,
    terms: o.terms,
    eligibility: o.eligibility,
    quantityLimit: o.quantityLimit,
    availability: availabilityOf(o, now),
    images: bundle.images.map((i) => ({
      id: i.id,
      width: i.width,
      height: i.height,
      urls: { full: imageUrl(audience, o.id, i.id, 'full'), thumb: imageUrl(audience, o.id, i.id, 'thumb') },
    })),
    business: {
      id: b.business.id,
      slug: b.business.slug,
      name: b.business.name,
      isVerified: b.business.status === 'VERIFIED',
      phone: b.business.phone,
      whatsapp: b.business.whatsapp,
      website: b.business.website,
      address: { line1: b.location.addressLine1, locality: b.locality?.name ?? null, city: b.city.name },
      coordinates: b.location.location,
    },
  };
}

export function toPublicOfferView(bundle: OfferBundle, now: Date): PublicOfferView {
  const view = baseView(bundle, 'public', now);
  return { ...view, availability: view.availability ?? 'EXPIRED' };
}

export function toOwnerOfferView(
  bundle: OfferBundle,
  now: Date,
  audience: 'owner' | 'admin' = 'owner',
): OwnerOfferView {
  const o = bundle.offer;
  const dates = { startsAt: o.startsAt, expiresAt: o.expiresAt };
  return {
    ...baseView(bundle, audience, now),
    status: o.status,
    statusReason: o.statusReason,
    submittedAt: o.submittedAt,
    approvedAt: o.approvedAt,
    allowedActions: availableBusinessActions(o.status, dates, now),
    editRequiresReview: ['SCHEDULED', 'ACTIVE', 'PAUSED'].includes(o.status),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export function toAdminOfferView(bundle: OfferBundle, now: Date): AdminOfferView {
  return {
    ...toOwnerOfferView(bundle, now, 'admin'),
    businessStatus: bundle.business.business.status,
    approvedBy: bundle.offer.approvedBy,
    createdBy: bundle.offer.createdBy,
  };
}
