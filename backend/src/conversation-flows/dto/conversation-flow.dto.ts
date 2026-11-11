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
