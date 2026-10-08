import { Body, Controller, Get, HttpCode, HttpStatus, Module, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal, Public } from '../../common/auth/decorators.js';
import type { Principal } from '../../common/auth/principal.js';
import { pageQuerySchema } from '../../common/http/pagination.js';
import { Role } from '../access-control/access-control.catalog.js';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { BusinessesModule } from '../businesses/businesses.module.js';
import { EngagementModule } from '../engagement/engagement.module.js';
import { OffersModule } from '../offers/offers.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { UsersModule } from '../users/users.module.js';
import { NOTIFICATION_TYPES } from './notification-catalog.js';
import { NotificationsService } from './notifications.service.js';

const readSchema = z
  .strictObject({ ids: z.array(z.uuid()).min(1).max(100).optional(), all: z.literal(true).optional() })
  .refine((v) => !!v.ids !== !!v.all, { message: 'Provide ids or all: true', path: ['ids'] });
const preferenceSchema = z.strictObject({
  type: z.enum(NOTIFICATION_TYPES),
  inApp: z.boolean(),
  email: z.boolean(),
});
const unsubscribeSchema = z.strictObject({ token: z.string().min(10).max(500) });

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('me/notifications')
  @ApiOperation({ summary: 'Inbox, newest first; meta.unread = unread count' })
  list(@Query({ schema: pageQuerySchema }) q: z.infer<typeof pageQuerySchema>, @CurrentPrincipal() p: Principal) {
    return this.notifications.list(p.userId, q);
  }

  @Get('me/notifications/unread-count')
  async unread(@CurrentPrincipal() p: Principal) {
    return { unread: await this.notifications.unreadCount(p.userId) };
  }

  @Post('me/notifications/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark notifications as read: { ids: [...] } or { all: true }' })
  async markRead(@Body({ schema: readSchema }) body: z.infer<typeof readSchema>, @CurrentPrincipal() p: Principal) {
    await this.notifications.markRead(p.userId, body.all ? 'all' : body.ids!);
  }

  @Get('me/notification-preferences')
  @ApiOperation({ summary: 'Inbox/email choice per notification type that applies to you, with defaults' })
  preferences(@CurrentPrincipal() p: Principal) {
    const isAdmin = p.roles.includes(Role.ADMIN) || p.roles.includes(Role.SUPER_ADMIN);
    return this.notifications.preferences(p.userId, isAdmin);
  }

  @Put('me/notification-preferences')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setPreference(@Body({ schema: preferenceSchema }) body: z.infer<typeof preferenceSchema>, @CurrentPrincipal() p: Principal) {
    await this.notifications.setPreference(p.userId, body.type, { inApp: body.inApp, email: body.email });
  }

  @Public()
  @Post('notifications/unsubscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'One-click unsubscribe from one email type (signed link from the email, no login)' })
  unsubscribe(@Body({ schema: unsubscribeSchema }) body: z.infer<typeof unsubscribeSchema>) {
    return this.notifications.unsubscribe(body.token);
  }
}

/** Phase 6 notifications (spec §29, ADR-0016). Loaded by both the API and the worker. */
@Module({
  imports: [UsersModule, AccessControlModule, BusinessesModule, OffersModule, EngagementModule, ReportsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
