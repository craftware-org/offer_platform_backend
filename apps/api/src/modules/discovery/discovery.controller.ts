import { Controller, Get, Headers, Ip, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { OptionalAuth, OptionalPrincipal, Public } from '../../common/auth/decorators.js';
import type { Principal } from '../../common/auth/principal.js';
import { pageQuerySchema } from '../../common/http/pagination.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { DiscoveryService } from './discovery.service.js';
import { MAX_RADIUS_KM } from './ranking.js';

const location = {
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(0.5).max(MAX_RADIUS_KM).optional(),
  city: z.string().max(100).optional(),
};
const bothOrNeither = (v: { lat?: number; lng?: number }) => (v.lat === undefined) === (v.lng === undefined);
const pointMessage = { message: 'Send lat and lng together', path: ['lat'] };

const searchQuery = pageQuerySchema
  .extend({
    ...location,
    q: z.string().trim().max(120).optional(),
    locality: z.string().max(100).optional(),
    category: z.string().max(100).optional(),
    business: z.string().max(100).optional(),
    /** Rupees in the query string for convenience; converted to paise. */
    maxPriceRupees: z.coerce.number().positive().max(100_000_000).optional(),
    minDiscount: z.coerce.number().int().min(1).max(99).optional(),
    endingWithinHours: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 90)
      .optional(),
    sort: z.enum(['relevance', 'recommended', 'nearest', 'newest', 'ending_soon', 'discount']).optional(),
  })
  .refine(bothOrNeither, pointMessage);

const homeQuery = z.object(location).refine(bothOrNeither, pointMessage);

@ApiTags('Discovery')
@Public()
@Controller('discover')
export class DiscoveryController {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Get('offers')
  @ApiOperation({
    summary:
      'Search and filter live offers. q understands phrases like "shoes under 2000", "50% off", "near me", ' +
      '"fashion in Vidya Nagar"; meta.interpretation shows how it was read. lat/lng are used only for this ' +
      'request and are never stored.',
  })
  @OptionalAuth()
  async search(
    @Query({ schema: searchQuery }) query: z.infer<typeof searchQuery>,
    @OptionalPrincipal() principal: Principal | undefined,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const { maxPriceRupees, ...rest } = query;
    const page = await this.discovery.search({
      ...rest,
      ...(maxPriceRupees !== undefined ? { maxPrice: Math.round(maxPriceRupees * 100) } : {}),
    });
    // What people look for (Phase 7, ADR-0017): typed searches only, first page only.
    if (query.q && query.page === 1) {
      await this.analytics.recordSearch({
        query: query.q,
        citySlug: query.city,
        results: page.meta.totalItems,
        ip,
        userAgent,
        loggedIn: !!principal,
      });
    }
    return page;
  }

  @Get('home')
  @ApiOperation({ summary: 'Home screen sections: nearby, recommended, new, ending soon' })
  home(@Query({ schema: homeQuery }) query: z.infer<typeof homeQuery>) {
    return this.discovery.home(query);
  }
}
