import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenants/tenant.entity';

export interface CoursePrize {
  /** Posición del ranking que obtiene este premio (1 = primer lugar). */
  rank: number;
  label: string;
  description?: string;
  imageUrl?: string;
}

export interface CourseRankingConfig {
  /**
   * Métrica usada para ordenar el ranking:
   *  - weighted_score: puntaje ponderado por el peso de cada quiz en el curso (default).
   *  - total_score: suma simple de puntos.
   *  - accuracy: % de aciertos.
   *  - completion_time: menor tiempo total (ascendente).
   */
  metric?: 'weighted_score' | 'total_score' | 'accuracy' | 'completion_time';
  /** Criterio de desempate (default: completion_time). */
  tieBreaker?: 'completion_time' | 'fewest_attempts' | 'earliest_finish';
  /** Premios por posición. */
  prizes?: CoursePrize[];
  /** Si true, el leaderboard es visible en el enlace público del participante. */
  publishLeaderboard?: boolean;
}

export interface CourseVerificationConfig {
  /** Activa la verificación OTP. Si false, el participante entra sin verificar. */
  enabled?: boolean;
  /**
   * Canal(es) permitidos para verificar:
   *  - email: solo correo
   *  - phone: solo WhatsApp
   *  - both: el participante elige
   */
  channel?: 'email' | 'phone' | 'both';
  /** Plantilla de email (texto simple) definida en este mismo flujo. {{code}} = código. */
  emailTemplate?: { subject?: string; body?: string };
  /** Inbox de WhatsApp conectado desde el que se envía el OTP. */
  whatsappInboxId?: string;
  /** Nombre de la plantilla de WhatsApp (Meta) a usar para el OTP. */
  whatsappTemplateName?: string;
  /** Idioma de la plantilla de WhatsApp. */
  whatsappLanguage?: string;
  /** Posición de la variable del cuerpo donde va el código (p. ej. "1"). */
  whatsappCodeVariable?: string;
}

/**
 * Configuración completa del certificado de finalización. Cuando `enabled` es
 * true, el certificado se emite al aprobar el curso y se renderiza con estos
 * valores. Al emitir, se guarda un snapshot de esta config en el propio
 * certificado para que no cambie si luego se edita el curso.
 */
/**
 * Elemento gráfico posicionable del certificado (logo, firma o sello).
 * Coordenadas en porcentaje del lienzo A4 (0-100), referidas al CENTRO del
 * elemento. `size` es el ancho en % del ancho del lienzo. `visible` permite
 * ocultarlo sin perder su configuración.
 */
export interface CertificateAsset {
  url?: string;
  /** Posición X del centro (0 = izquierda, 100 = derecha). */
  x?: number;
  /** Posición Y del centro (0 = arriba, 100 = abajo). */
  y?: number;
  /** Ancho en % del ancho del lienzo. */
  size?: number;
  visible?: boolean;
}

export interface CourseCertificateConfig {
  /** Activa la emisión/visualización del certificado para este curso. */
  enabled?: boolean;
  /** Título principal (ej: "Certificado de finalización"). */
  title?: string;
  /** Texto que antecede al nombre del participante. */
  introText?: string;
  /** Texto que antecede al nombre del curso. */
  bodyText?: string;
  /** Mensaje adicional opcional (al pie, antes de la firma). */
  footerText?: string;
  /** Nombre de quien firma (ej: director del programa). */
  signatureName?: string;
  /** Cargo de quien firma. */
  signatureTitle?: string;
  /** Color de acento del certificado (hex). Si se omite, usa el tema del portal. */
  accentColor?: string;
  /**
   * Logo de la empresa (archivo subido) con tamaño y posición libres.
   * `logoUrl` (legacy) se mantiene por compatibilidad; si `logo.url` existe,
   * tiene prioridad.
   */
  logo?: CertificateAsset;
  /** Firma (archivo subido) con tamaño y posición libres. */
  signature?: CertificateAsset;
  /** Sello (archivo subido) con tamaño y posición libres. */
  stamp?: CertificateAsset;
  /** @deprecated Usa `logo.url`. */
  logoUrl?: string;
  /** @deprecated Usa `signature.url`. */
  signatureImageUrl?: string;
  /** Mostrar la calificación obtenida. */
  showScore?: boolean;
  /** Mostrar la posición en el ranking. */
  showRank?: boolean;
  /** Mostrar el folio de verificación. */
  showSerial?: boolean;
}

export interface CourseEnrollmentField {
  /** Clave interna del campo en el formulario del participante. */
  key: string;
  /** Etiqueta mostrada al participante. */
  label: string;
  /** Campo del CRM al que se mapea (fieldKey: columna de ClientRecord o custom_data). */
  crmField: string;
  type?: 'text' | 'email' | 'phone' | 'number' | 'date' | 'select';
  required?: boolean;
  options?: string[];
}

export interface CourseSettings {
  /** Umbral de aprobación del curso completo (0-100). */
  passingScore?: number;
  /** Nivel del curso: básico | medio | avanzado | experto. */
  level?: 'basic' | 'intermediate' | 'advanced' | 'expert';
  /** Obliga a completar las clases en orden. */
  requireSequential?: boolean;
  /** Reintentos máximos por pregunta (default por quiz si no se define). */
  maxAttemptsPerQuestion?: number;
  /** Permite revisar respuestas tras enviar. */
  allowReviewAfterSubmit?: boolean;
  /** Baraja preguntas por defecto. */
  shuffleQuestions?: boolean;
  /** Configuración del certificado de finalización del curso. */
  certificate?: CourseCertificateConfig;
  /** Momento en que se piden los datos del participante. */
  collectDataAt?: 'start' | 'end';
  /**
   * Si true (default), el enlace genérico /c/:slug permite que cualquiera se
   * auto-inscriba (se crea una inscripción al vuelo). Si false, solo se puede
   * acceder con un enlace personal que incluya token (?t=...).
   */
  allowOpenEnrollment?: boolean;

  /**
   * Verificación por código (OTP) antes de inscribir. El participante ingresa
   * su email o teléfono, recibe un código, y al validarlo se busca su contacto
   * en el CRM (atribuir si existe, o pedir datos y crear si no existe).
   */
  verification?: CourseVerificationConfig;

  /**
   * Campos que se piden al participante cuando NO existe en el CRM, para crear
   * el contacto. Cada uno se mapea a un campo del CRM (columna o custom_data).
   */
  enrollmentFields?: CourseEnrollmentField[];
  /** Ventana de disponibilidad (ISO date strings). */
  availableFrom?: string | null;
  availableUntil?: string | null;
}

/**
 * Curso del tenant. Orientado a campañas con ranking y premios: agrupa clases
 * (con material + preguntas) y un examen final. Los participantes son contactos
 * del CRM (ClientRecord) que acceden por un enlace público con token, sin login.
 */
@Entity('courses')
@Index(['tenantId'])
@Index(['tenantId', 'status'])
@Index(['slug'], { unique: true, where: 'slug IS NOT NULL' })
@Index(['campaignId'])
export class Course {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Imagen de portada (URL en R2 o externa). */
  @Column({ name: 'cover_url', type: 'varchar', nullable: true })
  coverUrl: string | null;

  // draft | active | archived
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: string;

  /** Slug público para el enlace del participante (/c/:slug). Se genera al activar. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  slug: string | null;

  /** Campaña asociada (para sembrar participantes y rankings). Opcional. */
  @Column({ name: 'campaign_id', type: 'uuid', nullable: true })
  campaignId: string | null;

  /** Configuración de ranking y premios. */
  @Column({ name: 'ranking_config', type: 'jsonb', nullable: true })
  rankingConfig: CourseRankingConfig | null;

  /** Reglas globales del curso (aprobación, secuencialidad, certificado, ventana). */
  @Column({ type: 'jsonb', nullable: true })
  settings: CourseSettings | null;

  /**
   * Mapeo de los datos del participante hacia el CRM. Mismo contrato que las
   * encuestas: fields (campoParticipante -> fieldKey del CRM) y matchRules para
   * deduplicar contactos existentes.
   */
  @Column({ name: 'crm_mapping', type: 'jsonb', nullable: true })
  crmMapping: {
    fields?: Record<string, string>;
    matchRules?: { logic: 'and' | 'or'; fields: string[] };
  } | null;

  /** Tema de colores del enlace público. */
  @Column({ type: 'jsonb', nullable: true })
  theme: { primary?: string; background?: string } | null;

  /** Nº de inscripciones (denormalizado para listados). */
  @Column({ name: 'enrollment_count', type: 'integer', default: 0 })
  enrollmentCount: number;

  /** Usuario que gestiona el curso (owner). */
  @Column({ name: 'managed_by_user_id', type: 'uuid', nullable: true })
  managedByUserId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
