import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { WebhooksService } from './webhooks.service';
import { TenantResource, TenantResourceGuard } from '../auth/tenant-resource.guard';

@Controller('user-webhooks')
@UseGuards(JwtAuthGuard, TenantAccessGuard, TenantResourceGuard)
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get()
  findAll(@Query('tenantId') tenantId: string) {
    return this.webhooksService.findAll(tenantId);
  }

  @Post()
  create(@Body() body: { tenantId: string; name: string; url: string; events: string[]; secret?: string }) {
    return this.webhooksService.create(body);
  }

  @Put(':id')

  @TenantResource('userWebhook')
  update(@Param('id') id: string, @Body() body: Partial<{ name: string; url: string; events: string[]; enabled: boolean; secret: string }>) {
    return this.webhooksService.update(id, body);
  }

  @Delete(':id')

  @TenantResource('userWebhook')
  delete(@Param('id') id: string) {
    return this.webhooksService.delete(id);
  }
}
