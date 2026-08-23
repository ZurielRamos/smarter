import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /** Get all audit logs (global view) */
  @Get()
  findAll(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('targetType') targetType?: string,
  ) {
    return this.auditService.findAll({
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      targetType,
    });
  }

  /** Get audit logs for a specific target (e.g. tenant) */
  @Get('target/:targetId')
  findByTarget(
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.auditService.findByTarget(targetId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }
}
