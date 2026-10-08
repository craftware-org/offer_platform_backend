/**
 * Turns what someone typed into the form saved in `search_logs`: lower case, single spaces, at most
 * 100 characters; any run of 5+ digits (a phone or account number someone pasted) and any email
 * address replaced by '#'. Returns null when nothing worth counting is left. Kannada and other
 * scripts are kept.
 */
export function normalizeSearch(raw: string): string | null {
  const text = raw
    .normalize('NFKC')
    .toLocaleLowerCase('en-IN')
    .replace(/\S+@\S+/g, '#')
    .replace(/\d[\d\s-]{3,}\d/g, (run) => (run.replace(/\D/g, '').length >= 5 ? '#' : run))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
    .trim();
  return text.length >= 2 ? text : null;
}
