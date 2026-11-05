import {
  IsString,
  IsUUID,
  IsOptional,
  MaxLength,
  IsIn,
  IsObject,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCourseDto {
  @IsUUID()
  tenantId: string;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsUUID()
  campaignId?: string | null;
}

class RankingPrizeDto {
  @IsNumber()
  rank: number;

  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}

class RankingConfigDto {
  @IsOptional()
  @IsIn(['weighted_score', 'total_score', 'accuracy', 'completion_time'])
  metric?: string;

  @IsOptional()
  @IsIn(['completion_time', 'fewest_attempts', 'earliest_finish'])
  tieBreaker?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RankingPrizeDto)
  prizes?: RankingPrizeDto[];

  @IsOptional()
  @IsBoolean()
  publishLeaderboard?: boolean;
}

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  coverUrl?: string | null;

  @IsOptional()
  @IsIn(['draft', 'active', 'archived'])
  status?: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => RankingConfigDto)
  rankingConfig?: RankingConfigDto | null;

  @IsOptional()
  @IsObject()
  settings?: Record<string, any> | null;

  @IsOptional()
  @IsObject()
  crmMapping?: {
    fields?: Record<string, string>;
    matchRules?: { logic: 'and' | 'or'; fields: string[] };
  } | null;

  @IsOptional()
  @IsObject()
  theme?: { primary?: string; background?: string } | null;

  @IsOptional()
  @IsUUID()
  managedByUserId?: string | null;
}
