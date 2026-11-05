import {
  IsString,
  IsOptional,
  IsIn,
  IsInt,
  IsNumber,
  Min,
  IsUUID,
  IsBoolean,
  IsArray,
  IsObject,
} from 'class-validator';

export class CreateQuestionDto {
  @IsIn(['single_choice', 'multiple_choice', 'true_false', 'short_text', 'numeric', 'ordering'])
  type: string;

  @IsString()
  prompt: string;

  /** Quiz al que pertenece (lesson_quiz o final_exam). */
  @IsUUID()
  quizId: string;

  @IsOptional()
  @IsUUID()
  lessonId?: string | null;

  @IsOptional()
  @IsBoolean()
  isFinalExam?: boolean;

  @IsOptional()
  @IsArray()
  options?: Array<{ id?: string; text: string; isCorrect: boolean; weight?: number }>;

  @IsOptional()
  @IsObject()
  correctAnswer?: Record<string, any> | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  points?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateQuestionDto {
  @IsOptional()
  @IsIn(['single_choice', 'multiple_choice', 'true_false', 'short_text', 'numeric', 'ordering'])
  type?: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string | null;

  @IsOptional()
  @IsArray()
  options?: Array<{ id?: string; text: string; isCorrect: boolean; weight?: number }>;

  @IsOptional()
  @IsObject()
  correctAnswer?: Record<string, any> | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  points?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  negativeOnWrong?: number;

  @IsOptional()
  @IsBoolean()
  partialCredit?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  timeLimitSec?: number | null;

  @IsOptional()
  @IsObject()
  timeBonus?: { enabled: boolean; maxBonusPoints: number; decayModel?: 'linear' | 'step' } | null;

  @IsOptional()
  @IsString()
  explanation?: string | null;

  @IsOptional()
  @IsIn(['easy', 'medium', 'hard'])
  difficulty?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
