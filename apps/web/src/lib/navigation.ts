/** Which phone tab a path belongs to (deeper pages light up their section). */
export function activeTab(pathname: string): string | null {
  if (pathname === '/') return '/';
  for (const tab of ['/search', '/saved', '/notifications', '/account']) {
    if (pathname === tab || pathname.startsWith(`${tab}/`)) return tab;
  }
  if (pathname.startsWith('/following') || pathname.startsWith('/business') || pathname.startsWith('/admin')) {
    return '/account';
  }
  return null;
}
