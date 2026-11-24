import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { ClientRecord } from '../records/record.entity';
import { Organization } from './entities/organization.entity';
import { ContactOrganization } from './entities/contact-organization.entity';
import { CompaniesService } from './companies.service';
import { CompaniesBulkService } from './companies-bulk.service';
import { CompaniesImportService } from './companies-import.service';
import { CompaniesImportController } from './companies-import.controller';
import { EtlModule } from '../etl/etl.module';
import { ImportJob } from '../etl/entities/import-job.entity';
import { ImportError } from '../etl/entities/import-error.entity';
import { CompaniesController } from './companies.controller';

/**
 * Módulo Empresas: cadenas, sucursales y establecimientos de una cuenta, y su
 * vínculo con contactos del CRM. Requiere el feature flag `companies`.
 *
 * Tenant: lo necesita ModuleFeatureGuard. TenantAuditService viene del
 * AuditModule (global).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Organization, ContactOrganization, ClientRecord, Tenant, ImportJob, ImportError]), EtlModule],
  controllers: [CompaniesController, CompaniesImportController],
  providers: [CompaniesService, CompaniesBulkService, CompaniesImportService],
})
export class CompaniesModule {}
