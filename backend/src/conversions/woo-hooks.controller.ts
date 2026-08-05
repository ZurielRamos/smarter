import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WooHook } from './woo-hook.entity';

@Controller('woo-hooks')
@UseGuards(JwtAuthGuard)
export class WooHooksController {
  constructor(
    @InjectRepository(WooHook)
    private readonly wooHookRepo: Repository<WooHook>,
  ) {}

  @Get()
  async findAll(@Query('tenantId') tenantId: string) {
    return this.wooHookRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  @Post()
  async create(@Body() body: {
    tenantId: string;
    event: string;
    actionType: string;
    enabled?: boolean;
    config?: Record<string, any>;
  }) {
    const hook = this.wooHookRepo.create({
      tenantId: body.tenantId,
      event: body.event,
      actionType: body.actionType,
      enabled: body.enabled ?? true,
      config: body.config || {},
    });
    return this.wooHookRepo.save(hook);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: Partial<{
    event: string;
    actionType: string;
    enabled: boolean;
    config: Record<string, any>;
  }>) {
    await this.wooHookRepo.update(id, {
      ...(body.event && { event: body.event }),
      ...(body.actionType && { actionType: body.actionType }),
      ...(body.enabled !== undefined && { enabled: body.enabled }),
      ...(body.config && { config: body.config }),
    });
    return this.wooHookRepo.findOneBy({ id });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.wooHookRepo.delete(id);
    return { deleted: true };
  }
}
