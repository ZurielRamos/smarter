import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type {
  AutomationEdge,
  AutomationNode,
  AutomationSettings,
} from '../automation.entity';
import type { ConnectionType } from '../automation-connection.entity';

export class CreateAutomationDto {
  @IsUUID()
  tenantId: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class UpdateAutomationDto {
  @IsUUID()
  tenantId: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsIn(['draft', 'active', 'inactive'])
  status?: string;

  @IsOptional()
  @IsArray()
  nodes?: AutomationNode[];

  @IsOptional()
  @IsArray()
  edges?: AutomationEdge[];

  @IsOptional()
  @IsObject()
  settings?: AutomationSettings | null;
}

export class RunAutomationDto {
  @IsUUID()
  tenantId: string;

  /** Datos de prueba que se inyectan como `trigger`. */
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}

export class SaveConnectionDto {
  @IsUUID()
  tenantId: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  type?: ConnectionType;

  /** Campos de la conexión; en edición, los vacíos conservan el valor actual. */
  @IsObject()
  data: Record<string, string>;
}
