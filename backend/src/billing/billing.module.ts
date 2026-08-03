import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { CreditPlan, CreditBalance, CreditTransaction, CreditCost } from './entities';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { CreditsGuard } from './guards/credits.guard';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([CreditPlan, CreditBalance, CreditTransaction, CreditCost]),
  ],
  controllers: [BillingController],
  providers: [BillingService, CreditsGuard],
  exports: [BillingService, CreditsGuard],
})
export class BillingModule {}
