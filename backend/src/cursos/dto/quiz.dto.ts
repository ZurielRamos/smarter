import {
  IsString,
  IsOptional,
  MaxLength,
  IsIn,
  IsInt,
  IsNumber,
  Min,
  IsUUID,
  IsBoolean,
} from 'class-validator';

export class CreateQuizDto {
  @IsIn(['lesson_quiz', 'final_exam'])
  kind: string;

  @IsOptional()
  @IsUUID()
  lessonId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateQuizDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalTimeLimitSec?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  passingScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weightInCourse?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number;

  @IsOptional()
  @IsBoolean()
  shuffleQuestions?: boolean;

  @IsOptional()
  @IsBoolean()
  shuffleOptions?: boolean;

  @IsOptional()
  @IsIn(['immediately', 'after_close', 'never'])
  showResultsPolicy?: string;

  @IsOptional()
  @IsIn(['draft', 'active'])
  status?: string;
}
