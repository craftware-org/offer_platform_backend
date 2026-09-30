import { API_BASE_PATH } from '../../common/http/api-prefix.js';
import type { GeoPoint } from '../../infrastructure/database/postgis.js';
import type { CategoryView } from '../categories/category-tree.js';
import type { CityView, LocalityView } from '../locations/locations.service.js';
import { isLockedForOwner, LOCKED_FIELDS, type LockedField } from './business-status.machine.js';
import type {
  BusinessImageKind,
  BusinessImageRow,
  BusinessLocationRow,
  BusinessRow,
  BusinessStatus,
  OpeningHours,
  SocialLinks,
} from './businesses.schema.js';
import type { VerificationChecklist } from './verification-checklist.js';

/** Everything needed to render a business, loaded in bulk by BusinessReader. */
export interface BusinessBundle {
  business: BusinessRow;
  location: BusinessLocationRow;
  city: CityView;
  locality: LocalityView | null;
  category: CategoryView;
  images: BusinessImageRow[];
}

export type Audience = 'public' | 'owner' | 'admin';

export interface ImageView {
  id: string;
  kind: BusinessImageKind;
  width: number;
  height: number;
  urls: { full: string; thumb: string };
}

export interface PublicBusinessView {
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
    socialLinks: SocialLinks;
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
  verifiedAt: Date | null;
  logo: ImageView | null;
  gallery: ImageView[];
}

export interface OwnerBusinessView extends PublicBusinessView {
  status: BusinessStatus;
  statusReason: string | null;
  submittedAt: Date | null;
  registrationNumber: string | null;
  verificationPhotos: { shop: ImageView[]; owner: ImageView[] };
  /** Fields only an admin can change right now (empty when the owner may edit everything). */
  lockedFields: LockedField[];
  verification: VerificationChecklist;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminBusinessView extends OwnerBusinessView {
  ownerUserId: string;
  verifiedBy: string | null;
}

function imageUrl(
  audience: Audience,
  businessId: string,
  image: BusinessImageRow,
  variant: 'full' | 'thumb',
) {
  switch (audience) {
    case 'public':
      return `${API_BASE_PATH}/media/images/${image.id}/${variant}`;
    case 'owner':
      return `${API_BASE_PATH}/me/businesses/${businessId}/images/${image.id}/${variant}`;
    case 'admin':
      return `${API_BASE_PATH}/admin/businesses/${businessId}/images/${image.id}/${variant}`;
  }
}

export function toImageView(audience: Audience, image: BusinessImageRow): ImageView {
  return {
    id: image.id,
    kind: image.kind,
    width: image.width,
    height: image.height,
    urls: {
      full: imageUrl(audience, image.businessId, image, 'full'),
      thumb: imageUrl(audience, image.businessId, image, 'thumb'),
    },
  };
}

const ofKind = (bundle: BusinessBundle, kind: BusinessImageKind) =>
  bundle.images.filter((i) => i.kind === kind);

export function toPublicView(bundle: BusinessBundle, audience: Audience = 'public'): PublicBusinessView {
  const { business: b, location: l, city, locality, category } = bundle;
  const logo = ofKind(bundle, 'LOGO')[0];
  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    description: b.description,
    category: { id: category.id, name: category.name, slug: category.slug },
    contact: {
      phone: b.phone,
      whatsapp: b.whatsapp,
      email: b.email,
      website: b.website,
      socialLinks: b.socialLinks,
    },
    address: {
      line1: l.addressLine1,
      line2: l.addressLine2,
      postalCode: l.postalCode,
      locality: locality ? { id: locality.id, name: locality.name, slug: locality.slug } : null,
      city: { id: city.id, name: city.name, slug: city.slug },
    },
    coordinates: l.location,
    openingHours: l.openingHours,
    isVerified: b.status === 'VERIFIED',
    verifiedAt: b.verifiedAt,
    logo: logo ? toImageView(audience, logo) : null,
    gallery: ofKind(bundle, 'GALLERY').map((i) => toImageView(audience, i)),
  };
}

export function toOwnerView(
  bundle: BusinessBundle,
  verification: VerificationChecklist,
  audience: 'owner' | 'admin' = 'owner',
): OwnerBusinessView {
  const b = bundle.business;
  return {
    ...toPublicView(bundle, audience),
    status: b.status,
    statusReason: b.statusReason,
    submittedAt: b.submittedAt,
    registrationNumber: b.registrationNumber,
    verificationPhotos: {
      shop: ofKind(bundle, 'VERIFICATION_SHOP').map((i) => toImageView(audience, i)),
      owner: ofKind(bundle, 'VERIFICATION_OWNER').map((i) => toImageView(audience, i)),
    },
    lockedFields: audience === 'owner' && isLockedForOwner(b.status) ? [...LOCKED_FIELDS] : [],
    verification,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

export function toAdminView(bundle: BusinessBundle, verification: VerificationChecklist): AdminBusinessView {
  return {
    ...toOwnerView(bundle, verification, 'admin'),
    ownerUserId: bundle.business.ownerUserId,
    verifiedBy: bundle.business.verifiedBy,
  };
}
