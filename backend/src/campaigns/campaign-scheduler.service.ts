import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Campaign } from './campaign.entity';
import { CampaignsService } from './campaigns.service';

/**
 * Scheduler that checks every minute for campaigns that need to be executed.
 * Only runs when ENABLE_SCHEDULER=true (production).
 * 
 * Handles:
 * - Envío único programado: active + sendDate + sendTime <= now
 * - Envío recurrente: active + isRecurring + current day/time matches
 */
@Injectable()
export class CampaignSchedulerService {
  private readonly logger = new Logger(CampaignSchedulerService.name);
  private readonly enabled: boolean;

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
    private readonly campaignsService: CampaignsService,
    private readonly configService: ConfigService,
  ) {
    this.enabled = this.configService.get<string>('ENABLE_SCHEDULER', 'false') === 'true';
    if (this.enabled) {
      this.logger.log('Campaign scheduler ENABLED');
    } else {
      this.logger.log('Campaign scheduler DISABLED (set ENABLE_SCHEDULER=true to enable)');
    }
  }

  @Cron('0 * * * * *') // Every minute at second 0
  async checkScheduledCampaigns(): Promise<void> {
    if (!this.enabled) return;

    try {
      await this.processScheduledOnce();
      await this.processRecurring();
    } catch (error) {
      this.logger.error('Error in campaign scheduler:', error);
    }
  }

  /**
   * Process one-time scheduled campaigns.
   * Finds active campaigns where sendDate + sendTime has passed.
   */
  private async processScheduledOnce(): Promise<void> {
    const now = new Date();
    const campaigns = await this.campaignRepo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: 'active' })
      .andWhere('c.is_recurring = false')
      .andWhere('c.send_date IS NOT NULL')
      .getMany();

    for (const campaign of campaigns) {
      const scheduledTime = this.getScheduledDateTime(campaign.sendDate, campaign.sendTime);
      if (!scheduledTime || scheduledTime > now) continue;

      this.logger.log(`[Scheduler] Executing scheduled campaign "${campaign.name}" (${campaign.id})`);
      try {
        await this.campaignsService.sendCampaign(campaign.id);
        // Mark as completed after single scheduled send
        await this.campaignRepo.update(campaign.id, { status: 'completed' });
      } catch (error) {
        this.logger.error(`[Scheduler] Failed to execute campaign ${campaign.id}:`, error);
      }
    }
  }

  /**
   * Process recurring campaigns.
   * Checks if today's day and current time match the recurrence config.
   */
  private async processRecurring(): Promise<void> {
    const now = new Date();
    const dayNames = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const todayKey = dayNames[now.getDay()];
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const campaigns = await this.campaignRepo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: 'active' })
      .andWhere('c.is_recurring = true')
      .andWhere('c.recurrence_days IS NOT NULL')
      .getMany();

    for (const campaign of campaigns) {
      const recDays = campaign.recurrenceDays;
      if (!recDays || typeof recDays !== 'object') continue;

      // Check if today is a scheduled day
      const scheduledTime = recDays[todayKey];
      if (!scheduledTime) continue;

      // Check if current time matches (within the same minute)
      if (scheduledTime !== currentTime) continue;

      // Prevent duplicate execution: check if already sent in the last 2 minutes
      const recentSend = await this.campaignsService.getSends(campaign.id);
      const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
      const alreadyRan = recentSend.some(
        (s) => new Date(s.createdAt) > twoMinutesAgo,
      );
      if (alreadyRan) continue;

      this.logger.log(`[Scheduler] Executing recurring campaign "${campaign.name}" (${campaign.id}) for ${todayKey} at ${scheduledTime}`);
      try {
        await this.campaignsService.sendCampaign(campaign.id);
      } catch (error) {
        this.logger.error(`[Scheduler] Failed to execute recurring campaign ${campaign.id}:`, error);
      }
    }
  }

  private getScheduledDateTime(sendDate: Date | string | null, sendTime: string | null): Date | null {
    if (!sendDate) return null;
    const dateStr = typeof sendDate === 'string' ? sendDate.split('T')[0] : sendDate.toISOString().split('T')[0];
    const time = sendTime || '00:00';
    return new Date(`${dateStr}T${time}:00`);
  }
}
