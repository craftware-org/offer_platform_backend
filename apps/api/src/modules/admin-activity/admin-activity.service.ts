import { Injectable } from '@nestjs/common';
import { Page } from '../../common/http/pagination.js';
import { AuditService, type AuditQuery } from '../audit/audit.service.js';
import { BusinessReader } from '../businesses/business-reader.js';
import { CategoriesService } from '../categories/categories.service.js';
import { LocationsService } from '../locations/locations.service.js';
import { OfferReader } from '../offers/offer-reader.js';
import { UsersService } from '../users/users.service.js';

export interface ActivityEntry {
  id: string;
  at: Date;
  action: string;
  entityType: string;
  entityId: string | null;
  /** Who did it; null when the system (e.g. the worker or a CLI) acted. */
  actor: { id: string; name: string } | null;
  /** Human name of the item ("E2E Footwear House", "Vidya Nagar, Hubballi"), when it can be resolved. */
  entityLabel: string | null;
  oldValue: unknown;
  newValue: unknown;
  requestId: string | null;
}

type Labeler = (ids: string[]) => Promise<Map<string, string>>;

/**
 * Readable audit trail for the admin website. The audit module itself can't look up names (every
 * module depends on it), so this module composes the exported services instead (ADR-0002).
 */
@Injectable()
export class AdminActivityService {
  private readonly labelers: Record<string, Labeler>;

  constructor(
    private readonly audit: AuditService,
    private readonly users: UsersService,
    businesses: BusinessReader,
    offers: OfferReader,
    categories: CategoriesService,
    locations: LocationsService,
  ) {
    this.labelers = {
      user: (ids) => this.users.labelsFor(ids),
      business: (ids) => businesses.labelsFor(ids),
      offer: (ids) => offers.labelsFor(ids),
      category: (ids) => categories.labelsFor(ids),
      city: (ids) => locations.cityLabelsFor(ids),
      locality: (ids) => locations.localityLabelsFor(ids),
      // Settings are identified by their key, which is already readable.
      setting: async (ids) => new Map(ids.map((id) => [id, id])),
    };
  }

  async list(query: AuditQuery): Promise<Page<ActivityEntry>> {
    const page = await this.audit.list(query);
    const rows = page.items;

    const actorIds = [...new Set(rows.flatMap((r) => (r.actorUserId ? [r.actorUserId] : [])))];
    const idsByType = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!r.entityId || !this.labelers[r.entityType]) continue;
      if (!idsByType.has(r.entityType)) idsByType.set(r.entityType, new Set());
      idsByType.get(r.entityType)!.add(r.entityId);
    }

    // Sequential on purpose: a handful of small indexed lookups per page.
    const actors = await this.users.labelsFor(actorIds);
    const labels = new Map<string, Map<string, string>>();
    for (const [type, ids] of idsByType) labels.set(type, await this.labelers[type]!([...ids]));

    const items = rows.map((r): ActivityEntry => ({
      id: r.id,
      at: r.createdAt,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actor: r.actorUserId ? { id: r.actorUserId, name: actors.get(r.actorUserId) ?? 'Unknown user' } : null,
      entityLabel: (r.entityId && labels.get(r.entityType)?.get(r.entityId)) || null,
      oldValue: r.oldValue,
      newValue: r.newValue,
      requestId: r.requestId,
    }));
    return new Page(items, query, page.meta.totalItems);
  }
}
