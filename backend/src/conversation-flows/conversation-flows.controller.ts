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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { ConversationFlowsService } from './conversation-flows.service';
import { FlowLinksService } from './flow-links.service';
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
  constructor(
    private readonly flows: ConversationFlowsService,
    private readonly links: FlowLinksService,
  ) {}

  @Get()
  findAll(@Query('tenantId') tenantId: string) {
    return this.flows.findAll(tenantId);
  }

  /**
   * Capacidades del servidor que el editor necesita saber. Declarada antes de
   * `:id` para que no se interprete como un id.
   */
  @Get('capabilities')
  capabilities() {
    return { linkTracking: this.links.trackingAvailable() };
  }

  /** Variables disponibles para `{{...}}` en el editor (CRM, personalizados y del flujo). */
  @Get('variables')
  variables(@Query('tenantId') tenantId: string) {
    return this.flows.getVariableCatalog(tenantId);
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

  /**
   * Sube el archivo del encabezado multimedia de un nodo Mensaje.
   * tenantId va en la query: los guards se ejecutan antes de que el
   * interceptor procese el multipart, así que el body aún no existe.
   */
  @Post('upload-media')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 64 * 1024 * 1024 } }),
  )
  uploadMedia(
    @Query('tenantId') tenantId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.flows.uploadHeaderMedia(tenantId, file);
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
