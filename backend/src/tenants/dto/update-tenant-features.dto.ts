export class UpdateTenantFeaturesDto {
  /** Activa/desactiva el módulo de Empresas */
  companies?: boolean;
  /** Activa/desactiva el módulo de Proyectos */
  projects?: boolean;
  /** Ciclo de estados de proyecto configurable para el tenant */
  projectStatuses?: string[];
  /** Activa/desactiva el módulo de Comunicaciones (chat, campañas, canales) */
  comunicaciones?: boolean;
  /** Activa/desactiva el módulo de Encuestas */
  encuestas?: boolean;
  /** Activa/desactiva el módulo de Cursos (academy / campañas con ranking) */
  cursos?: boolean;
  /** Activa/desactiva el módulo de Automatizaciones (canvas de flujos e integraciones) */
  automatizaciones?: boolean;
}
