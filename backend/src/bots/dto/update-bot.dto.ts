import { IsString, IsOptional, IsArray, MaxLength, IsIn, IsNumber, Min, Max } from 'class-validator';
import { FlowStep, FlowConfig, BotConsentConfig } from '../bot.entity';

export class UpdateBotDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(['draft', 'active', 'inactive'])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(['freeform', 'sequential', 'hybrid'])
  type?: string;

  // Identity
  @IsOptional()
  @IsString()
  @MaxLength(255)
  persona?: string | null;

  @IsOptional()
  @IsString()
  role?: string | null;

  @IsOptional()
  @IsString()
  objective?: string | null;

  @IsOptional()
  @IsArray()
  tone?: string[];

  @IsOptional()
  @IsString()
  language?: string;

  // Instructions
  @IsOptional()
  @IsArray()
  rules?: string[];

  // Knowledge
  @IsOptional()
  @IsString()
  businessContext?: string | null;

  // Behavior
  @IsOptional()
  @IsString()
  welcomeMessage?: string | null;

  @IsOptional()
  @IsString()
  fallbackMessage?: string | null;

  // AI Config
  @IsOptional()
  @IsString()
  systemPrompt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(16384)
  maxTokens?: number;

  // Data Collection
  @IsOptional()
  dataCollectionEnabled?: boolean;

  @IsOptional()
  @IsString()
  dataCollectionMode?: string;

  @IsOptional()
  @IsArray()
  dataCollectionFields?: { field: string; label: string; instructions: string; priority: number }[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(15)
  replyDelay?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  contextMessages?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  maxBotMessages?: number;

  @IsOptional()
  @IsArray()
  handoffKeywords?: string[];

  @IsOptional()
  @IsString()
  handoffMessage?: string | null;

  @IsOptional()
  onResolvedActions?: { changeStatus?: string; addTags?: string[]; assignTeamId?: string } | null;

  @IsOptional()
  schedule?: { enabled: boolean; timezone: string; days: Record<string, { active: boolean; start: string; end: string }>; offMessage: string } | null;

  @IsOptional()
  rateLimit?: { maxMessages: number; windowMinutes: number; limitMessage: string } | null;

  @IsOptional()
  mediaHandling?: {
    image: 'ignore' | 'acknowledge' | 'describe' | 'forward';
    audio: 'ignore' | 'acknowledge' | 'transcribe' | 'forward';
    document: 'ignore' | 'acknowledge' | 'forward';
    acknowledgeMessage?: string;
    forwardMessage?: string;
  } | null;

  // Sequential Flow
  @IsOptional()
  @IsArray()
  flowSteps?: FlowStep[];

  @IsOptional()
  flowConfig?: FlowConfig | null;

  // Consent
  @IsOptional()
  consentConfig?: BotConsentConfig | null;
}
