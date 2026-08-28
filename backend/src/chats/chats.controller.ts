import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, Res, UseInterceptors, UploadedFile, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { Public } from '../auth/public.decorator';
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
  updateInbox(@Param('id') id: string, @Body() body: Partial<{ name: string; status: string; accessToken: string | null; pageId: string | null; phoneNumberId: string | null; wabaId: string | null; channelName: string | null; botId: string | null; metadata: Record<string, any> }>) {
    return this.chatsService.updateInbox(id, body);
  }

  @Delete('inboxes/:id')
  deleteInbox(@Param('id') id: string) {
    return this.chatsService.deleteInbox(id);
  }

  // === INBOX COLLABORATORS ===

  @Get('inboxes/:id/collaborators')
  getCollaborators(@Param('id') id: string) {
    return this.chatsService.getCollaborators(id);
  }

  @Post('inboxes/:id/collaborators')
  addCollaborator(@Param('id') id: string, @Body() body: { type: string; referenceId: string }) {
    return this.chatsService.addCollaborator(id, body.type, body.referenceId);
  }

  @Delete('inboxes/:id/collaborators/:collaboratorId')
  removeCollaborator(@Param('id') id: string, @Param('collaboratorId') collaboratorId: string) {
    return this.chatsService.removeCollaborator(collaboratorId);
  }

  // === OAUTH ===

  @Public()
  @Get('oauth/connect')
  oauthConnect(@Query('inboxId') inboxId: string, @Query('channel') channel: string, @Res() res: Response) {
    const url = this.chatsService.getOAuthUrl(inboxId, channel);
    res.redirect(url);
  }

  @Public()
  @Get('oauth/callback')
  async oauthCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      const inbox = await this.chatsService.handleOAuthCallback(code, state);
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
      const tenant = await this.chatsService.getTenantByInboxId(inbox.id);
      const slug = tenant?.slug || '';
      res.redirect(`${frontendUrl}/${slug}/comunicaciones/canales/${inbox.id}`);
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

  // Configure SMTP for email inbox
  @Put('inboxes/:id/smtp')
  async configureSmtp(
    @Param('id') id: string,
    @Body() body: { host: string; port: number; secure: boolean; user: string; pass: string; fromName: string; fromEmail: string; defaultSubject?: string },
  ) {
    return this.chatsService.configureSmtp(id, body);
  }

  // Test SMTP connection
  @Post('inboxes/:id/smtp/test')
  async testSmtp(
    @Param('id') id: string,
    @Body() body: { host: string; port: number; secure: boolean; user: string; pass: string; fromName: string; fromEmail: string },
  ) {
    return this.chatsService.testSmtp(body);
  }

  // Send test email template
  @Post('inboxes/:id/email/test')
  async sendTestEmail(
    @Param('id') id: string,
    @Body() body: { to: string; subject: string; html: string; variables?: Record<string, string>; fromName?: string },
  ) {
    return this.chatsService.sendTestEmail(id, body);
  }

  // Get WhatsApp config ID for frontend
  @Public()
  @Get('whatsapp/config')
  getWhatsAppConfig() {
    return {
      appId: this.configService.get<string>('META_APP_ID'),
      configId: this.configService.get<string>('META_WA_CONFIG_ID'),
    };
  }

  // Sync WhatsApp phone number from WABA
  @Post('whatsapp/sync-phone')
  syncPhoneNumber(@Body() body: { inboxId: string }) {
    return this.chatsService.syncWhatsAppPhoneNumber(body.inboxId);
  }

  // Register WhatsApp phone number for Cloud API
  @Post('whatsapp/register-phone')
  registerPhoneNumber(@Body() body: { inboxId: string; pin: string }) {
    return this.chatsService.registerWhatsAppPhoneNumber(body.inboxId, body.pin);
  }

  // Upload media for WhatsApp template header
  @Post('whatsapp/templates/upload-media')
  @UseInterceptors(FileInterceptor('file'))
  uploadTemplateMedia(@UploadedFile() file: Express.Multer.File, @Body() body: { inboxId: string }) {
    return this.chatsService.uploadTemplateMedia(body.inboxId, file);
  }

  // Update WhatsApp business profile
  @Put('whatsapp/profile')
  updateWhatsAppProfile(@Body() body: { inboxId: string; about?: string; description?: string; address?: string; email?: string; websites?: string[]; vertical?: string; profile_picture_handle?: string }) {
    const { inboxId, ...profileData } = body;
    return this.chatsService.updateWhatsAppBusinessProfile(inboxId, profileData);
  }

  // Upload WhatsApp profile picture
  @Post('whatsapp/profile/upload-picture')
  @UseInterceptors(FileInterceptor('file'))
  uploadProfilePicture(@UploadedFile() file: Express.Multer.File, @Body() body: { inboxId: string }) {
    return this.chatsService.uploadWhatsAppProfilePicture(body.inboxId, file);
  }

  // Get WhatsApp account status for an inbox
  @Get('whatsapp/status')
  getWhatsAppStatus(@Query('inboxId') inboxId: string) {
    return this.chatsService.getWhatsAppAccountStatus(inboxId);
  }

  // Get WhatsApp message templates for an inbox
  @Get('whatsapp/templates')
  getTemplates(@Query('inboxId') inboxId: string) {
    return this.chatsService.getWhatsAppTemplates(inboxId);
  }

  // Create a WhatsApp message template
  @Post('whatsapp/templates')
  createTemplate(@Body() body: { inboxId: string; name: string; category: string; language: string; components: any[] }) {
    const { inboxId, ...templateData } = body;
    return this.chatsService.createWhatsAppTemplate(inboxId, templateData);
  }

  // Update a WhatsApp message template
  @Put('whatsapp/templates/:templateId')
  updateTemplate(@Param('templateId') templateId: string, @Body() body: { inboxId: string; components: any[]; category?: string }) {
    const { inboxId, ...templateData } = body;
    return this.chatsService.updateWhatsAppTemplate(inboxId, templateId, templateData);
  }

  // Delete a WhatsApp message template
  @Delete('whatsapp/templates/:templateName')
  deleteTemplate(@Param('templateName') templateName: string, @Query('inboxId') inboxId: string) {
    return this.chatsService.deleteWhatsAppTemplate(inboxId, templateName);
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

  // Bootstrap: consolida inboxes + conversations + labels + members en una
  // sola respuesta para reducir el número de peticiones al abrir la vista.
  @Get('bootstrap')
  getBootstrap(
    @Query('tenantId') tenantId: string,
    @Query('inboxIds') inboxIds?: string,
    @Query('labelId') labelId?: string,
    @Query('labelIds') labelIds?: string,
    @Query('hideCampaign') hideCampaign?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.chatsService.getBootstrap(tenantId, {
      inboxIds: inboxIds ? inboxIds.split(',').filter(Boolean) : undefined,
      labelIds: labelIds ? labelIds.split(',').filter(Boolean) : (labelId ? [labelId] : []),
      hideCampaign: hideCampaign === 'true',
      limit: limit ? parseInt(limit, 10) : 15,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get('conversations')
  getConversations(
    @Query('tenantId') tenantId?: string,
    @Query('inboxId') inboxId?: string,
    @Query('inboxIds') inboxIds?: string,
    @Query('recordId') recordId?: string,
    @Query('labelId') labelId?: string,
    @Query('labelIds') labelIds?: string,
    @Query('hideCampaign') hideCampaign?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const opts = {
      limit: limit ? parseInt(limit, 10) : 15,
      offset: offset ? parseInt(offset, 10) : 0,
      labelIds: labelIds ? labelIds.split(',').filter(Boolean) : (labelId ? [labelId] : []),
      hideCampaign: hideCampaign === 'true',
    };

    if (recordId) return this.chatsService.getConversationsByRecordId(recordId, opts);
    if (inboxIds) {
      const ids = inboxIds.split(',').filter(Boolean);
      return this.chatsService.getConversationsByInboxes(ids, opts);
    }
    if (inboxId) return this.chatsService.getConversationsPaginated(inboxId, opts);
    if (tenantId) return this.chatsService.getConversationsByTenantPaginated(tenantId, opts);
    return { data: [], total: 0 };
  }

  @Post('conversations/:id/read')
  markAsRead(@Param('id') id: string) {
    return this.chatsService.markAsRead(id);
  }

  @Post('conversations/:id/bot-reactivate')
  reactivateBot(@Param('id') id: string, @Req() req: any) {
    return this.chatsService.reactivateBot(id, req.user?.name || req.user?.email);
  }

  @Put('conversations/:id/status')
  updateConversationStatus(@Param('id') id: string, @Body() body: { status: string }, @Req() req: any) {
    return this.chatsService.updateConversationStatus(id, body.status, req.user?.name || req.user?.email);
  }

  @Post('conversations/:id/bot-pause')
  pauseBot(@Param('id') id: string, @Req() req: any) {
    return this.chatsService.pauseBot(id, req.user?.name || req.user?.email);
  }

  @Delete('conversations/:id')
  deleteConversation(@Param('id') id: string) {
    return this.chatsService.deleteConversation(id);
  }

  @Delete('conversations/:id/messages')
  clearMessages(@Param('id') id: string) {
    return this.chatsService.clearMessages(id);
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
@SkipThrottle()
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

  // Evolution API webhook events
  @Post('evolution/:inboxId')
  async handleEvolutionWebhook(@Param('inboxId') inboxId: string, @Body() body: any, @Res() res: Response) {
    res.status(200).send('OK');
    try {
      const eventType = body.event;
      console.log(`[Evolution Webhook] Event: ${eventType} for inbox: ${inboxId}`);

      if (eventType === 'connection.update') {
        const state = body.data?.state || body.data?.instance?.state;
        if (state) {
          const mappedStatus = state === 'open' ? 'connected' : state === 'connecting' ? 'pending' : 'disconnected';
          const updateData: any = { status: mappedStatus };
          if (state === 'open' && body.data?.wuid) {
            updateData.channelName = body.data.wuid.split('@')[0];
          }
          await this.chatsService.updateInbox(inboxId, updateData);
        }
      } else if (eventType === 'messages.upsert') {
        const messages = body.data || [];
        for (const msgData of Array.isArray(messages) ? messages : [messages]) {
          const key = msgData.key;
          if (!key || key.fromMe) continue;
          const remoteJid = key.remoteJid || '';
          if (remoteJid === 'status@broadcast' || remoteJid.endsWith('@g.us')) continue;
          const contactPhone = remoteJid.split('@')[0];
          if (!contactPhone) continue;
          const message = msgData.message;
          if (!message) continue;

          const contactName = msgData.pushName || contactPhone;
          let messageType = 'text';
          let content: string | null = null;
          let mediaUrl: string | null = null;
          let mediaMimeType: string | null = null;

          if (message.conversation) {
            content = message.conversation;
          } else if (message.extendedTextMessage) {
            content = message.extendedTextMessage.text || '';
          } else if (message.imageMessage) {
            messageType = 'image';
            content = message.imageMessage.caption || null;
            mediaMimeType = message.imageMessage.mimetype || 'image/jpeg';
            mediaUrl = message.imageMessage.url || null;
            if (!mediaUrl && msgData.base64) mediaUrl = `data:${mediaMimeType};base64,${msgData.base64}`;
          } else if (message.videoMessage) {
            messageType = 'video';
            content = message.videoMessage.caption || null;
            mediaMimeType = message.videoMessage.mimetype || 'video/mp4';
            mediaUrl = message.videoMessage.url || null;
            if (!mediaUrl && msgData.base64) mediaUrl = `data:${mediaMimeType};base64,${msgData.base64}`;
          } else if (message.audioMessage) {
            messageType = 'audio';
            mediaMimeType = message.audioMessage.mimetype || 'audio/ogg';
            mediaUrl = message.audioMessage.url || null;
            if (!mediaUrl && msgData.base64) mediaUrl = `data:${mediaMimeType};base64,${msgData.base64}`;
          } else if (message.documentMessage) {
            messageType = 'document';
            content = message.documentMessage.fileName || null;
            mediaMimeType = message.documentMessage.mimetype || 'application/octet-stream';
            mediaUrl = message.documentMessage.url || null;
            if (!mediaUrl && msgData.base64) mediaUrl = `data:${mediaMimeType};base64,${msgData.base64}`;
          } else if (message.stickerMessage) {
            messageType = 'sticker';
            mediaMimeType = message.stickerMessage.mimetype || 'image/webp';
          } else if (message.locationMessage) {
            content = `📍 ${message.locationMessage.degreesLatitude}, ${message.locationMessage.degreesLongitude}`;
          } else if (message.contactMessage) {
            content = `👤 ${message.contactMessage.displayName || 'Contacto'}`;
          } else if (message.buttonsResponseMessage) {
            content = message.buttonsResponseMessage.selectedDisplayText || '[button]';
          } else if (message.listResponseMessage) {
            content = message.listResponseMessage.title || '[list]';
          } else {
            content = '[mensaje no soportado]';
          }

          await this.chatsService.handleEvolutionInboundMessage(inboxId, {
            contactPhone,
            contactName,
            messageType,
            content,
            mediaUrl,
            mediaMimeType,
            externalId: key.id || null,
            replyToExternalId: msgData.contextInfo?.stanzaId || message.extendedTextMessage?.contextInfo?.stanzaId || null,
          });
        }
      } else if (eventType === 'messages.update') {
        const updates = body.data || [];
        for (const update of Array.isArray(updates) ? updates : [updates]) {
          const messageId = update.key?.id;
          const status = update.update?.status;
          if (!messageId || !status) continue;
          let mappedStatus: string | null = null;
          if (status === 'DELIVERY_ACK' || status === 3) mappedStatus = 'delivered';
          else if (status === 'READ' || status === 4 || status === 'PLAYED' || status === 5) mappedStatus = 'read';
          if (mappedStatus) await this.chatsService.updateMessageStatus(messageId, mappedStatus);
        }
      }
    } catch (error) {
      console.error(`[Evolution Webhook] Error processing event for inbox ${inboxId}:`, error);
    }
  }
}
