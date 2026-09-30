import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { eq, inArray, isNull, max } from 'drizzle-orm';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { slugify } from '../../common/text/slug.js';
import { DB, type Database, type Executor } from '../../infrastructure/database/database.module.js';
import { isUniqueViolation } from '../../infrastructure/database/pg-errors.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { categories, type CategoryRow } from './categories.schema.js';
import { buildCategoryTree, toCategoryView, type CategoryNode, type CategoryView } from './category-tree.js';

interface Actor {
  userId: string;
  requestId?: string;
}

export interface CategoryInput {
  name: string;
  slug?: string;
  description?: string | null;
  parentId?: string | null;
}

const invalid = (field: string, message: string) =>
  new AppError(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, message, { [field]: message });

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async tree(includeInactive = false): Promise<CategoryNode[]> {
    const rows = await this.db.select().from(categories);
    return buildCategoryTree(rows, !includeInactive);
  }

  /** A category a business may be filed under: active, and its parent (if any) active. */
  async assertAssignable(categoryId: string, db: Executor = this.db): Promise<CategoryView> {
    const [row] = await db.select().from(categories).where(eq(categories.id, categoryId));
    let usable = !!row?.isActive;
    if (row?.parentId) {
      const [parent] = await db.select().from(categories).where(eq(categories.id, row.parentId));
      usable = usable && !!parent?.isActive;
    }
    if (!row || !usable) throw invalid('categoryId', 'Unknown or inactive category');
    return toCategoryView(row);
  }

  /** An active category and its active subcategories (for "show everything under Shopping"). */
  async idsForSlug(slug: string): Promise<string[]> {
    for (const parent of await this.tree()) {
      if (parent.slug === slug) return [parent.id, ...parent.children.map((c) => c.id)];
      const child = parent.children.find((c) => c.slug === slug);
      if (child) return [child.id];
    }
    throw AppError.notFound('Category');
  }

  async getMany(ids: string[]): Promise<Map<string, CategoryView>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.select().from(categories).where(inArray(categories.id, ids));
    return new Map(rows.map((r) => [r.id, toCategoryView(r)]));
  }

  // ---- Admin ------------------------------------------------------------------------------

  async create(input: CategoryInput, actor: Actor): Promise<CategoryView> {
    return this.uniquely(() =>
      this.db.transaction(async (tx) => {
        const parentId = input.parentId ?? null;
        if (parentId) await this.assertTopLevel(parentId, tx);
        const [last] = await tx
          .select({ value: max(categories.sortOrder) })
          .from(categories)
          .where(parentId ? eq(categories.parentId, parentId) : isNull(categories.parentId));
        const values = {
          name: input.name,
          slug: input.slug ?? slugify(input.name, 'category'),
          description: input.description ?? null,
          parentId,
          sortOrder: (last?.value ?? 0) + 1,
        };
        const [created] = await tx.insert(categories).values(values).returning();
        if (!created) throw new Error('Insert returned no row');
        await this.audit.record(
          {
            actorUserId: actor.userId,
            action: AuditAction.CATEGORY_CREATED,
            entityType: 'category',
            entityId: created.id,
            newValue: values,
            requestId: actor.requestId,
          },
          tx,
        );
        return toCategoryView(created);
      }),
    );
  }

  async update(id: string, patch: Partial<CategoryInput> & { isActive?: boolean }, actor: Actor) {
    return this.uniquely(() =>
      this.db.transaction(async (tx) => {
        const [before] = await tx.select().from(categories).where(eq(categories.id, id)).for('update');
        if (!before) throw AppError.notFound('Category');

        if (patch.parentId !== undefined && patch.parentId !== before.parentId) {
          if (patch.parentId === id) throw invalid('parentId', 'A category cannot be its own parent');
          if (patch.parentId) {
            await this.assertTopLevel(patch.parentId, tx);
            const [child] = await tx
              .select({ id: categories.id })
              .from(categories)
              .where(eq(categories.parentId, id))
              .limit(1);
            if (child) throw invalid('parentId', 'A category with subcategories cannot become a subcategory');
          }
        }

        const [after] = await tx.update(categories).set(patch).where(eq(categories.id, id)).returning();
        await this.audit.record(
          {
            actorUserId: actor.userId,
            action: AuditAction.CATEGORY_CHANGED,
            entityType: 'category',
            entityId: id,
            oldValue: Object.fromEntries(Object.keys(patch).map((k) => [k, before[k as keyof CategoryRow]])),
            newValue: patch,
            requestId: actor.requestId,
          },
          tx,
        );
        return toCategoryView(after!);
      }),
    );
  }

  /** Sets the display order of all siblings under one parent (null = top level). */
  async reorder(parentId: string | null, orderedIds: string[], actor: Actor): Promise<CategoryNode[]> {
    await this.db.transaction(async (tx) => {
      const siblings = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(parentId ? eq(categories.parentId, parentId) : isNull(categories.parentId))
        .for('update');
      const expected = new Set(siblings.map((s) => s.id));
      const sameSet =
        orderedIds.length === expected.size &&
        new Set(orderedIds).size === orderedIds.length &&
        orderedIds.every((cid) => expected.has(cid));
      if (!sameSet) {
        throw invalid('orderedIds', 'orderedIds must list every category under this parent exactly once');
      }
      for (const [index, cid] of orderedIds.entries()) {
        await tx
          .update(categories)
          .set({ sortOrder: index + 1 })
          .where(eq(categories.id, cid));
      }
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: AuditAction.CATEGORIES_REORDERED,
          entityType: 'category',
          entityId: parentId,
          newValue: { orderedIds },
          requestId: actor.requestId,
        },
        tx,
      );
    });
    return this.tree(true);
  }

  private async assertTopLevel(parentId: string, db: Executor): Promise<void> {
    const [parent] = await db.select().from(categories).where(eq(categories.id, parentId));
    if (!parent) throw invalid('parentId', 'Parent category not found');
    if (parent.parentId) throw invalid('parentId', 'Only two levels are allowed: category → subcategory');
  }

  private async uniquely<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isUniqueViolation(error)) throw AppError.conflict('A category with this slug already exists');
      throw error;
    }
  }
}
