'use client';

import { useEffect, useState } from 'react';
import { apiBlob } from '@/lib/api';

/**
 * An image that needs the bearer token (verification photos, owner/admin views).
 * Fetched with auth and shown from a short-lived blob: URL (ADR-0014).
 */
export function AuthImage({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let url: string | null = null;
    apiBlob(path, controller.signal)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);

  if (failed) return <div className={`bg-gray-100 text-xs text-gray-500 ${className ?? ''}`}>Image unavailable</div>;
  if (!src) return <div className={`animate-pulse bg-gray-100 ${className ?? ''}`} />;
  // eslint-disable-next-line @next/next/no-img-element -- blob URL
  return <img src={src} alt={alt} className={className} />;
}
