import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal, RequestId, RequirePermissions } from '../../common/auth/decorators.js';
import type { Principal } from '../../common/auth/principal.js';
import { Permission } from '../access-control/access-control.catalog.js';
import {
  createCitySchema,
  createLocalitySchema,
  updateCitySchema,
  updateLocalitySchema,
} from './locations.dto.js';
import { LocationsService } from './locations.service.js';

const idParam = z.uuid();

@ApiTags('Admin · Locations')
@ApiBearerAuth()
@RequirePermissions(Permission.LOCATIONS_MANAGE)
@Controller('admin')
export class LocationsAdminController {
  constructor(private readonly locations: LocationsService) {}

  @Get('cities')
  @ApiOperation({ summary: 'All cities, including inactive' })
  cities() {
    return this.locations.listCities(true);
  }

  @Post('cities')
  @ApiOperation({ summary: 'Add a city (platform expansion)' })
  createCity(
    @Body({ schema: createCitySchema }) body: z.infer<typeof createCitySchema>,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.locations.createCity(body, { userId: principal.userId, requestId });
  }

  @Patch('cities/:id')
  updateCity(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateCitySchema }) body: z.infer<typeof updateCitySchema>,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.locations.updateCity(id, body, { userId: principal.userId, requestId });
  }

  @Get('cities/:id/localities')
  @ApiOperation({ summary: 'All localities of a city, including inactive' })
  localities(@Param('id', { schema: idParam }) id: string) {
    return this.locations.listLocalities(id, true);
  }

  @Post('cities/:id/localities')
  createLocality(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: createLocalitySchema }) body: z.infer<typeof createLocalitySchema>,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.locations.createLocality(id, body, { userId: principal.userId, requestId });
  }

  @Patch('localities/:id')
  updateLocality(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateLocalitySchema }) body: z.infer<typeof updateLocalitySchema>,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.locations.updateLocality(id, body, { userId: principal.userId, requestId });
  }
}
