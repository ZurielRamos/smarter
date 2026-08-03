import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { ProvidersService } from './providers.service';

@Controller('providers')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get('status')
  getStatus() {
    return this.providersService.getStatus();
  }

  @Get()
  findAll() {
    return this.providersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.providersService.findOne(id);
  }

  @Post()
  create(
    @Body()
    body: {
      channel: string;
      provider: string;
      name: string;
      credentials: Record<string, string>;
      isDefault?: boolean;
    },
  ) {
    return this.providersService.create(body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      provider: string;
      credentials: Record<string, string>;
      isDefault: boolean;
      isActive: boolean;
    }>,
  ) {
    return this.providersService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.providersService.remove(id);
  }
}
