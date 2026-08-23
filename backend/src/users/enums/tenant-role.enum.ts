/**
 * Roles disponibles dentro de un tenant.
 *
 * Jerarquía (de mayor a menor privilegio):
 *   owner > admin > agent > viewer
 *
 * - owner:  Propietario de la cuenta. Gestión de billing, eliminar tenant, transferir propiedad.
 * - admin:  Gestión completa del tenant (canales, bots, campañas, equipos, invitaciones).
 * - agent:  Operador del día a día. Envía mensajes, gestiona records asignados.
 * - viewer: Solo lectura. Consulta métricas y datos sin modificar nada.
 */
export enum TenantRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  AGENT = 'agent',
  VIEWER = 'viewer',
}

/**
 * Roles que tienen permisos de administración (owner + admin).
 * Útil para guards y validaciones rápidas.
 */
export const ADMIN_ROLES: TenantRole[] = [TenantRole.OWNER, TenantRole.ADMIN];

/**
 * Verifica si un rol tiene permisos de administración.
 */
export function isAdminRole(role: string | undefined | null): boolean {
  return role === TenantRole.OWNER || role === TenantRole.ADMIN;
}
