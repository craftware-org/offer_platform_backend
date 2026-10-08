import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { LocationsModule } from '../locations/locations.module.js';
import { OffersModule } from '../offers/offers.module.js';
import { DiscoveryController } from './discovery.controller.js';
import { DiscoveryService } from './discovery.service.js';

/**
 * Read-only discovery queries. Reads offers, businesses and locations tables directly for
 * performance (the one cross-module read allowed by ADR-0002).
 */
@Module({
  imports: [OffersModule, CategoriesModule, LocationsModule, AnalyticsModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryService],
})
export class DiscoveryModule {}
