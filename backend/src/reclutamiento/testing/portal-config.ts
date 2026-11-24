import { DataSource } from 'typeorm';
import { TenantAuditService } from '../../audit/tenant-audit.service';
import { Inbox } from '../../chats/inbox.entity';
import { CustomField } from '../../records/custom-field.entity';
import { PortalConfigRow } from '../entities/portal-config.entity';
import { PortalConfigService } from '../portal/portal-config.service';

/** PortalConfigService real sobre la base de pruebas, sin WhatsApp ni almacenamiento de medios. */
export function makePortalConfig(ds: DataSource, audit: TenantAuditService): PortalConfigService {
  return new PortalConfigService(ds.getRepository(PortalConfigRow), ds.getRepository(CustomField), ds.getRepository(Inbox), {} as any, audit, {} as any);
}
