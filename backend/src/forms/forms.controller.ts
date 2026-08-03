import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { FormsService } from './forms.service';
import { FormField, FormStyle } from './form.entity';

@Controller('forms')
export class FormsController {
  constructor(private readonly service: FormsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, TenantAccessGuard)
  findAll(@Query('tenantId') tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Get('public/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, TenantAccessGuard)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, TenantAccessGuard)
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
  @UseGuards(JwtAuthGuard, TenantAccessGuard)
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
  @UseGuards(JwtAuthGuard, TenantAccessGuard)
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string, @Body() body: { values: Record<string, string> }) {
    return this.service.handleSubmission(id, body.values);
  }
}
