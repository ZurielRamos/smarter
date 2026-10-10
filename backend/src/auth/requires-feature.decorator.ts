import { SetMetadata } from '@nestjs/common';

export const REQUIRES_FEATURE_KEY = 'requiresFeature';

/**
 * Marca un endpoint/controlador como dependiente de un feature flag del tenant.
 * Usar junto con ModuleFeatureGuard.
 *
 * @example
 * @RequiresFeature('projects')
 */
export const RequiresFeature = (feature: 'companies' | 'projects') =>
  SetMetadata(REQUIRES_FEATURE_KEY, feature);
