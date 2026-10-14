import { router } from 'expo-router';
import { resolveLink } from './links';

/** Only app screens: never follow a link to somewhere else after login. */
export function safeNext(value: string | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return resolveLink(value).kind === 'app' ? value : null;
}

/** Leaves the login / welcome screens: to `next`, or back to where the person was. */
export function leaveLogin(next: string | null) {
  if (router.canGoBack()) router.back();
  else router.replace('/');
  if (next) router.push(next as never);
}
