import { IsEnum, IsInt, IsBoolean, IsOptional, Min } from 'class-validator';
import { PlanType } from '../entities';

export class CreatePlanDto {
  @IsEnum(PlanType)
  type: PlanType;

  @IsInt()
  @Min(0)
  @IsOptional()
  monthlyCredits?: number;

  @IsBoolean()
  @IsOptional()
  rollover?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  lowBalanceThreshold?: number;
}
