import { SetMetadata } from '@nestjs/common';

export const REQUIRES_FEATURE_KEY = 'requiresFeature';

/**
 * Marca un endpoint/controlador como dependiente de un feature flag del tenant.
 * Usar junto con ModuleFeatureGuard.
 *
 * @example
 * @RequiresFeature('projects')
 */
export type TenantFeature =
  | 'companies'
  | 'projects'
  | 'cursos'
  | 'automatizaciones'
  | 'reclutamiento'
  | 'encuestas';

/**
 * Módulos que existían antes de introducir el feature-gating: si el flag no
 * está definido en el tenant se consideran ACTIVOS (solo se apagan con
 * `false` explícito). Debe coincidir con `defaultOn` en frontend/src/config/modules.ts.
 */
export const DEFAULT_ON_FEATURES: ReadonlySet<TenantFeature> = new Set<TenantFeature>(['encuestas']);

/** Indica si un feature está activo para un tenant, respetando los valores por defecto. */
export function isFeatureEnabled(
  features: Record<string, unknown> | null | undefined,
  feature: TenantFeature,
): boolean {
  const value = features?.[feature];
  if (value === undefined || value === null) return DEFAULT_ON_FEATURES.has(feature);
  return !!value;
}

export const RequiresFeature = (feature: TenantFeature) =>
  SetMetadata(REQUIRES_FEATURE_KEY, feature);
