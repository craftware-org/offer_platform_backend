import { z } from 'zod';

export const MAX_PAGE_SIZE = 50;

/**
 * Offset pagination (page/pageSize), capped at 50 per page. Used for admin tables and for
 * discovery results, where relevance scores make cursors impractical at MVP scale.
 */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export interface PageMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  [extra: string]: unknown;
}

export class Page<T> {
  readonly meta: PageMeta;

  /** `extraMeta` is merged into `meta` (e.g. how a search query was interpreted). */
  constructor(
    readonly items: T[],
    query: PageQuery,
    totalItems: number,
    extraMeta: Record<string, unknown> = {},
  ) {
    this.meta = {
      ...extraMeta,
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    };
  }
}

export const offsetOf = (query: PageQuery) => (query.page - 1) * query.pageSize;
