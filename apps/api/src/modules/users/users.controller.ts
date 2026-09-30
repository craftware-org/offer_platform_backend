import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal } from '../../common/auth/decorators.js';
import type { Principal } from '../../common/auth/principal.js';
import { UsersService } from './users.service.js';

const updateProfileSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(100).optional(),
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase())
      .nullable()
      .optional(),
  })
  .refine((v) => v.name !== undefined || v.email !== undefined, {
    message: 'Provide at least one field to update',
  });

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users/me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Current user profile, roles and permissions' })
  async me(@CurrentPrincipal() principal: Principal) {
    const view = await this.users.getView(principal.userId);
    return { ...view, permissions: [...principal.permissions].sort() };
  }

  @Patch()
  @ApiOperation({ summary: 'Update own name and/or email' })
  update(
    @CurrentPrincipal() principal: Principal,
    @Body({ schema: updateProfileSchema }) body: z.infer<typeof updateProfileSchema>,
  ) {
    return this.users.updateProfile(principal.userId, body);
  }
}
