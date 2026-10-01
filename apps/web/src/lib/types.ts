/**
 * Shapes returned by the API (apps/api), as JSON (dates are ISO strings, money is integer paise).
 * Keep in sync with the API views: offer-views.ts, business-views.ts, users.service.ts, discovery.service.ts.
 */

export interface PageMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface Paged<T> {
  items: T[];
  meta: PageMeta;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface AppMeta {
  appName: string;
  publicUrl: string;
  preview: boolean;
  loginMethods: Record<'phone' | 'email', { available: boolean; delivery: string }>;
  discovery: { defaultRadiusKm: number; maxRadiusKm: number; radiusOptionsKm: number[] };
  features: Record<string, boolean>;
}

export interface User {
  id: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  emailVerified: boolean;
  /** False until the user sets a password (ADR-0015). */
  hasPassword: boolean;
  status: string;
  roles: string[];
  permissions: string[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends TokenPair {
  isNewUser: boolean;
  user: User;
}

export interface Category {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
}
export interface CategoryNode extends Category {
  children: Category[];
}

export interface City {
  id: string;
  name: string;
  slug: string;
  state: string;
  center: GeoPoint;
}
export interface Locality {
  id: string;
  cityId: string;
  name: string;
  slug: string;
}

export const OFFER_TYPES = [
  'PRICE_DROP',
  'PERCENTAGE_OFF',
  'FLAT_AMOUNT_OFF',
  'BUY_X_GET_Y',
  'FREE_GIFT',
  'COMBO',
  'OTHER',
] as const;
export type OfferType = (typeof OFFER_TYPES)[number];

export interface OfferPricing {
  originalPrice: number | null;
  offerPrice: number | null;
  discountPercent: number | null;
  isUpTo: boolean;
  maxDiscountAmount: number | null;
  flatAmountOff: number | null;
  minPurchaseAmount: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  itemName: string | null;
  comboItems: string[] | null;
  currency: string;
}

export interface ImageRef {
  id: string;
  width: number;
  height: number;
  /** Paths under the API origin, e.g. /api/v1/media/offer-images/<id>/thumb. */
  urls: { full: string; thumb: string };
}

export interface PublicOffer {
  id: string;
  slug: string;
  type: OfferType;
  title: string;
  headline: string | null;
  description: string | null;
  category: { id: string; name: string; slug: string };
  pricing: OfferPricing;
  startsAt: string;
  expiresAt: string;
  terms: string | null;
  eligibility: string | null;
  quantityLimit: number | null;
  availability: 'ACTIVE' | 'PAUSED' | 'EXPIRED' | null;
  images: ImageRef[];
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

export interface DiscoveredOffer extends PublicOffer {
  distanceKm: number | null;
}

export type OfferStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'REJECTED'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'EXPIRED'
  | 'SUSPENDED';

export interface OwnerOffer extends PublicOffer {
  status: OfferStatus;
  statusReason: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  allowedActions: string[];
  editRequiresReview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOffer extends OwnerOffer {
  businessStatus: string;
}

export interface Interpretation {
  text: string | null;
  maxPrice: number | null;
  minDiscount: number | null;
  nearMe: boolean;
  locality: { id: string; name: string; slug: string } | null;
  radiusKm: number | null;
  sort: string;
  needsLocation: boolean;
}

export interface HomeSections {
  nearby: DiscoveredOffer[];
  recommended: DiscoveredOffer[];
  newOffers: DiscoveredOffer[];
  endingSoon: DiscoveredOffer[];
  needsLocation: boolean;
}

export type BusinessStatus = 'PENDING' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
export type BusinessImageKind = 'LOGO' | 'GALLERY' | 'VERIFICATION_SHOP' | 'VERIFICATION_OWNER';

export interface BusinessImage extends ImageRef {
  kind: BusinessImageKind;
}

export type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type OpeningHours = Partial<Record<Day, { open: string; close: string }[]>>;

export interface PublicBusiness {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: { id: string; name: string; slug: string };
  contact: {
    phone: string;
    whatsapp: string | null;
    email: string | null;
    website: string | null;
    socialLinks: Record<string, string>;
  };
  address: {
    line1: string;
    line2: string | null;
    postalCode: string | null;
    locality: { id: string; name: string; slug: string } | null;
    city: { id: string; name: string; slug: string };
  };
  coordinates: GeoPoint;
  openingHours: OpeningHours | null;
  isVerified: boolean;
  verifiedAt: string | null;
  logo: BusinessImage | null;
  gallery: BusinessImage[];
}

export interface ChecklistItem {
  key: string;
  label: string;
  required: boolean;
  done: boolean;
}

export interface OwnerBusiness extends PublicBusiness {
  status: BusinessStatus;
  statusReason: string | null;
  submittedAt: string | null;
  registrationNumber: string | null;
  verificationPhotos: { shop: BusinessImage[]; owner: BusinessImage[] };
  lockedFields: string[];
  verification: { items: ChecklistItem[]; complete: boolean };
  createdAt: string;
  updatedAt: string;
}

export interface AdminBusiness extends OwnerBusiness {
  ownerUserId: string;
}

export interface BusinessDashboard {
  business: { id: string; status: BusinessStatus; statusReason: string | null; publicPath: string | null };
  verification: { items: ChecklistItem[]; complete: boolean };
  canSubmit: boolean;
  profile: { hasLogo: boolean; galleryPhotos: number; hasDescription: boolean; hasOpeningHours: boolean };
}
