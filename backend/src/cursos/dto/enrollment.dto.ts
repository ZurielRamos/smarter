import {
  IsOptional,
  IsUUID,
  IsArray,
  IsObject,
  IsString,
  ArrayNotEmpty,
} from 'class-validator';

export class CreateEnrollmentsDto {
  /** Contactos del CRM a inscribir. */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  recordIds?: string[];

  @IsOptional()
  @IsUUID()
  campaignId?: string | null;
}

export class EnrollFromCampaignDto {
  @IsUUID()
  campaignId: string;
}

export class SubmitAttemptDto {
  @IsArray()
  @ArrayNotEmpty()
  answers: Array<{
    questionId: string;
    answer: string[] | string | number | null;
    timeTakenSec?: number;
  }>;
}

export class SaveParticipantDto {
  /** Datos del participante por nombre de campo (se mapean al CRM). */
  @IsObject()
  participantData: Record<string, any>;
}

export class ViewMaterialDto {
  @IsOptional()
  @IsString()
  secondsSpent?: number;
}
