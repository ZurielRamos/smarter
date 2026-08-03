import { IsInt, IsString, IsOptional, Min } from 'class-validator';

export class RechargeDto {
  @IsInt()
  @Min(1)
  amount: number;

  @IsString()
  @IsOptional()
  paymentRef?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
