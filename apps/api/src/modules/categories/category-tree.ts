import type { CategoryRow } from './categories.schema.js';

export interface CategoryView {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface CategoryNode extends CategoryView {
  children: CategoryView[];
}

export const toCategoryView = (c: CategoryRow): CategoryView => ({
  id: c.id,
  parentId: c.parentId,
  name: c.name,
  slug: c.slug,
  description: c.description,
  sortOrder: c.sortOrder,
  isActive: c.isActive,
});

const bySortOrder = (a: CategoryView, b: CategoryView) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

/**
 * Builds the two-level tree. With `activeOnly`, inactive categories are dropped, and so are
 * the children of an inactive parent (disabling a parent hides its whole branch).
 */
export function buildCategoryTree(rows: CategoryRow[], activeOnly: boolean): CategoryNode[] {
  const views = rows.map(toCategoryView);
  const visible = (c: CategoryView) => !activeOnly || c.isActive;
  return views
    .filter((c) => c.parentId === null && visible(c))
    .sort(bySortOrder)
    .map((parent) => ({
      ...parent,
      children: views.filter((c) => c.parentId === parent.id && visible(c)).sort(bySortOrder),
    }));
}
