import { TenantRole } from '../enums/tenant-role.enum';

export class AssignTenantDto {
  tenantId: string;
  role: TenantRole;
}
