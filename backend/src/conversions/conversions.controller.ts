import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { ConversionsService } from './conversions.service';
import type { Request } from 'express';

@Controller('conversions')
@UseGuards(JwtAuthGuard)
export class ConversionsController {
  constructor(private readonly conversionsService: ConversionsService) {}

  // ============================
  // AD EVENTS
  // ============================

  /** Track an ad event (public — called from forms, link tracker, etc.) */
  @Public()
  @Post('track')
  async trackEvent(@Body() body: {
    tenantId: string;
    recordId?: string;
    sessionId?: string;
    params: Record<string, string>;
    landingPage?: string;
    referrer?: string;
    fbc?: string;
    fbp?: string;
  }, @Req() req: Request) {
    return this.conversionsService.trackFromUrlParams(
      body.tenantId,
      { ...body.params, fbc: body.fbc, fbp: body.fbp } as any,
      {
        ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip,
        userAgent: req.headers['user-agent'],
        referrer: body.referrer,
        landingPage: body.landingPage,
        recordId: body.recordId,
        sessionId: body.sessionId,
      },
    );
  }

  /** Get ad events for a specific record */
  @Get('ad-events')
  getAdEvents(@Query('recordId') recordId: string, @Query('all') all?: string) {
    if (all === 'true') {
      return this.conversionsService.getAllEventsForRecord(recordId);
    }
    return this.conversionsService.getActiveEventsForRecord(recordId);
  }

  /** Link orphan events to a record */
  @Post('ad-events/link')
  linkEvents(@Body() body: { tenantId: string; recordId: string; sessionId?: string }) {
    return this.conversionsService.linkEventsToRecord(body.tenantId, body.recordId, body.sessionId);
  }

  // ============================
  // CONVERSION EVENTS (Config)
  // ============================

  @Get('events')
  getConversionEvents(@Query('tenantId') tenantId: string) {
    return this.conversionsService.getConversionEvents(tenantId);
  }

  @Post('events')
  createConversionEvent(@Body() body: any) {
    return this.conversionsService.createConversionEvent(body);
  }

  @Put('events/:id')
  updateConversionEvent(@Param('id') id: string, @Body() body: any) {
    return this.conversionsService.updateConversionEvent(id, body);
  }

  @Delete('events/:id')
  deleteConversionEvent(@Param('id') id: string) {
    return this.conversionsService.deleteConversionEvent(id);
  }

  // ============================
  // AD PLATFORMS (Credentials)
  // ============================

  @Get('platforms')
  getAdPlatforms(@Query('tenantId') tenantId: string) {
    return this.conversionsService.getAdPlatforms(tenantId);
  }

  @Post('platforms')
  createAdPlatform(@Body() body: any) {
    return this.conversionsService.createAdPlatform(body);
  }

  @Put('platforms/:id')
  updateAdPlatform(@Param('id') id: string, @Body() body: any) {
    return this.conversionsService.updateAdPlatform(id, body);
  }

  @Delete('platforms/:id')
  deleteAdPlatform(@Param('id') id: string) {
    return this.conversionsService.deleteAdPlatform(id);
  }

  // ============================
  // DISPATCH (manual trigger for testing)
  // ============================

  @Post('dispatch')
  dispatchConversion(@Body() body: {
    tenantId: string;
    recordId: string;
    triggerType: string;
    triggerValue: string;
    value?: number;
    email?: string;
    phone?: string;
  }) {
    return this.conversionsService.dispatchConversion(body);
  }

  // ============================
  // LOGS
  // ============================

  @Get('logs')
  getConversionLogs(
    @Query('tenantId') tenantId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.conversionsService.getConversionLogs(
      tenantId,
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  @Get('logs/record/:recordId')
  getLogsByRecord(@Param('recordId') recordId: string) {
    return this.conversionsService.getConversionLogsByRecord(recordId);
  }
}
