'use client';

import { useState } from 'react';
import { errorMessage } from '@/lib/api';
import { useEngagement, type TapEvent } from '@/lib/engagement';

/** ♡ / ♥ save toggle. Works inside a card link (it stops the link from opening). */
export function SaveButton({ offerId, compact }: { offerId: string; compact?: boolean }) {
  const { isSaved, toggleSave } = useEngagement();
  const [error, setError] = useState<string | null>(null);
  const saved = isSaved(offerId);
  return (
    <>
      <button
        type="button"
        aria-pressed={saved}
        aria-label={saved ? 'Remove from saved' : 'Save offer'}
        title={error ?? (saved ? 'Saved' : 'Save')}
        className={
          compact
            ? `rounded-full bg-white/90 px-2 py-1 text-lg leading-none shadow ${saved ? 'text-red-600' : 'text-gray-700'}`
            : `btn-secondary ${saved ? 'text-red-600' : ''}`
        }
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setError(null);
          toggleSave(offerId).catch((err) => setError(errorMessage(err)));
        }}
      >
        {saved ? '♥' : '♡'}
        {!compact && (saved ? ' Saved' : ' Save')}
      </button>
      {error && !compact && <span className="text-xs text-red-600">{error}</span>}
    </>
  );
}

export function FollowButton({ businessId }: { businessId: string }) {
  const { isFollowing, toggleFollow } = useEngagement();
  const [error, setError] = useState<string | null>(null);
  const following = isFollowing(businessId);
  return (
    <>
      <button
        type="button"
        aria-pressed={following}
        className={following ? 'btn-secondary' : 'btn-primary'}
        onClick={() => {
          setError(null);
          toggleFollow(businessId).catch((err) => setError(errorMessage(err)));
        }}
      >
        {following ? '✓ Following' : '+ Follow'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </>
  );
}

/** Share via the phone's share sheet when available, else WhatsApp / copy link. Records the share. */
export function ShareButton({ offerId, title }: { offerId: string; title: string }) {
  const { track } = useEngagement();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);

  async function share() {
    const url = window.location.href;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        track('OFFER_SHARED', { offerId });
      } catch {
        // cancelled
      }
      return;
    }
    setOpen((o) => !o);
  }

  return (
    <span className="relative inline-flex">
      <button type="button" className="btn-secondary" onClick={() => void share()}>
        ↗ Share
      </button>
      {open && (
        <span className="absolute top-full left-0 z-10 mt-1 flex w-48 flex-col rounded-lg border border-gray-200 bg-white p-1 text-sm shadow">
          <a
            className="rounded px-3 py-2 hover:bg-gray-50"
            href={`https://wa.me/?text=${encodeURIComponent(`${title} ${typeof window === 'undefined' ? '' : window.location.href}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              track('OFFER_SHARED', { offerId });
              setOpen(false);
            }}
          >
            WhatsApp
          </a>
          <button
            type="button"
            className="rounded px-3 py-2 text-left hover:bg-gray-50"
            onClick={() => {
              // The person chose to share either way; count it even if the browser blocks the clipboard.
              track('OFFER_SHARED', { offerId });
              navigator.clipboard
                ?.writeText(window.location.href)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => {
                    setCopied(false);
                    setOpen(false);
                  }, 1200);
                })
                .catch(() => setManual(true));
              if (!navigator.clipboard) setManual(true);
            }}
          >
            {copied ? 'Link copied ✓' : 'Copy link'}
          </button>
          {manual && (
            <input
              className="input mt-1 text-xs"
              readOnly
              aria-label="Offer link"
              value={window.location.href}
              onFocus={(e) => e.target.select()}
            />
          )}
        </span>
      )}
    </span>
  );
}

interface Contact {
  phone: string;
  whatsapp: string | null;
  website?: string | null;
  latitude: number;
  longitude: number;
}

/** Call / WhatsApp / Directions / Website links; each tap is counted for logged-in users. */
export function ContactLinks({ contact, target }: { contact: Contact; target: { offerId?: string; businessId?: string } }) {
  const { track } = useEngagement();
  const whatsapp = contact.whatsapp?.replace(/[^\d]/g, '');
  const tap = (type: TapEvent) => () => track(type, target);
  return (
    <div className="flex flex-wrap gap-2">
      <a className="btn-primary" href={`tel:${contact.phone}`} onClick={tap('CALL_CLICKED')}>
        Call
      </a>
      {whatsapp && (
        <a className="btn-secondary" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" onClick={tap('WHATSAPP_CLICKED')}>
          WhatsApp
        </a>
      )}
      <a
        className="btn-secondary"
        href={`https://www.google.com/maps/dir/?api=1&destination=${contact.latitude},${contact.longitude}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={tap('DIRECTIONS_CLICKED')}
      >
        Directions
      </a>
      {contact.website && (
        <a className="btn-secondary" href={contact.website} target="_blank" rel="noopener noreferrer nofollow" onClick={tap('WEBSITE_CLICKED')}>
          Website
        </a>
      )}
    </div>
  );
}
