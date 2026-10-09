/** One entry of GET /admin/activity (audit log with names filled in). */
export interface ActivityEntry {
  id: string;
  at: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: { id: string; name: string } | null;
  entityLabel: string | null;
  oldValue: unknown;
  newValue: unknown;
  requestId: string | null;
}

const NOUN: Record<string, string> = {
  business: 'business',
  offer: 'offer',
  user: 'user',
  category: 'category',
  city: 'city',
  locality: 'area',
  setting: 'setting',
  report: 'report on',
};

/** "verb {item}" templates; {item} becomes e.g. business “Shoe House”. */
const TEMPLATES: Record<string, string> = {
  USER_REGISTERED: 'signed up',
  USER_SUSPENDED: 'suspended {item}',
  USER_REACTIVATED: 'reactivated {item}',
  USER_DELETED_ACCOUNT: 'deleted their account',
  UNVERIFIED_EMAIL_RELEASED: 'released an unverified email from {item}',
  ROLE_GRANTED: 'gave {item} the {role} role',
  ROLE_REVOKED: 'removed the {role} role from {item}',
  REFRESH_TOKEN_REUSE_DETECTED: 'detected a possibly stolen session for {item} and ended all its sessions',
  PASSWORD_SET: 'set a password',
  PASSWORD_CHANGED: 'changed their password',
  PASSWORD_RESET: 'reset their password with a code',
  MFA_ENABLED: 'turned on 2-step login',
  MFA_DISABLED: 'turned off 2-step login',
  MFA_RESET: 'reset the 2-step login of {item}',
  MFA_RECOVERY_CODE_USED: 'logged in with a 2-step recovery code',
  MFA_RECOVERY_CODES_RENEWED: 'made new 2-step recovery codes',
  BUSINESS_REGISTERED: 'registered {item}',
  BUSINESS_SUBMITTED_FOR_VERIFICATION: 'submitted {item} for verification',
  BUSINESS_VERIFIED: 'verified {item}',
  BUSINESS_REJECTED: 'rejected {item}',
  BUSINESS_SUSPENDED: 'suspended {item}',
  BUSINESS_REACTIVATED: 'reactivated {item}',
  BUSINESS_CLOSED: 'closed {item} (deleted their account)',
  BUSINESS_UPDATED_BY_ADMIN: 'edited {item}',
  CATEGORY_CREATED: 'added {item}',
  CATEGORY_CHANGED: 'changed {item}',
  CATEGORIES_REORDERED: 'reordered the categories',
  CITY_CREATED: 'added {item}',
  CITY_CHANGED: 'changed {item}',
  LOCALITY_CREATED: 'added {item}',
  LOCALITY_CHANGED: 'changed {item}',
  SYSTEM_SETTING_CHANGED: 'changed {item}',
  OFFER_CREATED: 'created {item}',
  OFFER_SUBMITTED: 'submitted {item} for review',
  OFFER_WITHDRAWN: 'withdrew {item} from review',
  OFFER_EDITED_LIVE: 'edited live {item} (sent back to review)',
  OFFER_PAUSED: 'paused {item}',
  OFFER_RESUMED: 'resumed {item}',
  OFFER_ENDED: 'ended {item}',
  OFFER_DELETED: 'deleted draft {item}',
  OFFER_APPROVED: 'approved {item}',
  OFFER_REJECTED: 'rejected {item}',
  OFFER_CHANGES_REQUESTED: 'asked for changes to {item}',
  OFFER_SUSPENDED: 'suspended {item}',
  OFFER_REACTIVATED: 'reactivated {item}',
  REPORT_DISMISSED: 'dismissed {item}',
  REPORT_RESOLVED: 'acted on {item}',
  BUSINESS_WARNED: 'warned {item}',
};

const field = (value: unknown, key: string): string | null => {
  if (value && typeof value === 'object' && key in value) {
    const v = (value as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : null;
  }
  return null;
};

const ROLE_NAMES: Record<string, string> = { ADMIN: 'Admin', SUPER_ADMIN: 'Super admin' };

/** Friendly names for platform setting keys (see apps/api settings.registry.ts). */
const SETTING_NAMES: Record<string, string> = {
  'business.verification': 'Business verification requirements',
  'offers.limits': 'Offer limits',
};

/**
 * Plain-language sentence for an audit entry, e.g.
 * "Ravi verified business “Shoe House”" or "System expired offer …".
 * Unknown actions fall back to a readable form of the action code, so new ones never break the page.
 */
export function describeActivity(e: ActivityEntry): string {
  const who = e.actor?.name ?? 'System';
  const noun = NOUN[e.entityType] ?? e.entityType;
  const label = e.entityType === 'setting' && e.entityLabel ? (SETTING_NAMES[e.entityLabel] ?? e.entityLabel) : e.entityLabel;
  // Without a name, 'report on' would dangle: use the bare noun.
  const item = label ? `${noun} “${label}”` : `a ${e.entityType === 'report' ? 'report' : noun}`;
  const role = ROLE_NAMES[field(e.newValue, 'role') ?? ''] ?? field(e.newValue, 'role') ?? 'a';
  const template = TEMPLATES[e.action];
  const what = template
    ? template.replace('{item}', item).replace('{role}', role)
    : `${e.action.toLowerCase().replaceAll('_', ' ')} (${item})`;
  const reason = field(e.newValue, 'reason');
  return `${who} ${what}${reason ? `: “${reason}”` : ''}`;
}

/** Filter choices for the activity page. */
export const ACTIVITY_TYPES: [string, string][] = [
  ['', 'Everything'],
  ['business', 'Businesses'],
  ['offer', 'Offers'],
  ['user', 'Users'],
  ['category', 'Categories'],
  ['city', 'Cities'],
  ['locality', 'Areas'],
  ['setting', 'Settings'],
  ['report', 'Reports'],
];
