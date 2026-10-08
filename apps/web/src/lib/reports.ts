/** Shapes of /admin/reports (Phase 5). */
export interface AdminReport {
  id: string;
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED';
  reason: string;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
  offer: { id: string; title: string | null };
  business: { id: string; name: string | null };
  reporter: { id: string; name: string } | null;
  openReportsOnOffer: number;
  actions?: { action: string; note: string | null; at: string; by: string | null }[];
}

export const REPORT_ACTIONS: {
  action: 'DISMISS' | 'WARN_BUSINESS' | 'SUSPEND_OFFER' | 'SUSPEND_BUSINESS';
  label: string;
  help: string;
  permission?: string;
  style: string;
}[] = [
  { action: 'DISMISS', label: 'Dismiss', help: 'No problem found. Closes this report only.', style: 'btn-secondary' },
  {
    action: 'WARN_BUSINESS',
    label: 'Warn the business',
    help: 'Your message appears on the business’s dashboard. Closes this report.',
    style: 'btn-secondary',
  },
  {
    action: 'SUSPEND_OFFER',
    label: 'Suspend the offer',
    help: 'Hides the offer now; the business sees your reason. Closes every open report on this offer.',
    permission: 'offers:moderate',
    style: 'btn-danger',
  },
  {
    action: 'SUSPEND_BUSINESS',
    label: 'Suspend the business',
    help: 'Hides the shop and all its offers. Closes every open report about this business.',
    permission: 'businesses:manage',
    style: 'btn-danger',
  },
];

export const ACTION_LABELS: Record<string, string> = Object.fromEntries(REPORT_ACTIONS.map((a) => [a.action, a.label]));
