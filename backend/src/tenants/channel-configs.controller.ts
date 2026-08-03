import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { ChannelConfigsService } from './channel-configs.service';

@Controller('channel-configs')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
export class ChannelConfigsController {
  constructor(private readonly service: ChannelConfigsService) {}

  @Get()
  findAll(@Query('tenantId') tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(
    @Body()
    body: {
      tenantId: string;
      channel: string;
      provider: string;
      credentials: Record<string, string>;
    },
  ) {
    return this.service.upsert(body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      provider?: string;
      credentials?: Record<string, string>;
      isActive?: boolean;
    },
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
