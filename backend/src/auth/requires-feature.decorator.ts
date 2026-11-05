import { SetMetadata } from '@nestjs/common';

export const REQUIRES_FEATURE_KEY = 'requiresFeature';

/**
 * Marca un endpoint/controlador como dependiente de un feature flag del tenant.
 * Usar junto con ModuleFeatureGuard.
 *
 * @example
 * @RequiresFeature('projects')
 */
export type TenantFeature = 'companies' | 'projects' | 'cursos';

export const RequiresFeature = (feature: TenantFeature) =>
  SetMetadata(REQUIRES_FEATURE_KEY, feature);
