/**
 * Who runs the platform and how to reach them, for the legal pages (Phase 9). These are DRAFT
 * values: the owner confirms them, and a lawyer reviews the pages, before public launch. `null`
 * shows a visible "to be provided" placeholder on the page.
 */
export const legal = {
  /** The company that builds and operates the platform (the "data fiduciary" under the DPDP Act). */
  company: 'Craftware',
  contactEmail: 'craftwaretech@gmail.com',
  /** Registered postal address. */
  address: null as string | null,
  /** Grievance officer (DPDP Act 2023): name and email. */
  grievanceOfficer: null as { name: string; email: string } | null,
  /** Courts named in the terms. */
  jurisdiction: null as string | null,
  /** Date shown on the pages; becomes the "effective date" once final. */
  draftDate: '13 October 2026',
} as const;
