import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { EmailDomainService } from './email-domain.service';

@Controller('email-config')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
export class EmailDomainController {
  constructor(private readonly emailDomainService: EmailDomainService) {}

  /** Obtener config de email por inbox */
  @Get('inbox/:inboxId')
  getByInbox(@Param('inboxId') inboxId: string) {
    return this.emailDomainService.findByInbox(inboxId);
  }

  /** Crear o actualizar config de email para un inbox */
  @Post('inbox/:inboxId')
  upsertConfig(
    @Param('inboxId') inboxId: string,
    @Body() body: { tenantId: string; fromEmail: string; fromName: string },
  ) {
    return this.emailDomainService.upsert(inboxId, body.tenantId, body);
  }

  /** Obtener registros DNS que debe configurar */
  @Get('inbox/:inboxId/dns-records')
  async getDnsRecords(@Param('inboxId') inboxId: string) {
    const config = await this.emailDomainService.findByInbox(inboxId);
    if (!config) return { records: [], domain: null };
    return {
      domain: config.domain,
      records: this.emailDomainService.getDnsRecords(config.domain),
    };
  }

  /** Verificar registros DNS */
  @Post('inbox/:inboxId/verify')
  verifyDomain(@Param('inboxId') inboxId: string) {
    return this.emailDomainService.verifyDomain(inboxId);
  }
}
