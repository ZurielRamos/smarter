import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, Res, UseInterceptors, UploadedFile, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { ChatsService } from './chats.service';
import { WebhookForwarderService } from './webhook-forwarder.service';

@Controller('chats')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
export class ChatsController {
  constructor(
    private readonly chatsService: ChatsService,
    private readonly configService: ConfigService,
  ) {}

  // === INBOXES ===

  @Get('inboxes')
  getInboxes(@Query('tenantId') tenantId: string) {
    return this.chatsService.getInboxes(tenantId);
  }

  @Get('inboxes/:id')
  getInbox(@Param('id') id: string) {
    return this.chatsService.findInboxById(id);
  }

  @Post('inboxes')
  createInbox(@Body() body: { tenantId: string; name: string; channel: string }) {
    return this.chatsService.createInbox(body);
  }

  @Put('inboxes/:id')
  updateInbox(@Param('id') id: string, @Body() body: Partial<{ name: string; status: string; accessToken: string | null; pageId: string | null; phoneNumberId: string | null; wabaId: string | null; channelName: string | null }>) {
    return this.chatsService.updateInbox(id, body);
  }

  @Delete('inboxes/:id')
  deleteInbox(@Param('id') id: string) {
    return this.chatsService.deleteInbox(id);
  }

  // === OAUTH ===

  @Get('oauth/connect')
  oauthConnect(@Query('inboxId') inboxId: string, @Query('channel') channel: string, @Res() res: Response) {
    const url = this.chatsService.getOAuthUrl(inboxId, channel);
    res.redirect(url);
  }

  @Get('oauth/callback')
  async oauthCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      const inbox = await this.chatsService.handleOAuthCallback(code, state);
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
      // Get tenant slug for proper redirect
      const tenant = await this.chatsService.getTenantByInboxId(inbox.id);
      const slug = tenant?.slug || '';
      res.redirect(`${frontendUrl}/${slug}/inboxes/${inbox.id}/settings?connected=true`);
    } catch (error) {
      console.error('[OAuth Callback] Error:', error);
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
  }

  // WhatsApp Embedded Signup — exchange code from frontend SDK
  @Post('whatsapp/embedded-signup')
  async whatsappEmbeddedSignup(@Body() body: { code: string; inboxId: string }) {
    return this.chatsService.handleWhatsAppEmbeddedSignup(body.code, body.inboxId);
  }

  // Manual connect — connect inbox with token and phone number ID directly
  @Post('inboxes/:id/manual-connect')
  async manualConnect(
    @Param('id') id: string,
    @Body() body: { accessToken: string; phoneNumberId?: string; wabaId?: string; pageId?: string },
  ) {
    return this.chatsService.manualConnect(id, body);
  }

  // Get WhatsApp config ID for frontend
  @Get('whatsapp/config')
  getWhatsAppConfig() {
    return {
      appId: this.configService.get<string>('META_APP_ID'),
      configId: this.configService.get<string>('META_WA_CONFIG_ID'),
    };
  }

  // Get WhatsApp message templates for an inbox
  @Get('whatsapp/templates')
  getTemplates(@Query('inboxId') inboxId: string) {
    return this.chatsService.getWhatsAppTemplates(inboxId);
  }

  // Send a template message
  @Post('conversations/:id/send-template')
  sendTemplate(
    @Param('id') id: string,
    @Body() body: { templateName: string; languageCode: string; category?: string; components?: any[]; senderId?: string; renderedContent?: string; templateComponents?: any[] },
    @Req() req: any,
  ) {
    return this.chatsService.sendTemplateMessage(id, body.templateName, body.languageCode, body.components, body.senderId, body.renderedContent, body.templateComponents, body.category, req.user?.id);
  }

  // === CONVERSATIONS ===

  @Get('conversations')
  getConversations(@Query('tenantId') tenantId?: string, @Query('inboxId') inboxId?: string) {
    if (inboxId) return this.chatsService.getConversations(inboxId);
    if (tenantId) return this.chatsService.getConversationsByTenant(tenantId);
    return [];
  }

  @Post('conversations/:id/read')
  markAsRead(@Param('id') id: string) {
    return this.chatsService.markAsRead(id);
  }

  @Delete('conversations/:id')
  deleteConversation(@Param('id') id: string) {
    return this.chatsService.deleteConversation(id);
  }

  // === MESSAGES ===

  @Get('conversations/:id/messages')
  getMessages(
    @Param('id') id: string,
    @Query('limit') limit = '50',
    @Query('before') before?: string,
  ) {
    return this.chatsService.getMessages(id, +limit, before);
  }

  @Post('conversations/:id/send')
  sendMessage(@Param('id') id: string, @Body() body: { content: string; messageType?: string; senderId?: string; replyToExternalId?: string }) {
    return this.chatsService.sendMessage(id, body.content, body.messageType || 'text', body.senderId, body.replyToExternalId);
  }

  @Post('conversations/:id/note')
  createNote(@Param('id') id: string, @Body() body: { content: string; senderId?: string }) {
    return this.chatsService.createNote(id, body.content, body.senderId);
  }

  @Post('conversations/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedia(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { conversationId: string; senderId?: string; caption?: string },
  ) {
    return this.chatsService.sendMediaMessage(body.conversationId, file, body.senderId, body.caption);
  }

  @Post('media/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMediaOnly(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { conversationId?: string; senderId?: string },
  ) {
    return this.chatsService.uploadMediaOnly(file, body.conversationId);
  }

  // === LABELS ===

  @Get('labels')
  getLabels(@Query('tenantId') tenantId: string) {
    return this.chatsService.getLabels(tenantId);
  }

  @Post('labels')
  createLabel(@Body() body: { tenantId: string; slug: string; label: string; description?: string; color?: string; showInSidebar?: boolean }) {
    return this.chatsService.createLabel(body);
  }

  @Put('labels/:id')
  updateLabel(@Param('id') id: string, @Body() body: Partial<{ label: string; description: string; color: string; showInSidebar: boolean }>) {
    return this.chatsService.updateLabel(id, body);
  }

  @Delete('labels/:id')
  deleteLabel(@Param('id') id: string) {
    return this.chatsService.deleteLabel(id);
  }

  @Post('conversations/:id/toggle-label')
  toggleLabel(@Param('id') id: string, @Body() body: { labelId: string; action: 'add' | 'remove'; userId?: string; userName?: string }) {
    return this.chatsService.toggleConversationLabel(id, body.labelId, body.action, body.userId, body.userName);
  }
}

// Separate controller for the webhook (no /api prefix needed depending on setup)
@Controller('webhooks')
export class WebhookController {
  constructor(
    private readonly chatsService: ChatsService,
    private readonly configService: ConfigService,
    private readonly webhookForwarder: WebhookForwarderService,
  ) {}

  // Meta webhook verification
  @Get('meta')
  verifyWebhook(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string, @Res() res: Response) {
    const verifyToken = this.configService.get<string>('META_WEBHOOK_VERIFY_TOKEN');
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[Webhook] Verification successful');
      res.status(200).send(challenge);
    } else {
      console.warn('[Webhook] Verification failed');
      res.status(403).send('Forbidden');
    }
  }

  // Meta webhook events
  @Post('meta')
  async handleWebhook(@Body() body: any, @Res() res: Response) {
    // Always respond 200 immediately — process async
    res.status(200).send('EVENT_RECEIVED');
    try {
      // If this webhook belongs to a dev tenant, forward it and skip local processing
      const forwarded = await this.webhookForwarder.forwardIfDev(body);
      if (forwarded) return;

      await this.chatsService.handleWebhook(body);
    } catch (error) {
      console.error('[Webhook] Processing error:', error);
    }
  }
}
