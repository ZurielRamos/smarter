import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { TeamsService } from './teams.service';
import { TenantResource, TenantResourceGuard } from '../auth/tenant-resource.guard';

@Controller('teams')
@UseGuards(JwtAuthGuard, TenantAccessGuard, TenantResourceGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  findAll(@Query('tenantId') tenantId: string) {
    return this.teamsService.findAll(tenantId);
  }

  @Get(':id')

  @TenantResource('team')
  findOne(@Param('id') id: string) {
    return this.teamsService.findOne(id);
  }

  @Post()
  create(@Body() body: { tenantId: string; name: string; description?: string }) {
    return this.teamsService.create(body);
  }

  @Put(':id')

  @TenantResource('team')
  update(@Param('id') id: string, @Body() body: { name?: string; description?: string }) {
    return this.teamsService.update(id, body);
  }

  @Delete(':id')

  @TenantResource('team')
  remove(@Param('id') id: string) {
    return this.teamsService.remove(id);
  }

  @Get(':id/members')

  @TenantResource('team')
  getMembers(@Param('id') id: string) {
    return this.teamsService.getMembers(id);
  }

  @Post(':id/members')

  @TenantResource('team')
  addMember(@Param('id') id: string, @Body() body: { userId: string }) {
    return this.teamsService.addMember(id, body.userId);
  }

  @Delete(':id/members/:userId')

  @TenantResource('team')
  removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.teamsService.removeMember(id, userId);
  }
}
