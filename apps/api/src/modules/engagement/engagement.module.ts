import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal } from '../../common/auth/decorators.js';
import type { Principal } from '../../common/auth/principal.js';
import { pageQuerySchema } from '../../common/http/pagination.js';
import { BusinessesModule } from '../businesses/businesses.module.js';
import { OffersModule } from '../offers/offers.module.js';
import { EngagementService, TRACKABLE_EVENTS } from './engagement.service.js';

const idParam = z.uuid();
const saveSchema = z.strictObject({ offerId: z.uuid() });
const followSchema = z.strictObject({ businessId: z.uuid() });
const savedQuery = pageQuerySchema.extend({ status: z.enum(['active', 'ended']).default('active') });
const eventSchema = z
  .strictObject({
    type: z.enum(TRACKABLE_EVENTS),
    offerId: z.uuid().optional(),
    businessId: z.uuid().optional(),
  })
  .refine((v) => !!v.offerId !== !!v.businessId, { message: 'Provide either offerId or businessId', path: ['offerId'] });

/** Everything here needs a logged-in user (owner decision 2026-10-03). */
@ApiTags('Engagement')
@ApiBearerAuth()
@Controller()
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Post('me/saved-offers')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Save an offer (saving twice is harmless; ended offers cannot be saved)' })
  async save(@Body({ schema: saveSchema }) body: z.infer<typeof saveSchema>, @CurrentPrincipal() p: Principal) {
    await this.engagement.save(p.userId, body.offerId);
  }

  @Delete('me/saved-offers/:offerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsave(@Param('offerId', { schema: idParam }) offerId: string, @CurrentPrincipal() p: Principal) {
    await this.engagement.unsave(p.userId, offerId);
  }

  @Get('me/saved-offers')
  @ApiOperation({ summary: 'Saved offers: status=active (live or paused, default) or ended' })
  listSaved(@Query({ schema: savedQuery }) q: z.infer<typeof savedQuery>, @CurrentPrincipal() p: Principal) {
    return this.engagement.listSaved(p.userId, q.status, q);
  }

  @Get('me/saved-offers/ids')
  @ApiOperation({ summary: 'Ids of saved offers (to show filled hearts)' })
  savedIds(@CurrentPrincipal() p: Principal) {
    return this.engagement.savedIds(p.userId);
  }

  @Post('me/follows')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Follow a verified business' })
  async follow(@Body({ schema: followSchema }) body: z.infer<typeof followSchema>, @CurrentPrincipal() p: Principal) {
    await this.engagement.follow(p.userId, body.businessId);
  }

  @Delete('me/follows/:businessId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unfollow(@Param('businessId', { schema: idParam }) businessId: string, @CurrentPrincipal() p: Principal) {
    await this.engagement.unfollow(p.userId, businessId);
  }

  @Get('me/follows')
  @ApiOperation({ summary: 'Businesses this user follows' })
  following(@CurrentPrincipal() p: Principal) {
    return this.engagement.listFollowing(p.userId);
  }

  @Get('me/follows/ids')
  followedIds(@CurrentPrincipal() p: Principal) {
    return this.engagement.followedIds(p.userId);
  }

  @Get('me/feed/following')
  @ApiOperation({ summary: 'Live offers from followed businesses, newest first' })
  feed(@Query({ schema: pageQuerySchema }) q: z.infer<typeof pageQuerySchema>, @CurrentPrincipal() p: Principal) {
    return this.engagement.followingFeed(p.userId, q);
  }

  @Post('events')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Record a share or contact tap (OFFER_SHARED, CALL_CLICKED, WHATSAPP_CLICKED, WEBSITE_CLICKED, DIRECTIONS_CLICKED) on an offer or business',
  })
  async track(@Body({ schema: eventSchema }) body: z.infer<typeof eventSchema>, @CurrentPrincipal() p: Principal) {
    await this.engagement.track(p.userId, body.type, { offerId: body.offerId, businessId: body.businessId });
  }

  @Get('me/businesses/:id/engagement')
  @ApiOperation({ summary: 'Followers, saves, shares and contact taps for a business you manage, in total and per offer' })
  businessEngagement(@Param('id', { schema: idParam }) id: string, @CurrentPrincipal() p: Principal) {
    return this.engagement.businessEngagement(p.userId, id);
  }
}

/** Phase 5 engagement: saves, follows and share/contact taps (spec §23–26, §30). */
@Module({
  imports: [OffersModule, BusinessesModule],
  controllers: [EngagementController],
  providers: [EngagementService],
  exports: [EngagementService],
})
export class EngagementModule {}
