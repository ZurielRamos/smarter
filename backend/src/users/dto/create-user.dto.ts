import { TenantRole } from '../enums/tenant-role.enum';

export class CreateUserDto {
  name: string;
  email: string;
  password: string;
  isSuperAdmin?: boolean;
  tenantRoles?: { tenantId: string; role: TenantRole }[];
}
