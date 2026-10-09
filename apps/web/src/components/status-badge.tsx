const COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING: 'bg-gray-100 text-gray-700',
  PENDING_REVIEW: 'bg-amber-100 text-amber-800',
  UNDER_REVIEW: 'bg-amber-100 text-amber-800',
  SCHEDULED: 'bg-blue-100 text-blue-800',
  ACTIVE: 'bg-green-100 text-green-800',
  VERIFIED: 'bg-green-100 text-green-800',
  PAUSED: 'bg-slate-200 text-slate-800',
  EXPIRED: 'bg-gray-200 text-gray-600',
  REJECTED: 'bg-red-100 text-red-800',
  SUSPENDED: 'bg-red-100 text-red-800',
  CLOSED: 'bg-gray-200 text-gray-700',
  OPEN: 'bg-amber-100 text-amber-800',
  RESOLVED: 'bg-green-100 text-green-800',
  DISMISSED: 'bg-gray-200 text-gray-600',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${COLORS[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status.replaceAll('_', ' ').toLowerCase()}
    </span>
  );
}
