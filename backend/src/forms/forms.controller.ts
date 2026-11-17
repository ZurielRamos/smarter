import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AttributionInput } from '../conversions/conversions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { Public } from '../auth/public.decorator';
import { FormsService } from './forms.service';
import { FormField, FormStyle } from './form.entity';
import { TenantRefs, TenantResource, TenantResourceGuard } from '../auth/tenant-resource.guard';

@Controller('forms')
@UseGuards(JwtAuthGuard, TenantAccessGuard, TenantResourceGuard)
export class FormsController {
  constructor(private readonly service: FormsService) {}

  @Get()
  findAll(@Query('tenantId') tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Public()
  @Get('public/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }

  @Get(':id')

  @TenantResource('form')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()

  @TenantRefs({ kind: 'inbox', in: 'body', field: 'inboxId' })
  create(@Body() body: {
    tenantId: string;
    inboxId?: string;
    name: string;
    description?: string;
    fields?: FormField[];
    style?: FormStyle;
  }) {
    return this.service.create(body);
  }

  @Put(':id')

  @TenantResource('form')

  @TenantRefs({ kind: 'inbox', in: 'body', field: 'inboxId' })
  update(@Param('id') id: string, @Body() body: Partial<{
    name: string;
    description: string;
    fields: FormField[];
    style: FormStyle;
    status: string;
    inboxId: string;
    slug: string;
  }>) {
    return this.service.update(id, body);
  }

  @Delete(':id')

  @TenantResource('form')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }

  @Public()
  @Post(':id/submit')
  submit(
    @Param('id') id: string,
    @Body() body: { values: Record<string, string>; attribution?: AttributionInput },
    @Req() req: Request,
  ) {
    return this.service.handleSubmission(id, body.values, body.attribution, {
      ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || undefined,
      userAgent: req.headers['user-agent'],
    });
  }
}
