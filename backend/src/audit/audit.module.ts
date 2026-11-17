import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuditLog } from './admin-audit-log.entity';
import { TenantAuditLog } from './tenant-audit-log.entity';
import { AuditService } from './audit.service';
import { TenantAuditService } from './tenant-audit.service';
import { AuditController } from './audit.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AdminAuditLog, TenantAuditLog])],
  controllers: [AuditController],
  providers: [AuditService, TenantAuditService],
  exports: [AuditService, TenantAuditService],
})
export class AuditModule {}
