import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignTenantDto } from './dto/assign-tenant.dto';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';

@Controller('users')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get('stats')
  getStats() {
    return this.usersService.getStats();
  }

  @Get('check-email/:email')
  checkEmail(@Param('email') email: string) {
    return this.usersService.checkEmailAvailability(email);
  }

  @Get('find-by-email/:email')
  findByEmail(@Param('email') email: string) {
    return this.usersService.findByEmail(email);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  // === Tenant role management ===

  @Get(':id/tenants')
  getUserTenants(@Param('id') id: string) {
    return this.usersService.getUserTenants(id);
  }

  @Post(':id/tenants')
  assignTenant(@Param('id') id: string, @Body() dto: AssignTenantDto) {
    return this.usersService.assignTenant(id, dto);
  }

  @Delete(':id/tenants/:tenantId')
  removeTenantRole(
    @Param('id') id: string,
    @Param('tenantId') tenantId: string,
  ) {
    return this.usersService.removeTenantRole(id, tenantId);
  }
}
