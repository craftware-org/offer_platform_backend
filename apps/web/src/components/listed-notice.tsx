/**
 * Shown on shops an admin listed from the brand's public offers page (platform listings, owner
 * decision 2026-10-14). They are never shown as verified: customers are told where the details come
 * from and sent to the brand's own page to check them.
 */
export function ListedNotice({ appName, sourceUrl }: { appName: string; sourceUrl: string | null }) {
  return (
    <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900" data-testid="listed-notice">
      Listed by {appName} from the brand&apos;s public information, not by the shop itself. Offers can differ
      between outlets and change without notice
      {sourceUrl ? (
        <>
          : check the{' '}
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">
            brand&apos;s own page
          </a>{' '}
          before you go.
        </>
      ) : (
        '.'
      )}
    </p>
  );
}
