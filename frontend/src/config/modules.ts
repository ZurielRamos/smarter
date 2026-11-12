import type { TenantFeatures } from "@/context/AuthContext";

/**
 * Catálogo de módulos del tenant. Única fuente de verdad para:
 *  - el header del tenant (qué items mostrar)
 *  - el panel de admin (qué toggles mostrar)
 *
 * `always`: módulo no desactivable (p. ej. Contactos). Siempre visible.
 * `defaultOn`: si el flag no está definido en el tenant, se considera activo.
 *   Se usa para módulos que existían antes de introducir el feature-gating, de
 *   modo que los tenants actuales no pierdan acceso. Los módulos nuevos (Cursos)
 *   son defaultOn=false (apagados hasta activarlos explícitamente).
 */
export interface ModuleDef {
  /** Clave del feature flag en tenant.features. */
  key: keyof TenantFeatures;
  label: string;
  description: string;
  /** Ruta relativa al slug (sin el slash inicial). Vacío = dashboard raíz. */
  path: string;
  always?: boolean;
  defaultOn?: boolean;
}

/** Módulos que aparecen como navegación del tenant, en orden. */
export const TENANT_MODULES: ModuleDef[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    description: "Panel principal con métricas de la cuenta",
    path: "",
    always: true,
  },
  {
    key: "comunicaciones",
    label: "Comunicaciones",
    description: "Conversaciones, campañas, canales, plantillas y bots",
    path: "comunicaciones",
    defaultOn: true,
  },
  {
    key: "contactos",
    label: "Contactos",
    description: "CRM de contactos (siempre activo)",
    path: "clients",
    always: true,
  },
  {
    key: "encuestas",
    label: "Encuestas",
    description: "Encuestas por enlace y WhatsApp",
    path: "encuestas",
    defaultOn: true,
  },
  {
    key: "cursos",
    label: "Cursos",
    description: "Academy: cursos, evaluaciones y ranking de participantes",
    path: "cursos",
    defaultOn: false,
  },
  {
    key: "automatizaciones",
    label: "Automatizaciones",
    description: "Canvas de flujos automatizados con disparadores e integraciones",
    path: "automatizaciones",
    defaultOn: false,
  },
];

/** Módulos administrables (se pueden encender/apagar) para el panel de admin. */
export const MANAGEABLE_MODULES = TENANT_MODULES.filter((m) => !m.always);

/** Determina si un módulo está habilitado según los features del tenant. */
export function isModuleEnabled(
  module: ModuleDef,
  features: TenantFeatures | null | undefined,
): boolean {
  if (module.always) return true;
  const value = features?.[module.key];
  if (value === undefined || value === null) return !!module.defaultOn;
  return !!value;
}
