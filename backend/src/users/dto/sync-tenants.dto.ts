import { TenantRole } from '../enums/tenant-role.enum';

export class SyncTenantRoleDto {
  tenantId: string;
  role: TenantRole;
}

/**
 * Sincroniza (reconcilia) el conjunto completo de cuentas de un usuario en una
 * sola operación atómica. La lista enviada representa el estado final deseado:
 * las cuentas que no estén en la lista se desvinculan y las presentes se
 * crean/reactivan con su rol.
 */
export class SyncTenantsDto {
  roles: SyncTenantRoleDto[];
}
