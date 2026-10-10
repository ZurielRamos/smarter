export class UpdateTenantFeaturesDto {
  /** Activa/desactiva el módulo de Empresas */
  companies?: boolean;
  /** Activa/desactiva el módulo de Proyectos */
  projects?: boolean;
  /** Ciclo de estados de proyecto configurable para el tenant */
  projectStatuses?: string[];
}
