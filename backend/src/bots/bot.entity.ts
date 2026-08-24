import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

// === Flow Step Types ===

export interface FlowStepValidation {
  pattern?: string;          // regex for validation
  options?: string[];        // valid options (for select type)
  min?: number;
  max?: number;
  errorMessage: string;      // message to send when validation fails
}

export interface FlowStepWebhook {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
}

export interface FlowConsentConfig {
  legalText: string;            // texto legal / autorización que se muestra
  termsUrl?: string;            // enlace a términos y condiciones
  acceptKeywords?: string[];    // palabras que indican aceptación (default: ["si", "acepto", "autorizo"])
  rejectKeywords?: string[];    // palabras que indican rechazo (default: ["no", "rechazo"])
  rejectAction?: 'handoff' | 'end'; // qué hacer si rechaza
  rejectMessage?: string;       // mensaje al rechazar
  consentType?: 'data_collection' | 'age_verification' | 'terms' | 'custom'; // tipo de consentimiento
}

export interface FlowStep {
  id: string;
  order: number;
  field: string;               // target CRM field (firstName, custom:cedula, etc.)
  question: string;            // exact message to send
  type: 'text' | 'number' | 'email' | 'phone' | 'date' | 'select' | 'regex' | 'boolean' | 'consent';
  validation?: FlowStepValidation;
  consent?: FlowConsentConfig; // config for consent-type steps
  aiInterpretation?: boolean;  // use AI to parse free-form response into structured data
  skipIf?: string;             // condition to skip this step (e.g. "collectedData.phone")
  retries?: number;            // max retries before escalating (default 2)
  required?: boolean;          // whether this step is mandatory (default true)
  onCollected?: FlowStepWebhook; // webhook to fire after this step's data is validated
}

export interface FlowConfig {
  completionMessage?: string;     // message sent when all steps are completed
  completionAction?: 'handoff' | 'resolve' | 'none'; // what to do after completion
  useAiForGreeting?: boolean;     // use AI model for initial greeting (otherwise send welcomeMessage)
  allowSkip?: boolean;            // allow user to skip non-required steps
  skipKeyword?: string;           // keyword to skip (default: "omitir")
  maxGlobalRetries?: number;      // max total retries across all steps before handoff
  offTopicBehavior?: 'ignore' | 'ai_respond' | 'redirect'; // what to do with off-topic messages
  offTopicMessage?: string;       // message to show when redirecting back to the flow
  onCompletionWebhook?: FlowStepWebhook; // webhook to fire when the entire flow completes
}

export interface BotConsentConfig {
  enabled: boolean;
  message: string;                    // consent message sent to user
  termsUrl?: string;                  // link to terms & conditions
  ageVerification?: boolean;          // require age declaration
  ageMessage?: string;                // custom age verification message
  acceptKeywords?: string[];          // words that mean acceptance
  rejectKeywords?: string[];          // words that mean rejection
  rejectMessage?: string;             // message on rejection
  rejectAction?: 'end' | 'handoff';  // what to do on rejection
}

export interface BotFlowState {
  currentStepIndex: number;
  completedSteps: string[];       // IDs of completed steps
  collectedData: Record<string, string>;
  retryCount: number;
  globalRetryCount: number;
  startedAt: string;
  lastStepAt: string;
}

@Entity('bots')
@Index(['tenantId'])
export class Bot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: string; // draft, active, inactive

  // === Bot Type ===

  @Column({ type: 'varchar', length: 20, default: 'freeform' })
  type: string; // freeform, sequential, hybrid

  // === Identity ===

  @Column({ type: 'varchar', length: 255, nullable: true })
  persona: string | null; // "Laura", "Carlos", etc.

  @Column({ type: 'varchar', length: 50, nullable: true })
  role: string | null; // soporte, ventas, recepcionista, agendamiento, custom

  @Column({ type: 'text', nullable: true })
  objective: string | null; // what the bot should accomplish

  @Column({ type: 'jsonb', nullable: true, default: '[]' })
  tone: string[]; // ["formal", "amigable", "tecnico"]

  @Column({ type: 'varchar', length: 10, default: 'es' })
  language: string;

  // === Instructions ===

  @Column({ type: 'jsonb', nullable: true, default: '[]' })
  rules: string[]; // list of rules

  // === Knowledge ===

  @Column({ name: 'business_context', type: 'text', nullable: true })
  businessContext: string | null;

  // === Behavior ===

  @Column({ name: 'welcome_message', type: 'text', nullable: true })
  welcomeMessage: string | null;

  @Column({ name: 'fallback_message', type: 'text', nullable: true })
  fallbackMessage: string | null;

  // === AI Configuration ===

  @Column({ name: 'system_prompt', type: 'text', nullable: true })
  systemPrompt: string | null; // advanced: manual override

  @Column({ type: 'varchar', length: 100, nullable: true })
  model: string | null;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.7 })
  temperature: number;

  @Column({ name: 'max_tokens', type: 'int', default: 1024 })
  maxTokens: number;

  @Column({ name: 'reply_delay', type: 'int', default: 4 })
  replyDelay: number; // seconds to wait before responding (debounce)

  @Column({ name: 'context_messages', type: 'int', default: 20 })
  contextMessages: number; // how many recent messages to send as context

  // === Conversation Control ===

  @Column({ name: 'max_bot_messages', type: 'int', default: 0 })
  maxBotMessages: number; // 0 = unlimited

  @Column({ name: 'handoff_keywords', type: 'jsonb', nullable: true, default: '[]' })
  handoffKeywords: string[];

  @Column({ name: 'handoff_message', type: 'text', nullable: true })
  handoffMessage: string | null;

  // Actions to execute when bot marks conversation as resolved
  @Column({ name: 'on_resolved_actions', type: 'jsonb', nullable: true })
  onResolvedActions: { changeStatus?: string; addTags?: string[]; assignTeamId?: string } | null;

  // Schedule: when the bot is active
  @Column({ type: 'jsonb', nullable: true })
  schedule: { enabled: boolean; timezone: string; days: Record<string, { active: boolean; start: string; end: string }>; offMessage: string } | null;

  // Rate limit per contact
  @Column({ name: 'rate_limit', type: 'jsonb', nullable: true })
  rateLimit: { maxMessages: number; windowMinutes: number; limitMessage: string } | null;

  // === Usage tracking ===

  @Column({ name: 'total_prompt_tokens', type: 'int', default: 0 })
  totalPromptTokens: number;

  @Column({ name: 'total_completion_tokens', type: 'int', default: 0 })
  totalCompletionTokens: number;

  @Column({ name: 'total_requests', type: 'int', default: 0 })
  totalRequests: number;

  // === Media Handling ===

  @Column({ name: 'media_handling', type: 'jsonb', nullable: true })
  mediaHandling: {
    image: 'ignore' | 'acknowledge' | 'describe' | 'forward';
    audio: 'ignore' | 'acknowledge' | 'transcribe' | 'forward';
    document: 'ignore' | 'acknowledge' | 'forward';
    acknowledgeMessage?: string;
    forwardMessage?: string;
  } | null;

  // === Data Collection ===

  @Column({ name: 'data_collection_enabled', type: 'boolean', default: false })
  dataCollectionEnabled: boolean;

  @Column({ name: 'data_collection_mode', type: 'varchar', length: 10, default: 'passive' })
  dataCollectionMode: string; // '1' to '5' intensity level

  @Column({ name: 'data_collection_fields', type: 'jsonb', nullable: true, default: '[]' })
  dataCollectionFields: { field: string; label: string; instructions: string; priority: number }[];

  // === Consent Gate ===

  @Column({ name: 'consent_config', type: 'jsonb', nullable: true })
  consentConfig: BotConsentConfig | null;

  // === Sequential Flow ===

  @Column({ name: 'flow_steps', type: 'jsonb', nullable: true, default: '[]' })
  flowSteps: FlowStep[];

  @Column({ name: 'flow_config', type: 'jsonb', nullable: true })
  flowConfig: FlowConfig | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
