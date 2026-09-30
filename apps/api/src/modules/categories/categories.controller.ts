import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal, Public, RequestId, RequirePermissions } from '../../common/auth/decorators.js';
import type { Principal } from '../../common/auth/principal.js';
import { SLUG_PATTERN } from '../../common/text/slug.js';
import { Permission } from '../access-control/access-control.catalog.js';
import { CategoriesService } from './categories.service.js';

const name = z.string().trim().min(2).max(80);
const slug = z.string().min(2).max(100).regex(SLUG_PATTERN, 'Lowercase letters, digits and dashes only');
const description = z.string().trim().max(300).nullable();

const createSchema = z.strictObject({
  name,
  slug: slug.optional(),
  description: description.optional(),
  parentId: z.uuid().nullable().optional(),
});
const updateSchema = z
  .strictObject({ name, slug, description, parentId: z.uuid().nullable(), isActive: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
const reorderSchema = z.strictObject({
  parentId: z.uuid().nullable(),
  orderedIds: z.array(z.uuid()).min(1).max(200),
});
const idParam = z.uuid();

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Active category tree (category → subcategories), in display order' })
  tree() {
    return this.categories.tree();
  }
}

@ApiTags('Admin · Categories')
@ApiBearerAuth()
@RequirePermissions(Permission.CATEGORIES_MANAGE)
@Controller('admin/categories')
export class CategoriesAdminController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Full category tree including disabled categories' })
  tree() {
    return this.categories.tree(true);
  }

  @Post()
  create(
    @Body({ schema: createSchema }) body: z.infer<typeof createSchema>,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.categories.create(body, { userId: principal.userId, requestId });
  }

  @Put('order')
  @ApiOperation({ summary: 'Reorder all categories under one parent (null = top level)' })
  reorder(
    @Body({ schema: reorderSchema }) body: z.infer<typeof reorderSchema>,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.categories.reorder(body.parentId, body.orderedIds, { userId: principal.userId, requestId });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit, disable/enable or move a category' })
  update(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateSchema }) body: z.infer<typeof updateSchema>,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.categories.update(id, body, { userId: principal.userId, requestId });
  }
}
