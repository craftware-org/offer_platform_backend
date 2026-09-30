import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal, RequestId, RequirePermissions } from '../../common/auth/decorators.js';
import type { Principal } from '../../common/auth/principal.js';
import { pageQuerySchema } from '../../common/http/pagination.js';
import { ADMIN_ASSIGNABLE_ROLES, Permission } from '../access-control/access-control.catalog.js';
import { UsersService } from './users.service.js';

const listUsersSchema = pageQuerySchema.extend({
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']).optional(),
});

const setStatusSchema = z.strictObject({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().trim().min(3).max(500),
});

const roleBodySchema = z.strictObject({ role: z.enum(ADMIN_ASSIGNABLE_ROLES) });
const roleParam = z.enum(ADMIN_ASSIGNABLE_ROLES);
const userIdParam = z.uuid();

@ApiTags('Admin · Users')
@ApiBearerAuth()
@Controller('admin/users')
export class UsersAdminController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Search users (phone, name, email) and filter by status' })
  @RequirePermissions(Permission.USERS_READ)
  list(@Query({ schema: listUsersSchema }) query: z.infer<typeof listUsersSchema>) {
    return this.users.list(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.USERS_READ)
  get(@Param('id', { schema: userIdParam }) id: string) {
    return this.users.getView(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Suspend or reactivate a user (audited)' })
  @RequirePermissions(Permission.USERS_MANAGE_STATUS)
  setStatus(
    @Param('id', { schema: userIdParam }) id: string,
    @Body({ schema: setStatusSchema }) body: z.infer<typeof setStatusSchema>,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.users.setStatus(id, body.status, body.reason, { userId: principal.userId, requestId });
  }

  @Post(':id/roles')
  @ApiOperation({ summary: 'Grant an administrative role (audited)' })
  @RequirePermissions(Permission.ROLES_ASSIGN)
  grantRole(
    @Param('id', { schema: userIdParam }) id: string,
    @Body({ schema: roleBodySchema }) body: z.infer<typeof roleBodySchema>,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.users.grantRole(id, body.role, { userId: principal.userId, requestId });
  }

  @Delete(':id/roles/:role')
  @ApiOperation({ summary: 'Revoke an administrative role (audited)' })
  @RequirePermissions(Permission.ROLES_ASSIGN)
  revokeRole(
    @Param('id', { schema: userIdParam }) id: string,
    @Param('role', { schema: roleParam }) role: z.infer<typeof roleParam>,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.users.revokeRole(id, role, { userId: principal.userId, requestId });
  }
}
