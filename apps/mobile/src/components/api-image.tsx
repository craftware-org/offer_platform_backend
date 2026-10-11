import { Image, type ImageStyle } from 'expo-image';
import { useEffect, useState } from 'react';
import type { StyleProp } from 'react-native';
import { authHeaders } from '@/lib/api';
import { apiUrl } from '@/lib/config';

/** A public image from the API (offer photos, logos, gallery), cached on disk. */
export function ApiImage({ path, style, label }: { path: string; style: StyleProp<ImageStyle>; label?: string }) {
  return (
    <Image
      source={{ uri: apiUrl(path) }}
      style={style}
      contentFit="cover"
      transition={150}
      cachePolicy="memory-disk"
      accessibilityLabel={label}
      accessible={!!label}
    />
  );
}

/**
 * A private image (verification photos, draft offer photos) fetched with the access token. Kept in
 * memory only, never written to the disk cache.
 */
export function AuthImage({ path, style }: { path: string; style: StyleProp<ImageStyle> }) {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let live = true;
    void authHeaders().then((h) => live && setHeaders(h));
    return () => {
      live = false;
    };
  }, [path]);
  if (!headers) return <Image style={style} />;
  return <Image source={{ uri: apiUrl(path), headers }} style={style} contentFit="cover" cachePolicy="memory" />;
}
