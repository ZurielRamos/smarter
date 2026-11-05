import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // === IDENTIDAD ===
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  slug: string;

  @Column({ name: 'icon_path', type: 'varchar', nullable: true })
  iconPath: string;

  // === ESTADO ===
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_dev', type: 'boolean', default: false })
  isDev: boolean;

  @Column({ name: 'max_agents', type: 'int', default: 5 })
  maxAgents: number;

  // === CONFIGURACIÓN ===
  @Column({ name: 'table_config', type: 'jsonb', nullable: true })
  tableConfig: Record<string, any> | null;

  /**
   * Feature flags por tenant. Default (ausente) = módulo apagado.
   * Permite activar módulos opcionales del CRM sin afectar a tenants existentes.
   */
  @Column({ name: 'features', type: 'jsonb', nullable: true })
  features: {
    /** Módulo Empresas */
    companies?: boolean;
    /** Módulo Proyectos */
    projects?: boolean;
    /** Ciclo de estados de proyecto configurable; si no se define, se usa el default del servicio */
    projectStatuses?: string[];
    /** Módulo Comunicaciones (chat, campañas, canales) */
    comunicaciones?: boolean;
    /** Módulo Encuestas */
    encuestas?: boolean;
    /** Módulo Cursos (academy / campañas con ranking) */
    cursos?: boolean;
  } | null;

  /**
   * Configuración del portal público de Academy (verificación de acceso y
   * campos de inscripción al CRM). Vive a nivel tenant porque el portal es el
   * único punto de entrada a todos los cursos.
   */
  @Column({ name: 'academy_config', type: 'jsonb', nullable: true })
  academyConfig: {
    /** Canal de verificación del portal: email | phone | both. */
    verificationChannel?: 'email' | 'phone' | 'both';
    /** Plantilla de email (texto) para el código. {{code}} = código. */
    emailTemplate?: { subject?: string; body?: string };
    /** Inbox de WhatsApp conectado para enviar el código. */
    whatsappInboxId?: string;
    /** Plantilla de WhatsApp (Meta) para el código. */
    whatsappTemplateName?: string;
    whatsappLanguage?: string;
    /** Posición de la variable del cuerpo donde va el código (p. ej. "1"). */
    whatsappCodeVariable?: string;
    /**
     * Apariencia del portal público (colores y estilos). Si no se define, el
     * portal usa los valores por defecto.
     */
    theme?: {
      /** Color principal (cabecera, acentos, botones). */
      primary?: string;
      /** Color del texto sobre el color principal. */
      onPrimary?: string;
      /** Color de fondo del portal. */
      background?: string;
      /** Radio de las esquinas: 'sm' | 'md' | 'lg' | 'xl'. */
      radius?: string;
      /** Nombre a mostrar en la cabecera del portal (por defecto el del tenant). */
      headerTitle?: string;
      /** Subtítulo/eslogan opcional bajo el título. */
      headerSubtitle?: string;
      /** URL de un logo opcional para la cabecera. */
      logoUrl?: string;
      /** Altura del logo en la cabecera, en píxeles (p. ej. 24–80). */
      logoSize?: number;
      /** Espacio vertical (padding arriba/abajo) de la cabecera, en píxeles. */
      headerPaddingY?: number;
      /**
       * Mostrar los textos de la cabecera (título + subtítulo) junto al logo.
       * Por defecto true; si hay logo quizá se prefiera ocultarlos.
       */
      showHeaderText?: boolean;
    };
    /**
     * Metadatos para compartir el portal en redes sociales (Open Graph /
     * Twitter Card). No afectan SEO/posicionamiento; controlan cómo se ve el
     * enlace al pegarlo en WhatsApp, Facebook, LinkedIn, X, etc.
     */
    meta?: {
      /** Título de la tarjeta al compartir (og:title). */
      title?: string;
      /** Descripción breve (og:description). */
      description?: string;
      /** URL de la imagen de previsualización (og:image). Recomendado 1200×630. */
      ogImage?: string;
    };
    /** Campos a pedir para crear el contacto si no existe en el CRM. */
    enrollmentFields?: Array<{
      key: string;
      label: string;
      crmField: string;
      type?: string;
      required?: boolean;
      options?: string[];
    }>;
  } | null;

  /** Tracking configuration for ad attribution */
  @Column({ name: 'tracking_config', type: 'jsonb', nullable: true })
  trackingConfig: {
    /** Pattern for the tracking code appended to WhatsApp messages. Use {{code}} as placeholder. E.g. "ref-{{code}}", "ticket: {{code}}" */
    codePattern?: string;
    /** Next sequential code number */
    nextCode?: number;
    /** Public token for pixel validation */
    pixelToken?: string;
    /** Last time the pixel sent a ping */
    lastPingAt?: string;
    /** Origin/referer of the last ping */
    lastPingOrigin?: string;
  } | null;

  // === AUDITORÍA ===
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
