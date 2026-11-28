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
  FlowEdge,
  FlowNode,
  FlowTriggers,
} from '../conversation-flow.entity';

export class CreateConversationFlowDto {
  @IsUUID()
  tenantId: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}

/** Prueba de una petición API desde el editor (no guarda nada). */
export class HttpTestDto {
  @IsUUID()
  tenantId: string;

  /** Flujo y nodo guardados: sirven para resolver los encabezados enmascarados. */
  @IsOptional()
  @IsUUID()
  flowId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  nodeId?: string;

  @IsObject()
  config: Record<string, unknown>;

  /** Valores de ejemplo para los {{x}} de la configuración. */
  @IsOptional()
  @IsObject()
  values?: Record<string, string>;
}

export class UpdateConversationFlowDto {
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
  nodes?: FlowNode[];

  @IsOptional()
  @IsArray()
  edges?: FlowEdge[];

  @IsOptional()
  @IsObject()
  triggers?: FlowTriggers | null;
}
