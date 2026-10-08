'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';
import { visitorId } from '@/lib/visitor';

/**
 * Counts one page view of an offer or a shop (Phase 7). Sent from the browser after the page shows,
 * so link previews and most bots (which don't run the page) are not counted. Never shows anything.
 */
export function TrackView(props: { offerId: string } | { businessId: string }) {
  const [type, key, id] =
    'offerId' in props ? (['OFFER_VIEWED', 'offerId', props.offerId] as const) : (['BUSINESS_VIEWED', 'businessId', props.businessId] as const);
  useEffect(() => {
    void api('/events', { method: 'POST', body: { type, [key]: id, visitorId: visitorId() } }).catch(() => {});
  }, [type, key, id]);
  return null;
}
