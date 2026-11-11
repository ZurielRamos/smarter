import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { ConversationFlowsService } from './conversation-flows.service';
import {
  CreateConversationFlowDto,
  UpdateConversationFlowDto,
} from './dto/conversation-flow.dto';

/**
 * CRUD de flujos conversacionales (submódulo Comunicaciones → Flujos).
 * Todas las rutas exigen tenantId (query o body) para que TenantAccessGuard
 * valide el acceso y el servicio filtre por tenant.
 */
@Controller('conversation-flows')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
export class ConversationFlowsController {
  constructor(private readonly flows: ConversationFlowsService) {}

  @Get()
  findAll(@Query('tenantId') tenantId: string) {
    return this.flows.findAll(tenantId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('tenantId') tenantId: string,
  ) {
    return this.flows.findOne(id, tenantId);
  }

  @Post()
  create(@Body() dto: CreateConversationFlowDto) {
    return this.flows.create(dto);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConversationFlowDto,
  ) {
    return this.flows.update(id, dto);
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('tenantId') tenantId: string,
  ) {
    await this.flows.remove(id, tenantId);
    return { success: true };
  }
}
