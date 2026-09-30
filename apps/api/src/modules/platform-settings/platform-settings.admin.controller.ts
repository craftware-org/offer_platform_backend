import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal, RequestId, RequirePermissions } from '../../common/auth/decorators.js';
import type { Principal } from '../../common/auth/principal.js';
import { Permission } from '../access-control/access-control.catalog.js';
import { PlatformSettingsService } from './platform-settings.service.js';
import { SETTING_KEYS } from './settings.registry.js';

const keyParam = z.enum(SETTING_KEYS);
const updateBody = z.strictObject({ value: z.unknown() });

@ApiTags('Admin · Settings')
@ApiBearerAuth()
@Controller('admin/settings')
export class PlatformSettingsAdminController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'All platform settings with current values and defaults' })
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  list() {
    return this.settings.list();
  }

  @Put(':key')
  @ApiOperation({ summary: 'Change a platform setting (validated, audited)' })
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  update(
    @Param('key', { schema: keyParam }) key: z.infer<typeof keyParam>,
    @Body({ schema: updateBody }) body: z.infer<typeof updateBody>,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.settings.update(key, body.value, { userId: principal.userId, requestId });
  }
}
