import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { RequirePermissions } from '../../common/auth/decorators.js';
import { pageQuerySchema } from '../../common/http/pagination.js';
import { Permission } from '../access-control/access-control.catalog.js';
import { AuditService } from './audit.service.js';

const auditQuerySchema = pageQuerySchema.extend({
  entityType: z.string().max(50).optional(),
  entityId: z.string().max(64).optional(),
  actorUserId: z.uuid().optional(),
  action: z.string().max(100).optional(),
});

@ApiTags('Admin · Audit')
@ApiBearerAuth()
@Controller('admin/audit-logs')
export class AuditAdminController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit log entries, newest first' })
  @RequirePermissions(Permission.AUDIT_READ)
  list(@Query({ schema: auditQuerySchema }) query: z.infer<typeof auditQuerySchema>) {
    return this.audit.list(query);
  }
}
