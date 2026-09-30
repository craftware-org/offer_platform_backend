import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../../common/auth/decorators.js';
import { LocationsService } from './locations.service.js';

const slugParam = z.string().min(1).max(100);

@ApiTags('Locations')
@Public()
@Controller('cities')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  @ApiOperation({ summary: 'Cities the platform operates in' })
  cities() {
    return this.locations.listCities();
  }

  @Get(':slug/localities')
  @ApiOperation({ summary: 'Active localities of a city' })
  async localities(@Param('slug', { schema: slugParam }) slug: string) {
    const city = await this.locations.getCityBySlug(slug);
    return this.locations.listLocalities(city.id);
  }
}
