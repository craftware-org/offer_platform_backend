import type { CategoryRow } from './categories.schema.js';
import { buildCategoryTree } from './category-tree.js';

const row = (id: string, parentId: string | null, sortOrder: number, isActive = true): CategoryRow => ({
  id,
  parentId,
  name: id,
  slug: id,
  description: null,
  sortOrder,
  isActive,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('buildCategoryTree', () => {
  const rows = [
    row('food', null, 2),
    row('shopping', null, 1),
    row('footwear', 'shopping', 2),
    row('fashion', 'shopping', 1),
    row('cafes', 'food', 1, false),
    row('experiences', null, 3, false),
    row('travel', 'experiences', 1),
  ];

  it('orders parents and children by sortOrder', () => {
    const tree = buildCategoryTree(rows, false);
    expect(tree.map((c) => c.slug)).toEqual(['shopping', 'food', 'experiences']);
    expect(tree[0]?.children.map((c) => c.slug)).toEqual(['fashion', 'footwear']);
  });

  it('hides inactive categories and every child of an inactive parent', () => {
    const tree = buildCategoryTree(rows, true);
    expect(tree.map((c) => c.slug)).toEqual(['shopping', 'food']);
    expect(tree[1]?.children).toEqual([]);
  });
});
