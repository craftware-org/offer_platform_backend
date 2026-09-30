import { z } from 'zod';

export const MAX_PAGE_SIZE = 50;

/** Offset pagination for admin tables. Feeds/search will use cursor pagination (Phase 4). */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export interface PageMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export class Page<T> {
  readonly meta: PageMeta;

  constructor(
    readonly items: T[],
    query: PageQuery,
    totalItems: number,
  ) {
    this.meta = {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    };
  }
}

export const offsetOf = (query: PageQuery) => (query.page - 1) * query.pageSize;
