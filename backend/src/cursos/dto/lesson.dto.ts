import {
  IsString,
  IsOptional,
  MaxLength,
  IsIn,
  IsInt,
  Min,
  IsArray,
  IsUUID,
  IsObject,
} from 'class-validator';

export class CreateLessonDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateLessonDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: string;

  @IsOptional()
  @IsArray()
  materials?: any[];

  @IsOptional()
  @IsInt()
  @Min(0)
  minSecondsBeforeQuiz?: number;
}

export class ReorderDto {
  /** Lista ordenada de ids (clases o preguntas). */
  @IsArray()
  @IsUUID('all', { each: true })
  ids: string[];
}

export class AddMaterialDto {
  @IsIn(['youtube', 'video_url', 'video_upload', 'document', 'image', 'link', 'text'])
  type: string;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSec?: number;

  @IsOptional()
  required?: boolean;
}

export class UpdateMaterialDto {
  @IsOptional()
  @IsObject()
  patch?: Record<string, any>;
}
