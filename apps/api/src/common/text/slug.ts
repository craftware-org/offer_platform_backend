import { randomBytes } from 'node:crypto';

const MAX_SLUG_LENGTH = 80;

/**
 * URL slug from free text: "Sri Ganesh Stores & Co." → "sri-ganesh-stores-co".
 * Text with no Latin letters/digits (e.g. Kannada-only names) yields `fallback`.
 */
export function slugify(text: string, fallback = 'item'): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug || fallback;
}

/** Short random suffix used to make a slug unique: "sri-ganesh-stores-7k2p". */
export function withRandomSuffix(slug: string): string {
  const suffix = randomBytes(3)
    .toString('base64url')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, 'x');
  return `${slug.slice(0, MAX_SLUG_LENGTH - 5)}-${suffix}`;
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
