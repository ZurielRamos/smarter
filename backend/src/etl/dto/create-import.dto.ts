import { IsOptional, IsString, IsArray, IsObject, IsEnum, IsNumber, Min, Max } from 'class-validator';
import type { DeduplicateStrategy, ValidationRule } from '../entities/import-job.entity';

export class CreateImportDto {
  @IsString()
  tenantId: string;

  @IsString()
  fileId: string;

  @IsObject()
  mapping: Record<string, string[]>;

  @IsOptional()
  @IsObject()
  transforms?: Record<string, any>;

  @IsOptional()
  @IsArray()
  matchFields?: string[];

  @IsOptional()
  @IsEnum(['keep_existing', 'overwrite', 'merge_non_empty', 'append_tags', 'overwrite_selected'] as const)
  deduplicateStrategy?: DeduplicateStrategy;

  @IsOptional()
  @IsArray()
  overwriteFields?: string[];

  @IsOptional()
  fuzzyMatch?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  fuzzyThreshold?: number;

  @IsOptional()
  @IsArray()
  validationRules?: ValidationRule[];

  @IsOptional()
  @IsString()
  templateName?: string;

  @IsOptional()
  @IsArray()
  headers?: string[];
}

export class ValidatePreviewDto {
  @IsString()
  fileId: string;

  @IsString()
  tenantId: string;

  @IsObject()
  mapping: Record<string, string[]>;

  @IsOptional()
  @IsObject()
  transforms?: Record<string, any>;

  @IsOptional()
  @IsArray()
  validationRules?: ValidationRule[];

  @IsOptional()
  @IsArray()
  matchFields?: string[];
}

export class DeduplicatePreviewDto {
  @IsString()
  fileId: string;

  @IsString()
  tenantId: string;

  @IsObject()
  mapping: Record<string, string[]>;

  @IsOptional()
  @IsObject()
  transforms?: Record<string, any>;

  @IsOptional()
  @IsArray()
  matchFields?: string[];

  @IsOptional()
  fuzzyMatch?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  fuzzyThreshold?: number;
}
