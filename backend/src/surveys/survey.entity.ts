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
import { Tenant } from '../tenants/tenant.entity';
import { Inbox } from '../chats/inbox.entity';

/**
 * Encuesta local del tenant.
 *
 * Se crea y edita localmente (sin depender de WhatsApp). El cuerpo de la
 * encuesta se guarda en `flowJson` con el MISMO formato que un WhatsApp Flow de
 * Meta (version, data_api_version, routing_model, screens con layout/Form/
 * componentes y campos condicionales If). Esto permite dos modos de uso:
 *   1) Enlace público web: se renderiza el flowJson como formulario.
 *   2) Convertirse en Flow de Meta: se publica el mismo flowJson en WhatsApp.
 *
 * Los vínculos con WhatsApp (metaFlowId, inboxId) son OPCIONALES y solo se
 * rellenan cuando la encuesta se publica como Flow de Meta.
 */
@Entity('surveys')
@Index(['tenantId'])
@Index(['slug'], { unique: true })
@Index(['metaFlowId'])
export class Survey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  // Nombre interno (identifica la encuesta en la lista; también se usa como
  // nombre del Flow en Meta).
  @Column({ type: 'varchar', length: 200 })
  name: string;

  // Título mostrado al encuestado en el enlace público (si está vacío, se usa
  // `name`). Separado del nombre interno para poder presentarlo con libertad.
  @Column({ name: 'display_title', type: 'varchar', length: 200, nullable: true })
  displayTitle: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // URL pública del logo/imagen que se muestra en el header del enlace público.
  @Column({ name: 'logo_url', type: 'varchar', nullable: true })
  logoUrl: string | null;

  /**
   * Tema de colores del formulario público (enlace web). No afecta a WhatsApp.
   *   - primary: color de botones y acentos.
   *   - background: fondo de la página.
   */
  @Column({ type: 'jsonb', nullable: true })
  theme: { primary?: string; background?: string } | null;

  /**
   * Enlaces por agente: mapa token -> userId. Cada agente obtiene un token
   * opaco para esta encuesta; al responder por su enlace (/s/:slug?a=token),
   * la respuesta se atribuye a ese agente. No expone el userId en la URL.
   */
  @Column({ name: 'agent_tokens', type: 'jsonb', nullable: true })
  agentTokens: Record<string, string> | null;

  /**
   * Si true, el enlace público pide la ubicación del encuestado al responder.
   * Es EXCLUSIVO del canal web: solo puede activarse si la encuesta NO está
   * publicada en WhatsApp, y mientras esté activo no se puede publicar en
   * WhatsApp (Meta Flows no soporta captura de geolocalización).
   */
  @Column({ name: 'require_location', type: 'boolean', default: false })
  requireLocation: boolean;

  /**
   * Usuario que GESTIONA la encuesta (owner). Atribución a nivel de toda la
   * encuesta: "esta encuesta la gestiona el agente X". Es independiente de la
   * atribución por respuesta. Se setea al crear con el usuario actual.
   */
  @Column({ name: 'managed_by_user_id', type: 'uuid', nullable: true })
  managedByUserId: string | null;

  // draft | active | archived
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: string;

  // Slug público para el enlace web (/s/:slug). Se genera al activar.
  @Column({ type: 'varchar', length: 100, nullable: true })
  slug: string | null;

  // Cuerpo de la encuesta en formato Meta Flow JSON (100% compatible).
  @Column({ name: 'flow_json', type: 'jsonb', nullable: true })
  flowJson: Record<string, any> | null;

  // Nº de respuestas recibidas (web + WhatsApp), para listados rápidos.
  @Column({ name: 'response_count', type: 'integer', default: 0 })
  responseCount: number;

  // ---- Vínculo OPCIONAL con WhatsApp (solo si se publica como Flow de Meta) ----

  // ID del Flow en Meta una vez publicada como Flow de WhatsApp. Null = local.
  @Column({ name: 'meta_flow_id', type: 'varchar', nullable: true })
  metaFlowId: string | null;

  /**
   * Estado de sincronización con Meta:
   *   - null: la encuesta no está vinculada a Meta (solo local).
   *   - 'synced': el flow.json local coincide con el publicado en Meta.
   *   - 'out_of_sync': se guardó local pero Meta rechazó/falló la última subida.
   */
  @Column({ name: 'meta_sync_status', type: 'varchar', length: 20, nullable: true })
  metaSyncStatus: 'synced' | 'out_of_sync' | null;

  // Últimos errores que devolvió Meta al intentar sincronizar (para mostrarlos
  // sin tener que revalidar). Se limpia cuando la sincronización tiene éxito.
  @Column({ name: 'meta_sync_errors', type: 'jsonb', nullable: true })
  metaSyncErrors: Array<{ code?: string; type?: string; message: string; pointer?: string }> | null;

  // Inbox de WhatsApp con el que se publicó en Meta (si aplica).
  @Column({ name: 'inbox_id', type: 'uuid', nullable: true })
  inboxId: string | null;

  @ManyToOne(() => Inbox, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'inbox_id' })
  inbox: Inbox | null;

  /**
   * Mapeo de campos de la encuesta hacia el CRM (atribución a contacto).
   *   - fields: { [nombreCampoEncuesta]: campoCRM }  (campoCRM = fieldKey del
   *     CRM; si es columna de ClientRecord se escribe ahí, si no, en custom_data).
   *   - matchRules: regla para reconocer un contacto existente:
   *       { logic: 'and' | 'or', fields: [nombresCampoEncuesta] }
   *     AND = deben coincidir todos; OR = basta con uno. Si no hay match se
   *     crea un contacto nuevo. Lista vacía = no atribuir / siempre crear.
   *   - matchField: LEGADO (un solo campo). Se sigue leyendo por compatibilidad.
   */
  @Column({ name: 'crm_mapping', type: 'jsonb', nullable: true })
  crmMapping: {
    fields?: Record<string, string>;
    matchRules?: { logic: 'and' | 'or'; fields: string[] };
    matchField?: string | null;
  } | null;

  // Metadata libre (notas, autor, color, etc.).
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
