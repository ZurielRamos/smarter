import { Injectable, Inject, forwardRef, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Inbox } from './inbox.entity';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { InboxCollaborator } from './inbox-collaborator.entity';
import { ClientRecord } from '../records/record.entity';
import { Label } from './label.entity';
import { ChatsGateway } from './chats.gateway';
import { ChatWidgetGateway } from './chat-widget.gateway';
import { MediaStorageService } from '../media/media-storage.service';
import { BillingService } from '../billing/billing.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { isAdminRole } from '../users/enums/tenant-role.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversionsService } from '../conversions/conversions.service';
import { BotsService } from '../bots/bots.service';
import { Activity } from '../records/activity.entity';
import { EvolutionService } from '../evolution/evolution.service';
import { MailgunService } from '../providers/mailgun.service';
import { EmailDomainService } from '../providers/email-domain.service';
import { EmailUnsubscribeService } from '../providers/email-unsubscribe.service';

@Injectable()
export class ChatsService {
  // Debounce timers for bot replies (conversationId -> timeout)
  private botReplyTimers = new Map<string, NodeJS.Timeout>();
  constructor(
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(ClientRecord)
    private readonly clientRecordRepo: Repository<ClientRecord>,
    @InjectRepository(Label)
    private readonly labelRepo: Repository<Label>,
    @InjectRepository(InboxCollaborator)
    private readonly collaboratorRepo: Repository<InboxCollaborator>,
    private readonly chatsGateway: ChatsGateway,
    private readonly chatWidgetGateway: ChatWidgetGateway,
    private readonly mediaStorageService: MediaStorageService,
    private readonly configService: ConfigService,
    private readonly billingService: BillingService,
    private readonly webhooksService: WebhooksService,
    private readonly notificationsService: NotificationsService,
    private readonly conversionsService: ConversionsService,
    private readonly botsService: BotsService,
    @InjectRepository(Activity)
    private readonly activityRepo: Repository<Activity>,
    @Inject(forwardRef(() => EvolutionService))
    private readonly evolutionService: EvolutionService,
    private readonly mailgunService: MailgunService,
    private readonly emailDomainService: EmailDomainService,
    private readonly emailUnsubscribeService: EmailUnsubscribeService,
  ) {}

  // === INBOXES ===

  async getInboxes(tenantId: string): Promise<Inbox[]> {
    return this.inboxRepo.find({ where: { tenantId }, order: { createdAt: 'ASC' } });
  }

  async createInbox(data: { tenantId: string; name: string; channel: string }): Promise<Inbox> {
    const defaultSchedule = {
      lunes: { enabled: true, start: '08:00', end: '18:00' },
      martes: { enabled: true, start: '08:00', end: '18:00' },
      miercoles: { enabled: true, start: '08:00', end: '18:00' },
      jueves: { enabled: true, start: '08:00', end: '18:00' },
      viernes: { enabled: true, start: '08:00', end: '18:00' },
      sabado: { enabled: false, start: '09:00', end: '13:00' },
      domingo: { enabled: false, start: '09:00', end: '13:00' },
      festivos: { enabled: false, start: '09:00', end: '13:00' },
    };
    const alwaysConnected = ['sms', 'llamada', 'form', 'email', 'chat'];
    const status = alwaysConnected.includes(data.channel) ? 'connected' : 'disconnected';
    const inbox = this.inboxRepo.create({ ...data, status, metadata: { schedule: defaultSchedule } });
    return this.inboxRepo.save(inbox);
  }

  async deleteInbox(id: string): Promise<{ softDeleted: boolean }> {
    const inbox = await this.inboxRepo.findOne({ where: { id } });

    // Si es un inbox de Evolution, eliminar la instancia en Evolution API
    if (inbox && inbox.channel === 'evolution' && inbox.metadata?.evolutionInstanceName) {
      try {
        await this.evolutionService.deleteInstance(inbox.metadata.evolutionInstanceName);
      } catch (err: any) {
        console.warn(`[DeleteInbox] Failed to delete Evolution instance: ${err.message}`);
      }
    }

    const conversationCount = await this.conversationRepo.count({ where: { inboxId: id } });
    if (conversationCount > 0) {
      // Soft delete — inbox has conversations
      await this.inboxRepo.softDelete(id);
      return { softDeleted: true };
    }
    // Hard delete — no conversations
    await this.inboxRepo.delete(id);
    return { softDeleted: false };
  }

  // === INBOX COLLABORATORS ===

  async getCollaborators(inboxId: string): Promise<InboxCollaborator[]> {
    return this.collaboratorRepo.find({
      where: { inboxId },
      order: { createdAt: 'ASC' },
    });
  }

  async addCollaborator(inboxId: string, type: string, referenceId: string): Promise<InboxCollaborator> {
    const existing = await this.collaboratorRepo.findOne({ where: { inboxId, type, referenceId } });
    if (existing) return existing;
    const collab = this.collaboratorRepo.create({ inboxId, type, referenceId });
    return this.collaboratorRepo.save(collab);
  }

  async removeCollaborator(collaboratorId: string): Promise<void> {
    await this.collaboratorRepo.delete(collaboratorId);
  }

  async updateInbox(id: string, data: Partial<Inbox>): Promise<Inbox> {
    const inbox = await this.findInboxById(id);
    Object.assign(inbox, data);
    return this.inboxRepo.save(inbox);
  }

  async findInboxById(id: string): Promise<Inbox> {
    const inbox = await this.inboxRepo.findOne({ where: { id } });
    if (!inbox) throw new NotFoundException('Inbox not found');
    return inbox;
  }

  async getTenantByInboxId(inboxId: string): Promise<{ slug: string } | null> {
    const inbox = await this.inboxRepo.findOne({ where: { id: inboxId }, relations: { tenant: true } });
    return inbox?.tenant || null;
  }

  // === OAUTH ===

  getOAuthUrl(inboxId: string, channel: string): string {
    const appId = this.configService.get<string>('META_APP_ID');
    const baseUrl = this.configService.get<string>('META_BASE_URL') || 'http://localhost:3001';
    const redirectUri = `${baseUrl}/api/chats/oauth/callback`;

    if (channel === 'instagram') {
      // Instagram uses its own OAuth flow
      const igAppId = this.configService.get<string>('INSTAGRAM_APP_ID');
      const scopes = 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments';
      const state = JSON.stringify({ inboxId, channel });
      return `https://www.instagram.com/oauth/authorize?client_id=${igAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scopes}&state=${encodeURIComponent(state)}`;
    }

    let scopes: string;
    switch (channel) {
      case 'whatsapp':
        scopes = 'whatsapp_business_management,whatsapp_business_messaging,business_management';
        break;
      case 'messenger':
        scopes = 'pages_messaging,pages_show_list,pages_manage_metadata';
        break;
      default:
        scopes = 'pages_show_list';
    }

    const state = JSON.stringify({ inboxId, channel });
    return `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${encodeURIComponent(state)}&response_type=code`;
  }

  async handleOAuthCallback(code: string, state: string): Promise<Inbox> {
    const { inboxId, channel } = JSON.parse(state);
    const baseUrl = this.configService.get<string>('META_BASE_URL') || 'http://localhost:3001';
    const redirectUri = `${baseUrl}/api/chats/oauth/callback`;

    if (channel === 'instagram') {
      // Instagram OAuth: exchange code using Instagram app credentials
      const igAppId = this.configService.get<string>('INSTAGRAM_APP_ID');
      const igAppSecret = this.configService.get<string>('INSTAGRAM_APP_SECRET');

      // Exchange code for short-lived token
      const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: igAppId!,
          client_secret: igAppSecret!,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code,
        }),
      });
      const tokenData = await tokenRes.json();

      if (!tokenData.access_token) {
        console.error('[Instagram OAuth] Token exchange failed:', tokenData);
        throw new Error('Failed to exchange code for token');
      }

      // Exchange for long-lived token
      const longRes = await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${igAppSecret}&access_token=${tokenData.access_token}`);
      const longData = await longRes.json();
      const igLongToken = longData.access_token || tokenData.access_token;

      // Get Instagram user info
      const inbox = await this.findInboxById(inboxId);
      const igUserId = tokenData.user_id;

      try {
        const profileRes = await fetch(`https://graph.instagram.com/v21.0/${igUserId}?fields=username,name,profile_picture_url&access_token=${igLongToken}`);
        const profile = await profileRes.json();
        inbox.channelName = profile.username ? `@${profile.username}` : null;
        inbox.metadata = { ...inbox.metadata, instagramUserId: igUserId, instagramUsername: profile.username };
      } catch (err) {
        console.error('[Instagram OAuth] Failed to get profile:', err);
      }

      inbox.accessToken = igLongToken;
      inbox.pageId = String(igUserId); // Use IG user ID as pageId for message routing
      inbox.status = 'connected';

      // Subscribe Instagram account to webhook for messages
      try {
        await fetch(`https://graph.instagram.com/v21.0/${igUserId}/subscribed_apps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscribed_fields: ['messages'], access_token: igLongToken }),
        });
        console.log(`[Instagram] Subscribed account ${igUserId} to webhook`);
      } catch (err) {
        console.error('[Instagram] Failed to subscribe to webhook:', err);
      }

      return this.inboxRepo.save(inbox);
    }

    // Facebook OAuth (Messenger/WhatsApp)
    const appId = this.configService.get<string>('META_APP_ID');
    const appSecret = this.configService.get<string>('META_APP_SECRET');

    // Exchange code for short-lived token
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error('[OAuth] Token exchange failed:', tokenData);
      throw new Error('Failed to exchange code for token');
    }

    // Exchange for long-lived token
    const fbLongUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`;
    const fbLongRes = await fetch(fbLongUrl);
    const fbLongData = await fbLongRes.json();
    const fbLongToken = fbLongData.access_token || tokenData.access_token;

    const inbox = await this.findInboxById(inboxId);

    if (channel === 'whatsapp') {
      // Get WABA info
      const wabaRes = await fetch(`https://graph.facebook.com/v21.0/me/businesses?access_token=${fbLongToken}`);
      const wabaData = await wabaRes.json();
      // Try to get WABA and phone number
      // For now store the token — user can configure phone number separately
      inbox.accessToken = fbLongToken;
      inbox.status = 'connected';
      inbox.metadata = { ...inbox.metadata, businesses: wabaData.data };
    } else if (channel === 'messenger') {
      // Get pages
      const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${fbLongToken}`);
      const pagesData = await pagesRes.json();
      const pages = pagesData.data || [];

      if (pages.length > 0) {
        const page = pages[0]; // Use first page — could let user pick
        inbox.pageId = page.id;
        inbox.accessToken = page.access_token; // Page token is already long-lived
        inbox.channelName = page.name;
        inbox.status = 'connected';

        if (channel === 'instagram') {
          // Get Instagram Business Account linked to this page
          try {
            const igRes = await fetch(`https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`);
            const igData = await igRes.json();
            if (igData.instagram_business_account?.id) {
              inbox.metadata = { ...inbox.metadata, instagramAccountId: igData.instagram_business_account.id };
              // Get Instagram username
              const igProfileRes = await fetch(`https://graph.facebook.com/v21.0/${igData.instagram_business_account.id}?fields=username,name&access_token=${page.access_token}`);
              const igProfile = await igProfileRes.json();
              inbox.channelName = igProfile.username ? `@${igProfile.username}` : page.name;
            }
          } catch (err) {
            console.error('[OAuth] Failed to get Instagram account:', err);
          }
        }

        // Subscribe page to webhook
        const subscribedFields = channel === 'messenger'
          ? ['messages', 'messaging_postbacks']
          : ['messages', 'messaging_postbacks'];

        await fetch(`https://graph.facebook.com/v21.0/${page.id}/subscribed_apps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: page.access_token,
            subscribed_fields: subscribedFields,
          }),
        });
      }
    }

    return this.inboxRepo.save(inbox);
  }

  // === WHATSAPP EMBEDDED SIGNUP ===

  async manualConnect(
    inboxId: string,
    data: { accessToken: string; phoneNumberId?: string; wabaId?: string; pageId?: string },
  ): Promise<Inbox> {
    const inbox = await this.findInboxById(inboxId);

    inbox.accessToken = data.accessToken;
    inbox.status = 'connected';

    if (data.phoneNumberId) inbox.phoneNumberId = data.phoneNumberId;
    if (data.wabaId) inbox.wabaId = data.wabaId;
    if (data.pageId) inbox.pageId = data.pageId;

    // Try to get phone display name for WhatsApp
    if (inbox.channel === 'whatsapp' && data.phoneNumberId) {
      try {
        const res = await fetch(
          `https://graph.facebook.com/v21.0/${data.phoneNumberId}?fields=display_phone_number,verified_name&access_token=${data.accessToken}`,
        );
        const phoneData = await res.json();
        inbox.channelName = phoneData.display_phone_number || phoneData.verified_name || null;
      } catch (error) {
        console.error('[Manual Connect] Error fetching phone info:', error);
      }

      // Subscribe WABA to webhook if we have wabaId
      if (data.wabaId) {
        try {
          await fetch(`https://graph.facebook.com/v21.0/${data.wabaId}/subscribed_apps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: data.accessToken }),
          });
          console.log(`[Manual Connect] Subscribed WABA ${data.wabaId} to webhook`);
        } catch (err) {
          console.error('[Manual Connect] Failed to subscribe WABA:', err);
        }
      }
    }

    return this.inboxRepo.save(inbox);
  }

  // === EMAIL SMTP ===

  async configureSmtp(inboxId: string, smtpConfig: { host: string; port: number; secure: boolean; user: string; pass: string; fromName: string; fromEmail: string; defaultSubject?: string }) {
    const inbox = await this.findInboxById(inboxId);
    inbox.metadata = {
      ...inbox.metadata,
      smtp: smtpConfig,
    };
    inbox.channelName = smtpConfig.fromEmail;
    inbox.status = 'connected';
    await this.inboxRepo.save(inbox);
    return { status: 'configured', channelName: smtpConfig.fromEmail };
  }

  async testSmtp(smtpConfig: { host: string; port: number; secure: boolean; user: string; pass: string; fromName: string; fromEmail: string }) {
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port || 465,
        secure: smtpConfig.secure ?? true,
        auth: { user: smtpConfig.user, pass: smtpConfig.pass },
      });
      await transporter.verify();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async sendTestEmail(inboxId: string, options: { to: string; subject: string; html: string; variables?: Record<string, string>; fromName?: string }) {
    const inbox = await this.findInboxById(inboxId);
    const smtpConfig = inbox.metadata?.smtp;
    if (!smtpConfig?.host || !smtpConfig?.user || !smtpConfig?.pass) {
      return { success: false, error: 'SMTP no configurado para esta bandeja' };
    }

    // Replace variables in subject and html
    let { subject, html } = options;
    if (options.variables) {
      for (const [key, value] of Object.entries(options.variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        subject = subject.replace(regex, value);
        html = html.replace(regex, value);
      }
    }

    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port || 465,
        secure: smtpConfig.secure ?? true,
        auth: { user: smtpConfig.user, pass: smtpConfig.pass },
      });

      const senderName = options.fromName?.trim() || smtpConfig.fromName || 'Smartee';
      const from = `"${senderName}" <${smtpConfig.fromEmail || smtpConfig.user}>`;
      await transporter.sendMail({ from, to: options.to, subject, html });
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async handleWhatsAppEmbeddedSignup(code: string, inboxId: string): Promise<Inbox> {
    const appId = this.configService.get<string>('META_APP_ID');
    const appSecret = this.configService.get<string>('META_APP_SECRET');

    // Exchange code for token
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error('[WhatsApp Embedded] Token exchange failed:', tokenData);
      throw new Error('Failed to exchange code for token');
    }

    // Exchange for a long-lived token (60 days, auto-renewable by the system user)
    let accessToken = tokenData.access_token;
    try {
      const longLivedRes = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${accessToken}`,
      );
      const longLivedData = await longLivedRes.json();
      if (longLivedData.access_token) {
        accessToken = longLivedData.access_token;
        console.log('[WhatsApp Embedded] Exchanged for long-lived token');
      } else {
        console.warn('[WhatsApp Embedded] Long-lived token exchange failed, using short-lived:', longLivedData);
      }
    } catch (err) {
      console.warn('[WhatsApp Embedded] Long-lived token exchange error:', err);
    }
    let wabaId: string | null = null;
    let phoneNumberId: string | null = null;
    let phoneDisplay: string | null = null;

    try {
      // Debug token to get granular scopes and target IDs
      const sharedRes = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`);
      const sharedData = await sharedRes.json();
      const granularScopes = sharedData.data?.granular_scopes || [];

      const waScope = granularScopes.find((s: any) => s.scope === 'whatsapp_business_management');
      if (waScope?.target_ids?.length > 0) wabaId = waScope.target_ids[0];

      const msgScope = granularScopes.find((s: any) => s.scope === 'whatsapp_business_messaging');
      if (msgScope?.target_ids?.length > 0) {
        // This might be phone number ID or WABA ID depending on the token type
        // We'll verify it below by fetching phone numbers from WABA
        phoneNumberId = msgScope.target_ids[0];
      }

      // Always fetch phone numbers from WABA to get the correct phone number ID
      if (wabaId) {
        const phonesRes = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${accessToken}`);
        const phonesData = await phonesRes.json();
        if (phonesData.data?.length > 0) {
          phoneNumberId = phonesData.data[0].id;
          phoneDisplay = phonesData.data[0].display_phone_number || phonesData.data[0].verified_name;
        }
      }

      if (phoneNumberId && !phoneDisplay) {
        const phoneRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}?fields=display_phone_number,verified_name&access_token=${accessToken}`);
        const phoneData = await phoneRes.json();
        phoneDisplay = phoneData.display_phone_number || phoneData.verified_name || null;
      }
    } catch (error) {
      console.error('[WhatsApp Embedded] Error getting WABA info:', error);
    }

    const inbox = await this.findInboxById(inboxId);
    inbox.accessToken = accessToken;
    inbox.wabaId = wabaId;
    inbox.phoneNumberId = phoneNumberId;
    inbox.channelName = phoneDisplay;
    inbox.status = phoneNumberId ? 'connected' : 'pending';
    inbox.metadata = { ...inbox.metadata, embeddedSignup: true };

    // Subscribe WABA to webhook
    if (wabaId) {
      try {
        await fetch(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: accessToken }),
        });
        console.log(`[WhatsApp Embedded] Subscribed WABA ${wabaId} to webhook`);
      } catch (err) {
        console.error('[WhatsApp Embedded] Failed to subscribe:', err);
      }
    }

    return this.inboxRepo.save(inbox);
  }

  // === WEBHOOK ===

  async handleWebhook(body: any): Promise<void> {
    console.log('[Webhook] Received:', JSON.stringify(body).substring(0, 500));
    const entries = body.entry || [];

    for (const entry of entries) {
      // WhatsApp webhook
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === 'messages' && change.value?.messages) {
            await this.handleWhatsAppMessages(change.value);
          }
          // Status updates
          if (change.field === 'messages' && change.value?.statuses) {
            await this.handleWhatsAppStatuses(change.value.statuses);
          }
          // Instagram messages (new API format)
          if (change.field === 'messages' && change.value?.sender && change.value?.message) {
            await this.handleInstagramMessage(entry.id, change.value);
          }
        }
      }

      // Messenger webhook (legacy format with entry.messaging)
      if (entry.messaging) {
        for (const event of entry.messaging) {
          if (event.message) {
            await this.handleMessengerMessage(entry.id, event);
          }
        }
      }
    }
  }

  private async handleWhatsAppMessages(value: any): Promise<void> {
    const phoneNumberId = value.metadata?.phone_number_id;
    if (!phoneNumberId) return;

    const inbox = await this.inboxRepo.findOne({ where: { phoneNumberId } });
    if (!inbox) {
      console.warn(`[Webhook] No inbox found for phone_number_id: ${phoneNumberId}`);
      return;
    }

    for (const msg of value.messages) {
      const contactPhone = msg.from;
      const contactName = value.contacts?.[0]?.profile?.name || contactPhone;

      // Find or create conversation
      let conversation = await this.conversationRepo.findOne({
        where: { inboxId: inbox.id, contactId: contactPhone },
      });

      if (!conversation) {
        conversation = this.conversationRepo.create({
          inboxId: inbox.id,
          contactId: contactPhone,
          contactName,
          status: 'open',
        });
        conversation = await this.conversationRepo.save(conversation);
      }

      // Determine message type and content
      let messageType = msg.type || 'text';
      let content: string | null = null;
      let mediaUrl: string | null = null;
      let mediaMimeType: string | null = null;

      // Log non-text messages for debugging
      if (messageType !== 'text') {
        console.log(`[Webhook] Message type: ${messageType}, payload:`, JSON.stringify(msg).substring(0, 500));
      }

      switch (messageType) {
        case 'text':
          content = msg.text?.body || '';
          break;
        case 'button':
          // User tapped a quick reply button from a template
          // Meta sends: msg.button.text or msg.button.payload
          content = msg.button?.text || msg.button?.payload || msg.text?.body || '[button]';
          messageType = 'text';
          break;
        case 'interactive':
          // User tapped an interactive button or list item
          if (msg.interactive?.type === 'button_reply') {
            content = msg.interactive.button_reply?.title || '[interactive]';
          } else if (msg.interactive?.type === 'list_reply') {
            content = msg.interactive.list_reply?.title || '[interactive]';
          } else {
            content = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '[interactive]';
          }
          messageType = 'text';
          break;
        case 'image':
        case 'video':
        case 'audio':
        case 'document':
        case 'sticker': {
          content = msg[messageType]?.caption || null;
          const mediaId = msg[messageType]?.id || null;
          mediaMimeType = msg[messageType]?.mime_type || null;
          const originalFilename = msg[messageType]?.filename || null;

          // Download and store in Firebase
          if (mediaId && inbox.accessToken) {
            const stored = await this.mediaStorageService.processWhatsAppMedia(
              mediaId,
              inbox.accessToken,
              {
                channel: 'whatsapp',
                tenantId: inbox.tenantId,
                conversationId: conversation.id,
                messageId: msg.id,
                mimeType: mediaMimeType || undefined,
                filename: originalFilename || undefined,
              },
            );
            mediaUrl = stored?.url || null;
            if (stored?.mimeType) mediaMimeType = stored.mimeType;
          }
          break;
        }
        case 'location':
          content = `📍 ${msg.location?.latitude}, ${msg.location?.longitude}`;
          break;
        default:
          content = `[${messageType}]`;
      }

      // Save message
      const replyToExternalId = msg.context?.id || null;
      const message = this.messageRepo.create({
        conversationId: conversation.id,
        direction: 'inbound',
        messageType,
        content,
        mediaUrl,
        mediaMimeType,
        externalId: msg.id,
        replyToExternalId,
        status: 'delivered',
      });
      await this.messageRepo.save(message);

      // Update conversation
      conversation.lastMessage = content || `[${messageType}]`;
      conversation.lastMessageAt = new Date();
      conversation.lastMessageSource = null;
      conversation.unreadCount = (conversation.unreadCount || 0) + 1;
      if (contactName && !conversation.contactName) conversation.contactName = contactName;

      // Link conversation to client record
      if (!conversation.recordId) {
        const record = await this.findOrCreateRecordByPhone(contactPhone, inbox.tenantId, contactName, inbox.id);
        conversation.recordId = record.id;
      } else {
        // Update lastContactAt on existing record
        await this.clientRecordRepo.update(conversation.recordId, { lastContactAt: new Date() });
      }

      // Mark ad tracking if from Meta ad
      if (msg.referral) {
        conversation.hasAdTracking = true;
        conversation.adPlatform = 'meta';
        // Also mark the client record
        if (conversation.recordId) {
          this.clientRecordRepo.query(
            `UPDATE clients SET
              has_ad_tracking = true,
              ad_first_platform = COALESCE(ad_first_platform, 'meta'),
              ad_last_platform = 'meta',
              ad_touchpoints = COALESCE(ad_touchpoints, 0) + 1
            WHERE id = $1`,
            [conversation.recordId],
          ).catch(() => {});
        }
      }

      // Check if message contains a tracking code (from pixel/link tracker)
      if (!msg.referral && content) {
        const platform = await this.conversionsService.matchAndLinkTrackingCode(inbox.tenantId, content, conversation.recordId!).catch(() => null);
        if (platform) {
          conversation.hasAdTracking = true;
          conversation.adPlatform = platform;
        }
      }

      await this.conversationRepo.save(conversation);

      // Capture ad attribution if message comes from a Meta ad (click-to-WhatsApp)
      if (msg.referral) {
        const referral = msg.referral;
        this.conversionsService.trackEvent({
          tenantId: inbox.tenantId,
          recordId: conversation.recordId!,
          platform: 'meta',
          clickId: referral.ctwa_clid || undefined,
          clickIdType: referral.ctwa_clid ? 'fbclid' : undefined,
          utmSource: 'meta',
          utmMedium: 'paid',
          utmCampaign: referral.headline || referral.source_id || undefined,
          metadata: {
            sourceType: referral.source_type,
            sourceId: referral.source_id,
            sourceUrl: referral.source_url,
            headline: referral.headline,
            body: referral.body,
            mediaType: referral.media_type,
            mediaUrl: referral.image_url || referral.video_url,
            ctwaClid: referral.ctwa_clid,
            conversationId: conversation.id,
            inboxId: inbox.id,
            phone: contactPhone,
          },
        }).catch((err) => console.warn('[Webhook] Failed to track ad event:', err));
      }

      // Emit real-time events
      this.chatsGateway.emitNewMessage(inbox.tenantId, conversation.id, message);
      this.chatsGateway.emitConversationUpdate(inbox.tenantId, conversation);

      // Notify inbox collaborators about the new inbound message
      this.notificationsService.getInboxCollaboratorUserIds(inbox.id).then(async (userIds) => {
        // Resolve contact name from record
        let contactLabel = conversation.contactName || contactPhone || 'Contacto';
        if (conversation.recordId) {
          const record = await this.clientRecordRepo.findOne({ where: { id: conversation.recordId } });
          if (record) {
            contactLabel = record.fullName || record.firstName || conversation.contactName || contactPhone || 'Contacto';
          }
        }
        for (const uid of userIds) {
          // Only create notification if user doesn't already have an unread one for this conversation
          this.notificationsService.findUnreadByConversation(uid, conversation.id).then((existing) => {
            if (!existing) {
              this.notificationsService.notify({
                tenantId: inbox.tenantId,
                userId: uid,
                type: 'message_received',
                title: `Nuevo mensaje de ${contactLabel}`,
                body: (content || `[${messageType}]`).substring(0, 120),
                link: `/${inbox.tenantId}/comunicaciones/conversaciones/${conversation.id}`,
                metadata: { conversationId: conversation.id, inboxId: inbox.id, messageType },
              }).catch(() => {});
            } else {
              // Update existing notification body with latest message
              this.notificationsService.updateBody(existing.id, (content || `[${messageType}]`).substring(0, 120)).catch(() => {});
            }
          }).catch(() => {});
        }
      }).catch(() => {});

      // Dispatch webhooks with full context
      const contactRecord = conversation.recordId ? await this.clientRecordRepo.findOne({ where: { id: conversation.recordId } }) : null;
      this.webhooksService.dispatch(inbox.tenantId, 'message_created', {
        message,
        conversation: { id: conversation.id, contactId: conversation.contactId, contactName: conversation.contactName, status: conversation.status, recordId: conversation.recordId, inboxId: conversation.inboxId, lastMessage: conversation.lastMessage, lastMessageAt: conversation.lastMessageAt },
        contact: contactRecord,
        inbox: { id: inbox.id, name: inbox.name, channel: inbox.channel },
      }).catch(() => {});

      // Trigger bot auto-reply if a bot is assigned
      this.scheduleBotReply(inbox, conversation, content).catch((err) => {
        console.error('[Bot Auto-Reply] Failed:', err?.message || err);
      });
    }
  }

  private async findOrCreateRecordByPhone(phone: string, tenantId: string, contactName?: string, inboxId?: string): Promise<ClientRecord> {
    // Normalize phone: remove + prefix if present for search
    const normalizedPhone = phone.replace(/^\+/, '');

    // Search by phone in this tenant's records
    let record = await this.clientRecordRepo
      .createQueryBuilder('client')
      .where('client.tenant_id = :tenantId', { tenantId })
      .andWhere("REPLACE(client.phone, '+', '') = :phone", { phone: normalizedPhone })
      .getOne();

    if (!record) {
      // Create a new record with the info we have
      const nameParts = (contactName || '').split(' ');
      record = this.clientRecordRepo.create({
        tenantId,
        phone,
        firstName: nameParts[0] || null,
        lastName: nameParts.slice(1).join(' ') || null,
        status: 'active',
        channelSource: inboxId || 'whatsapp',
        lastContactAt: new Date(),
      } as Partial<ClientRecord>);
      record = await this.clientRecordRepo.save(record);
      console.log(`[Chat] Created new record for phone ${phone} in tenant ${tenantId}`);
    } else {
      // Restore if soft-deleted
      if (record.deletedAt) {
        record.deletedAt = null;
        record.status = 'active';
      }
      record.lastContactAt = new Date();
      await this.clientRecordRepo.save(record);
    }

    return record;
  }

  private async handleWhatsAppStatuses(statuses: any[]): Promise<void> {
    for (const status of statuses) {
      if (status.id) {
        const message = await this.messageRepo.findOne({
          where: { externalId: status.id },
          relations: { conversation: { inbox: true } },
        });
        if (message) {
          message.status = status.status; // sent, delivered, read, failed
          await this.messageRepo.save(message);

          // If failed, create a system note with the error details
          if (status.status === 'failed') {
            const errorDetail = status.errors?.[0]?.message || status.errors?.[0]?.title || 'Error desconocido de WhatsApp';
            const errorCode = status.errors?.[0]?.code ? ` (código: ${status.errors[0].code})` : '';
            console.error('[Webhook] WhatsApp message failed:', JSON.stringify({ externalId: status.id, errors: status.errors }));
            const tenantId = message.conversation?.inbox?.tenantId;
            await this.createSystemNote(
              message.conversationId,
              `⚠️ Mensaje no entregado: ${errorDetail}${errorCode}`,
              tenantId,
            );
          }

          // Emit status update to frontend
          this.chatsGateway.emitMessageStatus(message.conversationId, message.id, status.status);
        }
      }
    }
  }

  private async handleMessengerMessage(pageId: string, event: any): Promise<void> {
    // Try finding inbox by pageId (Messenger) or by instagram account ID stored in metadata
    let inbox = await this.inboxRepo.findOne({ where: { pageId } });
    if (!inbox) {
      // Try Instagram: entry.id might be the Instagram-scoped page ID
      const allInboxes = await this.inboxRepo.find({ where: { channel: 'instagram' } });
      inbox = allInboxes.find((i) => i.pageId === pageId || (i.metadata as any)?.instagramAccountId === pageId) || null;
    }
    if (!inbox) return;

    const senderId = event.sender?.id;
    if (!senderId) return;

    let conversation = await this.conversationRepo.findOne({
      where: { inboxId: inbox.id, contactId: senderId },
    });

    if (!conversation) {
      // Try to get sender name and profile picture
      let contactName = senderId;
      let contactAvatar: string | null = null;
      try {
        const res = await fetch(`https://graph.facebook.com/v21.0/${senderId}?fields=name,profile_pic&access_token=${inbox.accessToken}`);
        const data = await res.json();
        if (data.name) contactName = data.name;
        if (data.profile_pic) contactAvatar = data.profile_pic;
      } catch {}

      conversation = this.conversationRepo.create({
        inboxId: inbox.id,
        contactId: senderId,
        contactName,
        contactAvatar,
        status: 'open',
      });
      conversation = await this.conversationRepo.save(conversation);
    }

    const content = event.message.text || '';
    let messageType = 'text';
    let mediaUrl: string | null = null;

    if (event.message.attachments?.length > 0) {
      const attachment = event.message.attachments[0];
      if (attachment.type === 'image') messageType = 'image';
      else if (attachment.type === 'video') messageType = 'video';
      else if (attachment.type === 'audio') messageType = 'audio';
      else if (attachment.type === 'file') messageType = 'document';
      mediaUrl = attachment.payload?.url || null;
    }

    // Capture reply_to reference
    const replyToExternalId = event.message.reply_to?.mid || null;

    const message = this.messageRepo.create({
      conversationId: conversation.id,
      direction: 'inbound',
      messageType,
      content: content || null,
      mediaUrl,
      externalId: event.message.mid,
      replyToExternalId,
      status: 'delivered',
    });
    await this.messageRepo.save(message);

    conversation.lastMessage = content || `[${messageType}]`;
    conversation.lastMessageAt = new Date();
    conversation.unreadCount = (conversation.unreadCount || 0) + 1;

    // Link conversation to client record (Messenger)
    if (!conversation.recordId) {
      const contactName = conversation.contactName || senderId;
      const nameParts = contactName.split(' ');

      // Search by Messenger PSID in customData
      let record = await this.clientRecordRepo
        .createQueryBuilder('client')
        .where('client.tenant_id = :tenantId', { tenantId: inbox.tenantId })
        .andWhere("client.custom_data ->> 'messengerPsid' = :psid", { psid: senderId })
        .getOne();

      if (!record) {
        record = this.clientRecordRepo.create({
          tenantId: inbox.tenantId,
          firstName: nameParts[0] || null,
          lastName: nameParts.slice(1).join(' ') || null,
          avatarUrl: conversation.contactAvatar || null,
          status: 'active',
          channelSource: inbox.id,
          lastContactAt: new Date(),
          customData: { messengerPsid: senderId },
        } as Partial<ClientRecord>);
        record = await this.clientRecordRepo.save(record);
      } else {
        record.lastContactAt = new Date();
        if (!record.avatarUrl && conversation.contactAvatar) {
          record.avatarUrl = conversation.contactAvatar;
        }
        await this.clientRecordRepo.save(record);
      }
      conversation.recordId = record.id;
    } else {
      await this.clientRecordRepo.update(conversation.recordId, { lastContactAt: new Date() });
    }

    await this.conversationRepo.save(conversation);

    // Emit real-time events
    this.chatsGateway.emitNewMessage(inbox.tenantId, conversation.id, message);
    this.chatsGateway.emitConversationUpdate(inbox.tenantId, conversation);

    // Trigger bot auto-reply if a bot is assigned
    this.scheduleBotReply(inbox, conversation, content).catch(() => {});
  }

  private async handleInstagramMessage(igAccountId: string, value: any): Promise<void> {
    const senderId = value.sender?.id;
    const recipientId = value.recipient?.id;
    if (!senderId || !recipientId) return;

    // Find inbox by the Instagram account ID (stored as pageId)
    let inbox = await this.inboxRepo.findOne({ where: { pageId: recipientId, channel: 'instagram' } });
    if (!inbox) {
      inbox = await this.inboxRepo.findOne({ where: { pageId: igAccountId, channel: 'instagram' } });
    }
    if (!inbox) {
      console.warn(`[Webhook] No Instagram inbox found for account: ${recipientId} or ${igAccountId}`);
      return;
    }

    // Find or create conversation
    let conversation = await this.conversationRepo.findOne({
      where: { inboxId: inbox.id, contactId: senderId },
    });

    if (!conversation) {
      // Try to get sender name and profile picture via Instagram API
      let contactName = senderId;
      let contactAvatar: string | null = null;
      try {
        const res = await fetch(`https://graph.instagram.com/v21.0/${senderId}?fields=username,name,profile_picture_url&access_token=${inbox.accessToken}`);
        const data = await res.json();
        contactName = data.username ? `@${data.username}` : data.name || senderId;
        if (data.profile_picture_url) contactAvatar = data.profile_picture_url;
      } catch {}

      conversation = this.conversationRepo.create({
        inboxId: inbox.id,
        contactId: senderId,
        contactName,
        contactAvatar,
        status: 'open',
      });
      conversation = await this.conversationRepo.save(conversation);
    }

    const msg = value.message;
    let content = msg.text || null;
    let messageType = 'text';
    let mediaUrl: string | null = null;

    if (msg.attachments?.length > 0) {
      const attachment = msg.attachments[0];
      if (attachment.type === 'image') messageType = 'image';
      else if (attachment.type === 'video') messageType = 'video';
      else if (attachment.type === 'audio') messageType = 'audio';
      else messageType = 'document';
      mediaUrl = attachment.payload?.url || null;
    }

    const replyToExternalId = msg.reply_to?.mid || null;

    const message = this.messageRepo.create({
      conversationId: conversation.id,
      direction: 'inbound',
      messageType,
      content,
      mediaUrl,
      externalId: msg.mid,
      replyToExternalId,
      status: 'delivered',
    });
    await this.messageRepo.save(message);

    conversation.lastMessage = content || `[${messageType}]`;
    conversation.lastMessageAt = new Date();
    conversation.unreadCount = (conversation.unreadCount || 0) + 1;
    await this.conversationRepo.save(conversation);

    // Emit real-time events
    this.chatsGateway.emitNewMessage(inbox.tenantId, conversation.id, message);
    this.chatsGateway.emitConversationUpdate(inbox.tenantId, conversation);

    // Trigger bot auto-reply if a bot is assigned
    this.scheduleBotReply(inbox, conversation, content).catch(() => {});
  }

  // === BOT AUTO-REPLY ===

  private async scheduleBotReply(inbox: Inbox, conversation: any, content: string | null): Promise<void> {
    if (!inbox.botId || !content) return;

    const bot = await this.botsService.findOne(inbox.botId);
    if (!bot || bot.status !== 'active') return;

    const delay = (bot.replyDelay ?? 4) * 1000; // default 4 seconds

    // If delay is 0, respond immediately
    if (delay <= 0) {
      return this.triggerBotReply(inbox, conversation, content);
    }

    const conversationId = conversation.id;

    // Cancel existing timer for this conversation
    const existing = this.botReplyTimers.get(conversationId);
    if (existing) clearTimeout(existing);

    // Set new timer
    const timer = setTimeout(() => {
      this.botReplyTimers.delete(conversationId);
      this.triggerBotReply(inbox, conversation, content).catch((err) => {
        console.error('[Bot Auto-Reply] Debounced reply failed:', err?.message || err);
      });
    }, delay);

    this.botReplyTimers.set(conversationId, timer);
  }

  private async triggerBotReply(inbox: Inbox, conversation: any, inboundContent: string | null): Promise<void> {
    if (!inbox.botId || !inboundContent) return;

    try {
      // Verify bot exists and is active
      const bot = await this.botsService.findOne(inbox.botId);
      if (!bot || bot.status !== 'active') return;

      // Check conversation bot status
      if (conversation.botStatus === 'handed_off') return;

      // Check credits before calling AI
      try {
        const balance = await this.billingService.getBalance(inbox.tenantId);
        if (balance && balance.available <= 0) {
          await this.createSystemNote(conversation.id, '⚠️ Bot pausado: créditos insuficientes.', inbox.tenantId);
          conversation.botStatus = 'paused';
          await this.conversationRepo.save(conversation);
          return;
        }
      } catch {}

      // Check bot schedule
      if (bot.schedule?.enabled) {
        const now = new Date();
        const tz = bot.schedule.timezone || 'America/Bogota';
        const localTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
        const dayNames = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
        const dayConfig = bot.schedule.days?.[dayNames[localTime.getDay()]];

        if (!dayConfig?.active) {
          if (bot.schedule.offMessage) await this.sendMessage(conversation.id, bot.schedule.offMessage, 'text', undefined);
          return;
        }

        const currentMinutes = localTime.getHours() * 60 + localTime.getMinutes();
        const [startH, startM] = (dayConfig.start || '00:00').split(':').map(Number);
        const [endH, endM] = (dayConfig.end || '23:59').split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
          if (bot.schedule.offMessage) await this.sendMessage(conversation.id, bot.schedule.offMessage, 'text', undefined);
          return;
        }
      }

      // Check rate limit
      if (bot.rateLimit && bot.rateLimit.maxMessages > 0) {
        const windowStart = new Date(Date.now() - bot.rateLimit.windowMinutes * 60 * 1000);
        const recentBotMessages = await this.messageRepo.count({
          where: {
            conversationId: conversation.id,
            direction: 'outbound',
            botId: inbox.botId,
            createdAt: MoreThan(windowStart),
          },
        });
        if (recentBotMessages >= bot.rateLimit.maxMessages) {
          if (bot.rateLimit.limitMessage) await this.sendMessage(conversation.id, bot.rateLimit.limitMessage, 'text', undefined);
          return;
        }
      }

      // Check handoff keywords
      if (bot.handoffKeywords && bot.handoffKeywords.length > 0) {
        const lowerContent = inboundContent.toLowerCase();
        const triggered = bot.handoffKeywords.some((kw) => lowerContent.includes(kw.toLowerCase()));
        if (triggered) {
          // Hand off to human
          conversation.botStatus = 'handed_off';
          await this.conversationRepo.save(conversation);

          const handoffMsg = bot.handoffMessage || 'Te conecto con un agente humano. Un momento por favor.';
          await this.sendMessage(conversation.id, handoffMsg, 'text', undefined);
          await this.createSystemNote(conversation.id, '🤖→👤 Bot desactivado: el contacto pidió un agente humano.', inbox.tenantId);
          return;
        }
      }

      // Check max bot messages limit
      if (bot.maxBotMessages > 0) {
        const botMessageCount = await this.messageRepo.count({
          where: { conversationId: conversation.id, direction: 'outbound', botId: inbox.botId },
        });
        if (botMessageCount >= bot.maxBotMessages) {
          conversation.botStatus = 'paused';
          await this.conversationRepo.save(conversation);
          await this.createSystemNote(conversation.id, `🤖 Bot pausado: se alcanzó el límite de ${bot.maxBotMessages} mensajes.`, inbox.tenantId);
          return;
        }
      }

      // Load recent messages for context (last N messages, ordered chronologically)
      const contextLimit = bot.contextMessages || 20;
      const recentMessages = await this.messageRepo.find({
        where: { conversationId: conversation.id },
        order: { createdAt: 'DESC' },
        take: contextLimit,
      });
      recentMessages.reverse(); // Back to chronological order

      // Build messages array for the bot
      const messages = recentMessages.map((m) => ({
        role: m.direction === 'inbound' ? 'user' : 'assistant',
        content: m.content || '',
      })).filter((m) => m.content);

      // Build collectedData from existing record to avoid re-asking
      let collectedData: Record<string, string> | undefined;
      if (bot.dataCollectionEnabled && conversation.recordId) {
        const record = await this.clientRecordRepo.findOne({ where: { id: conversation.recordId } });
        if (record) {
          collectedData = {};
          const standardFields: Record<string, string> = {
            firstName: record.firstName,
            lastName: record.lastName,
            email: record.email,
            phone: record.phone,
            company: record.company,
            city: record.city,
            jobTitle: record.jobTitle,
            address: record.address,
          };
          for (const f of bot.dataCollectionFields) {
            const key = f.field;
            if (key.startsWith('custom:')) {
              const customKey = key.replace('custom:', '');
              const val = record.customData?.[customKey];
              if (val) collectedData[key] = String(val);
            } else if (standardFields[key]) {
              collectedData[key] = standardFields[key];
            }
          }
        }
      }

      // Get bot response
      const response = await this.botsService.chat(inbox.botId, messages, collectedData);
      if (!response?.content) return;

      // Log tool executions as system notes (before the bot reply)
      if (response.toolsExecuted && response.toolsExecuted.length > 0) {
        for (const t of response.toolsExecuted) {
          if (t.name === 'save_contact_data') continue;
          if (t.name === 'handoff_to_human' || t.name === 'mark_resolved') continue;
          await this.createSystemNote(conversation.id, `🔧 Herramienta ejecutada: ${t.name}`, inbox.tenantId);
        }
      }

      // Send the bot reply through the normal send flow
      const sentMessage = await this.sendMessage(conversation.id, response.content, 'text', undefined);

      // Attach bot metadata to the saved message
      sentMessage.botId = inbox.botId;
      if (response.usage) {
        sentMessage.aiUsage = {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          model: response.usage.model || 'unknown',
          cost: response.usage.cost ?? 0,
          credits: response.usage.credits ?? 0,
        };
        sentMessage.creditsCost = response.usage.credits ?? 0;
      }
      await this.messageRepo.save(sentMessage);

      // Handle bot self-handoff (bot decided to transfer or resolved)
      if (response.handedOff) {
        conversation.botStatus = 'handed_off';
        await this.conversationRepo.save(conversation);

        const wasResolved = response.toolsExecuted?.some((t) => t.name === 'mark_resolved');
        if (wasResolved) {
          await this.createSystemNote(conversation.id, '✅ Bot: objetivo cumplido, conversación resuelta.', inbox.tenantId);

          // Execute on-resolved actions
          if (bot.onResolvedActions && conversation.recordId) {
            const record = await this.clientRecordRepo.findOne({ where: { id: conversation.recordId } });
            if (record) {
              if (bot.onResolvedActions.changeStatus) {
                const prevStatus = record.status;
                record.status = bot.onResolvedActions.changeStatus;
                // Create timeline activity
                this.activityRepo.save(this.activityRepo.create({
                  tenantId: inbox.tenantId,
                  recordId: record.id,
                  type: 'status_changed',
                  description: `Estado cambiado a ${bot.onResolvedActions.changeStatus} (por bot "${bot.name}")`,
                  metadata: { from: prevStatus, to: bot.onResolvedActions.changeStatus, botId: bot.id, botName: bot.name },
                })).catch(() => {});
              }
              if (bot.onResolvedActions.assignTeamId) {
                record.assignedTeamId = bot.onResolvedActions.assignTeamId;
              }
              await this.clientRecordRepo.save(record);
            }
            // Add labels to conversation
            if (bot.onResolvedActions.addTags && bot.onResolvedActions.addTags.length > 0) {
              const existingLabels = conversation.labelIds || [];
              conversation.labelIds = [...new Set([...existingLabels, ...bot.onResolvedActions.addTags])];
              await this.conversationRepo.save(conversation);
            }
          }
        } else {
          await this.createSystemNote(conversation.id, '🤖→👤 Bot desactivado: transferido a un agente humano.', inbox.tenantId);
        }
      }

      // Handle extracted data — update CRM record and insert system note
      if (response.extractedData && Object.keys(response.extractedData).length > 0 && conversation.recordId) {
        const record = await this.clientRecordRepo.findOne({ where: { id: conversation.recordId } });
        if (record) {
          const standardFieldMap: Record<string, string> = {
            firstName: 'firstName',
            lastName: 'lastName',
            email: 'email',
            phone: 'phone',
            company: 'company',
            city: 'city',
            jobTitle: 'jobTitle',
            address: 'address',
            birthDate: 'birthDate',
          };

          const newData: Record<string, string> = {};

          for (const [key, value] of Object.entries(response.extractedData)) {
            if (!value) continue;

            if (key.startsWith('custom:')) {
              // Custom field — store in customData jsonb
              const customKey = key.replace('custom:', '');
              if (!record.customData) record.customData = {};
              if (!record.customData[customKey]) {
                record.customData[customKey] = value;
                newData[key] = value;
              }
            } else {
              // Standard field
              const recordField = standardFieldMap[key];
              if (recordField && !record[recordField]) {
                record[recordField] = value;
                newData[key] = value;
              }
            }
          }

          // Update fullName if we got first/last name
          if (newData.firstName || newData.lastName) {
            record.fullName = [record.firstName, record.lastName].filter(Boolean).join(' ');
          }

          if (Object.keys(newData).length > 0) {
            await this.clientRecordRepo.save(record);

            // Insert system note in conversation
            const fieldLabelMap = Object.fromEntries(
              (bot.dataCollectionFields || []).map((f) => [f.field, f.label]),
            );
            const collected = Object.entries(newData)
              .map(([k, v]) => `${fieldLabelMap[k] || k}: ${v}`)
              .join(', ');
            await this.createSystemNote(conversation.id, `📋 Dato recopilado: ${collected}`, inbox.tenantId);
          }
        }
      }
    } catch (err) {
      console.error(`[Bot Auto-Reply] Error for inbox ${inbox.id}:`, err?.message || err);
    }
  }

  // === CONVERSATIONS ===

  async getConversations(inboxId: string): Promise<Conversation[]> {
    return this.conversationRepo.find({
      where: { inboxId },
      relations: { inbox: true, record: true },
      order: { lastMessageAt: 'DESC' },
    });
  }

  async findConversationById(id: string): Promise<Conversation | null> {
    return this.conversationRepo.findOne({
      where: { id },
      relations: { inbox: true, record: true },
    });
  }

  async getUnreadCount(tenantId: string, userId?: string, role?: string): Promise<{ count: number }> {
    // Admin/Owner sees all unread for the tenant
    if (isAdminRole(role) || !userId) {
      const result = await this.conversationRepo.query(
        `SELECT COALESCE(SUM(conv.unread_count), 0) as count
         FROM conversations conv
         JOIN inboxes i ON i.id = conv.inbox_id
         WHERE i.tenant_id = $1 AND conv.unread_count > 0 AND conv.status = 'open'`,
        [tenantId],
      );
      return { count: parseInt(result[0]?.count || '0') };
    }

    // Agent sees unread only from inboxes they collaborate on (directly or via team)
    const result = await this.conversationRepo.query(
      `SELECT COALESCE(SUM(conv.unread_count), 0) as count
       FROM conversations conv
       JOIN inboxes i ON i.id = conv.inbox_id
       WHERE i.tenant_id = $1
         AND conv.unread_count > 0
         AND conv.status = 'open'
         AND (
           EXISTS (SELECT 1 FROM inbox_collaborators ic WHERE ic.inbox_id = i.id AND ic.type = 'user' AND ic.reference_id = $2)
           OR EXISTS (SELECT 1 FROM inbox_collaborators ic JOIN team_members tm ON tm.team_id = ic.reference_id WHERE ic.inbox_id = i.id AND ic.type = 'team' AND tm.user_id = $2)
         )`,
      [tenantId, userId],
    );
    return { count: parseInt(result[0]?.count || '0') };
  }

  async getConversationsPaginated(inboxId: string, opts: { limit: number; offset: number; labelIds?: string[]; hideCampaign?: boolean }): Promise<{ data: Conversation[]; total: number }> {
    const qb = this.conversationRepo.createQueryBuilder('conv')
      .leftJoinAndSelect('conv.inbox', 'inbox')
      .leftJoinAndSelect('conv.record', 'record')
      .where('conv.inbox_id = :inboxId', { inboxId })
      .orderBy('conv.last_message_at', 'DESC')
      .take(opts.limit)
      .skip(opts.offset);

    if (opts.labelIds && opts.labelIds.length > 0) {
      // Conversation must have at least one of the selected labels
      const conditions = opts.labelIds.map((_, i) => `conv.label_ids @> :lbl${i}`).join(' OR ');
      const params: Record<string, string> = {};
      opts.labelIds.forEach((id, i) => { params[`lbl${i}`] = JSON.stringify([id]); });
      qb.andWhere(`(${conditions})`, params);
    }

    if (opts.hideCampaign) {
      qb.andWhere("(conv.last_message_source != :campaignSource OR conv.last_message_source IS NULL)", { campaignSource: "campaign" });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async getConversationsByTenant(tenantId: string): Promise<Conversation[]> {
    const inboxes = await this.inboxRepo.find({ where: { tenantId } });
    if (inboxes.length === 0) return [];
    return this.conversationRepo.find({
      where: inboxes.map((i) => ({ inboxId: i.id })),
      relations: { inbox: true, record: true },
      order: { lastMessageAt: 'DESC' },
    });
  }

  async getConversationsByTenantPaginated(tenantId: string, opts: { limit: number; offset: number; labelIds?: string[]; hideCampaign?: boolean }): Promise<{ data: Conversation[]; total: number }> {
    const inboxes = await this.inboxRepo.find({ where: { tenantId } });
    if (inboxes.length === 0) return { data: [], total: 0 };
    const inboxIds = inboxes.map((i) => i.id);

    const qb = this.conversationRepo.createQueryBuilder('conv')
      .leftJoinAndSelect('conv.inbox', 'inbox')
      .leftJoinAndSelect('conv.record', 'record')
      .where('conv.inbox_id IN (:...inboxIds)', { inboxIds })
      .orderBy('conv.last_message_at', 'DESC')
      .take(opts.limit)
      .skip(opts.offset);

    if (opts.labelIds && opts.labelIds.length > 0) {
      const conditions = opts.labelIds.map((_, i) => `conv.label_ids @> :lbl${i}`).join(' OR ');
      const params: Record<string, string> = {};
      opts.labelIds.forEach((id, i) => { params[`lbl${i}`] = JSON.stringify([id]); });
      qb.andWhere(`(${conditions})`, params);
    }

    if (opts.hideCampaign) {
      qb.andWhere("(conv.last_message_source != :campaignSource OR conv.last_message_source IS NULL)", { campaignSource: "campaign" });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async getConversationsByInboxes(inboxIds: string[], opts: { limit: number; offset: number; labelIds?: string[]; hideCampaign?: boolean }): Promise<{ data: Conversation[]; total: number }> {
    if (inboxIds.length === 0) return { data: [], total: 0 };

    const qb = this.conversationRepo.createQueryBuilder('conv')
      .leftJoinAndSelect('conv.inbox', 'inbox')
      .leftJoinAndSelect('conv.record', 'record')
      .where('conv.inbox_id IN (:...inboxIds)', { inboxIds })
      .orderBy('conv.last_message_at', 'DESC')
      .take(opts.limit)
      .skip(opts.offset);

    if (opts.labelIds && opts.labelIds.length > 0) {
      const conditions = opts.labelIds.map((_, i) => `conv.label_ids @> :lbl${i}`).join(' OR ');
      const params: Record<string, string> = {};
      opts.labelIds.forEach((id, i) => { params[`lbl${i}`] = JSON.stringify([id]); });
      qb.andWhere(`(${conditions})`, params);
    }

    if (opts.hideCampaign) {
      qb.andWhere("(conv.last_message_source != :campaignSource OR conv.last_message_source IS NULL)", { campaignSource: "campaign" });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async getConversationsByRecordId(recordId: string, opts: { limit: number; offset: number }): Promise<{ data: Conversation[]; total: number }> {
    const [data, total] = await this.conversationRepo.findAndCount({
      where: { recordId },
      relations: { inbox: true, record: true },
      order: { lastMessageAt: 'DESC' },
      take: opts.limit,
      skip: opts.offset,
    });
    return { data, total };
  }

  // === MESSAGES ===

  async getMessages(conversationId: string, limit = 50, before?: string): Promise<Message[]> {
    const qb = this.messageRepo.createQueryBuilder('m')
      .leftJoinAndSelect('m.sender', 'sender')
      .where('m.conversation_id = :conversationId', { conversationId })
      .orderBy('m.created_at', 'DESC')
      .take(limit);

    if (before) {
      // Use the before message's created_at to get older messages
      const beforeMsg = await this.messageRepo.findOne({ where: { id: before } });
      if (beforeMsg) {
        qb.andWhere('m.created_at < :beforeDate', { beforeDate: beforeMsg.createdAt });
      }
    }

    const messages = await qb.getMany();
    return messages.reverse(); // Return in chronological order
  }

  async markAsRead(conversationId: string): Promise<void> {
    await this.conversationRepo.update(conversationId, { unreadCount: 0 });
  }

  async reactivateBot(conversationId: string, agentName?: string): Promise<{ botStatus: string }> {
    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId }, relations: { inbox: true } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    conversation.botStatus = 'active';
    await this.conversationRepo.save(conversation);
    await this.createSystemNote(conversationId, `🤖 Bot reactivado por ${agentName || 'un agente'}.`, conversation.inbox?.tenantId);
    this.chatsGateway.emitConversationUpdate(conversation.inbox?.tenantId, conversation);
    return { botStatus: 'active' };
  }

  async pauseBot(conversationId: string, agentName?: string): Promise<{ botStatus: string }> {
    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId }, relations: { inbox: true } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    conversation.botStatus = 'handed_off';
    await this.conversationRepo.save(conversation);
    await this.createSystemNote(conversationId, `🤖 Bot desactivado por ${agentName || 'un agente'}.`, conversation.inbox?.tenantId);
    this.chatsGateway.emitConversationUpdate(conversation.inbox?.tenantId, conversation);
    return { botStatus: 'handed_off' };
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.messageRepo.delete({ conversationId });
    await this.conversationRepo.delete(conversationId);
  }

  async clearMessages(conversationId: string): Promise<void> {
    await this.messageRepo.delete({ conversationId });
    // Update conversation to clear last message
    await this.conversationRepo.update(conversationId, { lastMessage: null, lastMessageAt: null } as any);
  }

  // === SEND MESSAGE ===

  async sendMessage(conversationId: string, content: string, messageType = 'text', senderId?: string, replyToExternalId?: string): Promise<Message> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
      relations: { inbox: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const inbox = conversation.inbox;

    // Check 24h messaging window for social channels
    if (['whatsapp', 'messenger', 'instagram'].includes(inbox.channel)) {
      const lastInbound = await this.messageRepo.findOne({
        where: { conversationId, direction: 'inbound' },
        order: { createdAt: 'DESC' },
      });
      if (!lastInbound) {
        throw new BadRequestException('No se puede enviar un mensaje libre sin un mensaje previo del contacto. Usa una plantilla para iniciar la conversación.');
      }
      const hoursSinceLastInbound = (Date.now() - new Date(lastInbound.createdAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastInbound > 24) {
        throw new BadRequestException('La ventana de conversación de 24 horas está cerrada. Usa una plantilla para reabrir la conversación.');
      }
    }

    let externalId: string | null = null;
    let sendError: string | null = null;

    if (inbox.channel === 'email') {
      // Send via SMTP configured in inbox metadata
      const smtpConfig = inbox.metadata?.smtp;
      if (!smtpConfig?.host || !smtpConfig?.user || !smtpConfig?.pass) {
        throw new Error('SMTP no configurado para esta bandeja');
      }

      // Get contact email from record
      const record = conversation.recordId
        ? await this.clientRecordRepo.findOne({ where: { id: conversation.recordId } })
        : null;
      const toEmail = record?.email || conversation.contactId;
      if (!toEmail || !toEmail.includes('@')) {
        throw new Error('El contacto no tiene email configurado');
      }

      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port || 465,
        secure: smtpConfig.secure ?? true,
        auth: { user: smtpConfig.user, pass: smtpConfig.pass },
      });

      const from = `"${smtpConfig.fromName || 'Smartee'}" <${smtpConfig.fromEmail || smtpConfig.user}>`;
      const subject = smtpConfig.defaultSubject || 'Mensaje de ' + (smtpConfig.fromName || 'Smartee');

      try {
        const info = await transporter.sendMail({
          from,
          to: toEmail,
          subject,
          html: content.replace(/\n/g, '<br>'),
          text: content,
        });
        externalId = info.messageId || null;
      } catch (err: any) {
        console.error('[Chat] Email send failed:', err);
        sendError = err.message || 'Error desconocido al enviar email';
      }
    } else if (inbox.channel === 'email_transaccional') {
      // Send via Mailgun API
      const emailConfig = await this.emailDomainService.findByInbox(inbox.id);
      if (!emailConfig || !emailConfig.domain) {
        throw new Error('Dominio de email no configurado para esta bandeja');
      }

      // Get contact email from record
      const record = conversation.recordId
        ? await this.clientRecordRepo.findOne({ where: { id: conversation.recordId } })
        : null;
      const toEmail = record?.email || conversation.contactId;
      if (!toEmail || !toEmail.includes('@')) {
        throw new Error('El contacto no tiene email configurado');
      }

      const from = `"${emailConfig.fromName}" <${emailConfig.fromEmail}>`;
      const subject = inbox.metadata?.defaultSubject || 'Mensaje de ' + emailConfig.fromName;

      try {
        const result = await this.mailgunService.sendEmail({
          domain: emailConfig.domain,
          from,
          to: toEmail,
          subject,
          html: content.replace(/\n/g, '<br>'),
          text: content,
          variables: {
            conversationId: conversation.id,
            inboxId: inbox.id,
          },
          tags: ['transactional', `inbox:${inbox.id}`],
          tracking: true,
          unsubscribeUrl: this.emailUnsubscribeService.getUnsubscribeUrl(inbox.tenantId, toEmail),
        });
        externalId = result.id || null;
      } catch (err: any) {
        console.error('[Chat] Mailgun email send failed:', err);
        sendError = err.message || 'Error desconocido al enviar email vía Mailgun';
      }
    } else if (inbox.channel === 'whatsapp') {
      if (!inbox.accessToken) throw new Error('Inbox not connected');
      // Send via WhatsApp Cloud API
      const messageBody: any = {
        messaging_product: 'whatsapp',
        to: conversation.contactId,
        type: 'text',
        text: { body: content },
      };
      if (replyToExternalId) {
        messageBody.context = { message_id: replyToExternalId };
      }
      try {
        const res = await fetch(`https://graph.facebook.com/v21.0/${inbox.phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${inbox.accessToken}`,
          },
          body: JSON.stringify(messageBody),
        });
        const data = await res.json();
        if (!res.ok) {
          console.error('[Chat] WhatsApp send failed:', JSON.stringify(data));
          const errDetail = data.error?.message || data.error?.error_data?.details || 'Error desconocido';
          sendError = `WhatsApp API error: ${errDetail}`;
        }
        externalId = data.messages?.[0]?.id || null;
      } catch (err: any) {
        console.error('[Chat] WhatsApp send error:', err);
        sendError = err.message || 'Error de conexión con WhatsApp API';
      }
    } else if (inbox.channel === 'messenger' || inbox.channel === 'instagram') {
      if (!inbox.accessToken) throw new Error('Inbox not connected');
      // Send via Page Send API
      const messengerPayload: any = {
        recipient: { id: conversation.contactId },
        message: { text: content },
      };
      if (replyToExternalId) {
        messengerPayload.reply_to = { mid: replyToExternalId };
      }
      try {
        const res = await fetch(`https://graph.facebook.com/v21.0/${inbox.pageId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${inbox.accessToken}`,
          },
          body: JSON.stringify(messengerPayload),
        });
        const data = await res.json();
        externalId = data.message_id || null;
        if (!externalId) {
          console.error('[Chat] Messenger send failed:', JSON.stringify(data));
          const errDetail = data.error?.message || 'Error desconocido';
          sendError = `${inbox.channel === 'instagram' ? 'Instagram' : 'Messenger'} API error: ${errDetail}`;
        }
      } catch (err: any) {
        console.error(`[Chat] ${inbox.channel} send error:`, err);
        sendError = err.message || `Error de conexión con ${inbox.channel} API`;
      }
    } else if (inbox.channel === 'chat') {
      // Chat widget — no external API needed, message will be pushed via WebSocket
      externalId = `chat_${Date.now()}`;
    } else if (inbox.channel === 'evolution') {
      // Evolution API (Chat Genérico / WhatsApp no oficial)
      const instanceName = inbox.metadata?.evolutionInstanceName;
      if (!instanceName) throw new Error('Evolution instance not configured');
      try {
        const result = await this.evolutionService.sendText(
          instanceName,
          conversation.contactId,
          content,
          inbox.accessToken || undefined,
        );
        externalId = result?.key?.id || null;
      } catch (err: any) {
        console.error('[Chat] Evolution send error:', err);
        sendError = err.message || 'Error de conexión con Evolution API';
      }
    }

    // Save outbound message
    const message = this.messageRepo.create({
      conversationId,
      direction: 'outbound',
      messageType,
      content,
      externalId,
      senderId: senderId || null,
      replyToExternalId: replyToExternalId || null,
      status: externalId ? 'sent' : 'failed',
    });
    const saved = await this.messageRepo.save(message);

    // If send failed, create a system note with the error details
    if (!externalId && sendError) {
      await this.createSystemNote(conversationId, `⚠️ Error al enviar mensaje: ${sendError}`, inbox.tenantId);
    }

    // Update conversation
    conversation.lastMessage = content;
    conversation.lastMessageAt = new Date();

    // Auto-pause bot when a human agent sends a message
    if (senderId && senderId !== 'bot' && conversation.botStatus === 'active') {
      conversation.botStatus = 'handed_off';
    }

    await this.conversationRepo.save(conversation);

    // Emit real-time events
    this.chatsGateway.emitNewMessage(inbox.tenantId, conversationId, saved);
    this.chatsGateway.emitConversationUpdate(inbox.tenantId, conversation);

    // Send to chat widget visitor via WebSocket
    if (inbox.channel === 'chat') {
      this.chatWidgetGateway.sendToVisitor(conversationId, {
        type: 'message',
        content,
        direction: 'out',
        messageId: saved.id,
      });
    }

    // Dispatch webhooks with full context
    const contactRecord = conversation.recordId ? await this.clientRecordRepo.findOne({ where: { id: conversation.recordId } }) : null;
    this.webhooksService.dispatch(inbox.tenantId, 'message_created', {
      message: saved,
      conversation: { id: conversation.id, contactId: conversation.contactId, contactName: conversation.contactName, status: conversation.status, recordId: conversation.recordId, inboxId: conversation.inboxId, lastMessage: conversation.lastMessage, lastMessageAt: conversation.lastMessageAt },
      contact: contactRecord,
      inbox: { id: inbox.id, name: inbox.name, channel: inbox.channel },
    }).catch(() => {});

    return saved;
  }

  async createNote(conversationId: string, content: string, senderId?: string): Promise<Message> {
    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const message = this.messageRepo.create({
      conversationId,
      direction: 'outbound',
      messageType: 'note',
      content,
      senderId: senderId || null,
      status: 'delivered',
    });
    return this.messageRepo.save(message);
  }

  /**
   * Creates a system note (visible in the conversation) to inform about errors or events.
   * Used across all channels when a send operation fails.
   */
  private async createSystemNote(conversationId: string, content: string, tenantId?: string): Promise<void> {
    const note = this.messageRepo.create({
      conversationId,
      direction: 'outbound',
      messageType: 'system',
      content,
      senderId: null,
      status: 'delivered',
    });
    const saved = await this.messageRepo.save(note);

    // Emit in real-time so the agent sees the error immediately
    if (tenantId) {
      this.chatsGateway.emitNewMessage(tenantId, conversationId, saved);
    }
  }

  async sendMediaMessage(
    conversationId: string,
    file: Express.Multer.File,
    senderId?: string,
    caption?: string,
  ): Promise<Message> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
      relations: { inbox: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const inbox = conversation.inbox;

    // Check 24h messaging window for social channels
    if (['whatsapp', 'messenger', 'instagram'].includes(inbox.channel)) {
      const lastInbound = await this.messageRepo.findOne({
        where: { conversationId, direction: 'inbound' },
        order: { createdAt: 'DESC' },
      });
      if (!lastInbound) {
        throw new BadRequestException('No se puede enviar archivos sin un mensaje previo del contacto.');
      }
      const hoursSinceLastInbound = (Date.now() - new Date(lastInbound.createdAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastInbound > 24) {
        throw new BadRequestException('La ventana de conversación de 24 horas está cerrada. No se pueden enviar archivos.');
      }
    }    // Determine message type from mime
    let messageType = 'document';
    if (file.mimetype.startsWith('image/')) messageType = 'image';
    else if (file.mimetype.startsWith('video/')) messageType = 'video';
    else if (file.mimetype.startsWith('audio/')) messageType = 'audio';

    // Upload to Firebase Storage
    const stored = await this.mediaStorageService.uploadBuffer(file.buffer, {
      channel: inbox.channel,
      tenantId: inbox.tenantId,
      conversationId,
      messageId: `outbound-${Date.now()}`,
      mimeType: file.mimetype,
      filename: file.originalname,
    });

    // For WhatsApp, we need to upload media to Meta first, then send
    let externalId: string | null = null;
    let sendError: string | null = null;
    if (inbox.accessToken && inbox.channel === 'whatsapp' && inbox.phoneNumberId) {
      try {
        // WhatsApp accepts: audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg (opus)
        // Browsers often record as audio/webm;codecs=opus which is opus in a webm container
        // Force mime to audio/ogg for WhatsApp compatibility (opus codec is the same)
        const whatsappMime = file.mimetype.includes('webm') ? 'audio/ogg' : file.mimetype;
        const whatsappFilename = file.mimetype.includes('webm')
          ? file.originalname.replace('.webm', '.ogg')
          : file.originalname;

        // Upload media to WhatsApp using raw multipart
        const boundary = `----FormBoundary${Date.now()}`;
        const parts: Buffer[] = [];

        parts.push(Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${whatsappFilename}"\r\nContent-Type: ${whatsappMime}\r\n\r\n`,
        ));
        parts.push(file.buffer as Buffer<ArrayBuffer>);
        parts.push(Buffer.from('\r\n'));
        parts.push(Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp\r\n`,
        ));
        parts.push(Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\n${whatsappMime}\r\n`,
        ));
        parts.push(Buffer.from(`--${boundary}--\r\n`));

        const uploadBody = Buffer.concat(parts);

        const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${inbox.phoneNumberId}/media`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${inbox.accessToken}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
          body: uploadBody,
        });
        const uploadData = await uploadRes.json();
        const mediaId = uploadData.id;

        if (!mediaId) {
          console.error('[Chat] WhatsApp media upload failed:', JSON.stringify(uploadData));
          sendError = `Error al subir archivo a WhatsApp: ${uploadData.error?.message || 'Error desconocido'}`;
        }

        if (mediaId) {
          // Send media message
          const messageBody: any = {
            messaging_product: 'whatsapp',
            to: conversation.contactId,
            type: messageType,
          };

          if (messageType === 'image') {
            messageBody.image = { id: mediaId, caption: caption || undefined };
          } else if (messageType === 'video') {
            messageBody.video = { id: mediaId, caption: caption || undefined };
          } else if (messageType === 'audio') {
            messageBody.audio = { id: mediaId };
          } else {
            messageBody.document = { id: mediaId, caption: caption || undefined, filename: file.originalname };
          }

          const sendRes = await fetch(`https://graph.facebook.com/v21.0/${inbox.phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${inbox.accessToken}`,
            },
            body: JSON.stringify(messageBody),
          });
          const sendData = await sendRes.json();
          externalId = sendData.messages?.[0]?.id || null;
          if (!externalId) {
            const errDetail = sendData.error?.message || 'Error desconocido';
            sendError = `WhatsApp API error: ${errDetail}`;
          }
        }
      } catch (err: any) {
        console.error('[Chat] Failed to send media via WhatsApp:', err);
        sendError = err.message || 'Error de conexión con WhatsApp API';
      }
    } else if (inbox.accessToken && (inbox.channel === 'messenger' || inbox.channel === 'instagram') && inbox.pageId) {
      // Messenger/Instagram: send media using the Firebase URL directly
      try {
        const messagePayload: any = {
          recipient: { id: conversation.contactId },
          message: {},
        };

        if (messageType === 'image') {
          messagePayload.message = {
            attachment: { type: 'image', payload: { url: stored?.url, is_reusable: true } },
          };
        } else if (messageType === 'video') {
          messagePayload.message = {
            attachment: { type: 'video', payload: { url: stored?.url, is_reusable: true } },
          };
        } else if (messageType === 'audio') {
          messagePayload.message = {
            attachment: { type: 'audio', payload: { url: stored?.url, is_reusable: true } },
          };
        } else {
          messagePayload.message = {
            attachment: { type: 'file', payload: { url: stored?.url, is_reusable: true } },
          };
        }

        const sendRes = await fetch(`https://graph.facebook.com/v21.0/${inbox.pageId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${inbox.accessToken}`,
          },
          body: JSON.stringify(messagePayload),
        });
        const sendData = await sendRes.json();
        externalId = sendData.message_id || null;
        if (!externalId) {
          console.error('[Chat] Messenger media send failed:', JSON.stringify(sendData));
          const errDetail = sendData.error?.message || 'Error desconocido';
          sendError = `${inbox.channel === 'instagram' ? 'Instagram' : 'Messenger'} API error: ${errDetail}`;
        }
      } catch (err: any) {
        console.error(`[Chat] Failed to send media via ${inbox.channel}:`, err);
        sendError = err.message || `Error de conexión con ${inbox.channel} API`;
      }
    } else if (inbox.channel === 'evolution' && inbox.metadata?.evolutionInstanceName) {
      // Evolution API — send media via URL
      const instanceName = inbox.metadata.evolutionInstanceName;
      try {
        const evoMediaType = messageType === 'image' ? 'image'
          : messageType === 'video' ? 'video'
          : messageType === 'audio' ? 'audio'
          : 'document';
        const result = await this.evolutionService.sendMedia(
          instanceName,
          conversation.contactId,
          stored?.url || '',
          evoMediaType,
          caption || undefined,
          file.originalname,
          inbox.accessToken || undefined,
        );
        externalId = result?.key?.id || null;
      } catch (err: any) {
        console.error('[Chat] Evolution media send error:', err);
        sendError = err.message || 'Error de conexión con Evolution API';
      }
    }

    // Save message in DB
    const message = this.messageRepo.create({
      conversationId,
      direction: 'outbound',
      messageType,
      content: caption || null,
      mediaUrl: stored?.url || null,
      mediaMimeType: file.mimetype,
      externalId,
      senderId: senderId || null,
      status: externalId ? 'sent' : 'failed',
    });
    const saved = await this.messageRepo.save(message);

    // If send failed, create a system note with the error details
    if (!externalId && sendError) {
      await this.createSystemNote(conversationId, `⚠️ Error al enviar archivo: ${sendError}`, inbox.tenantId);
    }

    // Update conversation
    conversation.lastMessage = caption || `[${messageType}]`;
    conversation.lastMessageAt = new Date();
    await this.conversationRepo.save(conversation);

    // Emit real-time events
    this.chatsGateway.emitNewMessage(inbox.tenantId, conversationId, saved);
    this.chatsGateway.emitConversationUpdate(inbox.tenantId, conversation);

    return saved;
  }

  async uploadMediaOnly(file: Express.Multer.File, conversationId?: string): Promise<{ url: string }> {
    const stored = await this.mediaStorageService.uploadBuffer(file.buffer, {
      channel: 'template',
      tenantId: 'shared',
      conversationId: conversationId || 'template-media',
      messageId: `upload-${Date.now()}`,
      mimeType: file.mimetype,
      filename: file.originalname,
    });
    return { url: stored?.url || '' };
  }

  // === TEMPLATES ===

  // === WHATSAPP TEMPLATE MEDIA UPLOAD ===

  async uploadTemplateMedia(inboxId: string, file: { buffer: Buffer; originalname: string; mimetype: string; size: number }): Promise<{ handle: string }> {
    const inbox = await this.findInboxById(inboxId);
    if (!inbox.accessToken) throw new Error('Inbox not configured');

    const appId = this.configService.get<string>('META_APP_ID');

    // Step 1: Create upload session
    const sessionRes = await fetch(
      `https://graph.facebook.com/v21.0/${appId}/uploads?file_name=${encodeURIComponent(file.originalname)}&file_length=${file.size}&file_type=${encodeURIComponent(file.mimetype)}&access_token=${inbox.accessToken}`,
      { method: 'POST' },
    );
    const sessionData = await sessionRes.json();
    if (sessionData.error) throw new Error(sessionData.error.message || 'Failed to create upload session');

    const uploadSessionId = sessionData.id; // "upload:SESSION_ID"

    // Step 2: Upload the file binary
    const uploadRes = await fetch(
      `https://graph.facebook.com/v21.0/${uploadSessionId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `OAuth ${inbox.accessToken}`,
          'file_offset': '0',
          'Content-Type': file.mimetype,
        },
        body: new Uint8Array(file.buffer),
      },
    );
    const uploadData = await uploadRes.json();
    if (uploadData.error) throw new Error(uploadData.error.message || 'Failed to upload file');

    return { handle: uploadData.h };
  }

  // === WHATSAPP SYNC PHONE NUMBER ===

  async syncWhatsAppPhoneNumber(inboxId: string): Promise<any> {
    const inbox = await this.findInboxById(inboxId);
    if (!inbox.wabaId || !inbox.accessToken) throw new Error('WABA ID or access token not configured');

    // Fetch phone numbers from WABA
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${inbox.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating&access_token=${inbox.accessToken}`,
    );
    const data = await res.json();

    if (data.error) throw new Error(data.error.message || 'Failed to fetch phone numbers');

    const phones = data.data || [];
    if (phones.length === 0) throw new Error('No hay números de teléfono asociados a esta WABA');

    // Use first phone number (or match existing if possible)
    const phone = inbox.phoneNumberId && phones.find((p: any) => p.id === inbox.phoneNumberId)
      ? phones.find((p: any) => p.id === inbox.phoneNumberId)
      : phones[0];

    // Update inbox with correct phone number data
    inbox.phoneNumberId = phone.id;
    inbox.channelName = phone.display_phone_number || inbox.channelName;
    await this.inboxRepo.save(inbox);

    return {
      phoneNumberId: phone.id,
      displayPhoneNumber: phone.display_phone_number,
      verifiedName: phone.verified_name,
      qualityRating: phone.quality_rating,
      totalPhoneNumbers: phones.length,
    };
  }

  async registerWhatsAppPhoneNumber(inboxId: string, pin: string): Promise<any> {
    const inbox = await this.findInboxById(inboxId);
    if (!inbox.phoneNumberId || !inbox.accessToken) throw new Error('Phone Number ID or access token not configured');

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${inbox.phoneNumberId}/register`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${inbox.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          pin,
        }),
      },
    );
    const data = await res.json();

    if (data.error) throw new Error(data.error.message || 'Failed to register phone number');

    // Update inbox status
    inbox.status = 'connected';
    await this.inboxRepo.save(inbox);

    return { success: true, ...data };
  }

  // === WHATSAPP BUSINESS PROFILE UPDATE ===

  async updateWhatsAppBusinessProfile(inboxId: string, profileData: { about?: string; description?: string; address?: string; email?: string; websites?: string[]; vertical?: string; profile_picture_handle?: string }): Promise<any> {
    const inbox = await this.findInboxById(inboxId);
    if (!inbox.phoneNumberId || !inbox.accessToken) throw new Error('Inbox not configured');

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${inbox.phoneNumberId}/whatsapp_business_profile`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${inbox.accessToken}`,
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...profileData }),
      },
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'Failed to update business profile');
    return data;
  }

  async uploadWhatsAppProfilePicture(inboxId: string, file: { buffer: Buffer; originalname: string; mimetype: string; size: number }): Promise<{ handle: string }> {
    // Same as template media upload — reuse the resumable upload API to get a handle
    return this.uploadTemplateMedia(inboxId, file);
  }

  // === WHATSAPP ACCOUNT STATUS ===

  async getWhatsAppAccountStatus(inboxId: string): Promise<any> {
    const inbox = await this.findInboxById(inboxId);
    if (!inbox.accessToken) return { error: 'No access token configured' };

    const result: any = { phoneNumberId: inbox.phoneNumberId, wabaId: inbox.wabaId };

    // Fetch phone number details (quality, status, name, messaging limits)
    if (inbox.phoneNumberId) {
      try {
        const fields = 'verified_name,display_phone_number,quality_rating,status,name_status,code_verification_status,platform_type,throughput,last_onboarded_time,is_official_business_account,account_mode,messaging_limit_tier';
        const res = await fetch(
          `https://graph.facebook.com/v21.0/${inbox.phoneNumberId}?fields=${fields}&access_token=${inbox.accessToken}`,
        );
        const data = await res.json();
        result.phoneNumber = data;
      } catch (err) {
        console.error('[WA Status] Failed to fetch phone number info:', err);
        result.phoneNumber = { error: 'Failed to fetch' };
      }

      // Fetch business profile (about, address, description, email, profile picture, etc.)
      try {
        const profileFields = 'about,address,description,email,profile_picture_url,websites,vertical';
        const res = await fetch(
          `https://graph.facebook.com/v21.0/${inbox.phoneNumberId}/whatsapp_business_profile?fields=${profileFields}&access_token=${inbox.accessToken}`,
        );
        const data = await res.json();
        result.businessProfile = data.data?.[0] || null;
      } catch (err) {
        console.error('[WA Status] Failed to fetch business profile:', err);
        result.businessProfile = null;
      }
    }

    // Fetch WABA info (name, currency, payment method, etc.)
    if (inbox.wabaId) {
      try {
        const wabaFields = 'name,currency,message_template_namespace,account_review_status,business_verification_status,ownership_type';
        const res = await fetch(
          `https://graph.facebook.com/v21.0/${inbox.wabaId}?fields=${wabaFields}&access_token=${inbox.accessToken}`,
        );
        const data = await res.json();
        result.waba = data;
      } catch (err) {
        console.error('[WA Status] Failed to fetch WABA info:', err);
        result.waba = { error: 'Failed to fetch' };
      }
    }

    return result;
  }

  // === TEMPLATES ===

  async getWhatsAppTemplates(inboxId: string): Promise<any[]> {
    const inbox = await this.findInboxById(inboxId);
    if (!inbox.wabaId || !inbox.accessToken) return [];

    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${inbox.wabaId}/message_templates?fields=id,name,language,status,category,components,quality_score,rejected_reason,message_send_ttl_seconds&limit=250&access_token=${inbox.accessToken}`,
      );
      const data = await res.json();
      return data.data || [];
    } catch (err) {
      console.error('[Templates] Failed to fetch:', err);
      return [];
    }
  }

  async createWhatsAppTemplate(inboxId: string, templateData: { name: string; category: string; language: string; components: any[] }): Promise<any> {
    const inbox = await this.findInboxById(inboxId);
    if (!inbox.wabaId || !inbox.accessToken) throw new Error('Inbox not configured for WhatsApp');

    // Ensure example values exist for components with variables (fallback if frontend didn't provide them)
    const components = templateData.components.map((comp: any) => {
      if (comp.type === 'BODY' && comp.text && !comp.example) {
        const vars = comp.text.match(/\{\{\d+\}\}/g);
        if (vars && vars.length > 0) {
          comp.example = { body_text: [vars.map((_: string, i: number) => `ejemplo_${i + 1}`)] };
        }
      }
      if (comp.type === 'HEADER' && comp.format === 'TEXT' && comp.text && !comp.example) {
        const vars = comp.text.match(/\{\{\d+\}\}/g);
        if (vars && vars.length > 0) {
          comp.example = { header_text: vars.map((_: string, i: number) => `ejemplo_${i + 1}`) };
        }
      }
      return comp;
    });

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${inbox.wabaId}/message_templates`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${inbox.accessToken}`,
        },
        body: JSON.stringify({ ...templateData, components }),
      },
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'Failed to create template');
    return data;
  }

  async updateWhatsAppTemplate(inboxId: string, templateId: string, templateData: { components: any[]; category?: string }): Promise<any> {
    const inbox = await this.findInboxById(inboxId);
    if (!inbox.accessToken) throw new Error('Inbox not configured');

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${templateId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${inbox.accessToken}`,
        },
        body: JSON.stringify(templateData),
      },
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'Failed to update template');
    return data;
  }

  async deleteWhatsAppTemplate(inboxId: string, templateName: string): Promise<any> {
    const inbox = await this.findInboxById(inboxId);
    if (!inbox.wabaId || !inbox.accessToken) throw new Error('Inbox not configured');

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${inbox.wabaId}/message_templates?name=${encodeURIComponent(templateName)}&access_token=${inbox.accessToken}`,
      { method: 'DELETE' },
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'Failed to delete template');
    return data;
  }

  async sendTemplateMessage(
    conversationId: string,
    templateName: string,
    languageCode: string,
    components?: any[],
    senderId?: string,
    renderedContent?: string,
    templateComponents?: any[],
    category?: string,
    performedBy?: string,
  ): Promise<Message> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
      relations: { inbox: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const inbox = conversation.inbox;
    if (!inbox.accessToken || inbox.channel !== 'whatsapp') throw new Error('Inbox not configured for templates');

    // Consumir créditos según categoría de plantilla
    const categoryLower = (category || 'utility').toLowerCase();
    const actionMap: Record<string, string> = {
      utility: 'whatsapp_utility',
      marketing: 'whatsapp_marketing',
      authentication: 'whatsapp_authentication',
    };
    const billingAction = actionMap[categoryLower] || 'whatsapp_utility';

    let templateCreditsCost = 0;
    try {
      const cost = await this.billingService.getEffectiveActionCost(inbox.tenantId, billingAction);
      templateCreditsCost = cost ?? 0;
      await this.billingService.consumeByAction(
        inbox.tenantId,
        billingAction,
        conversationId,
        performedBy,
      );
    } catch (err) {
      throw new BadRequestException(
        err.message?.includes('insuficientes')
          ? 'Créditos insuficientes para enviar esta plantilla. Recarga tu saldo para continuar.'
          : `No se pudo enviar la plantilla: ${err.message}`,
      );
    }

    // Send template via WhatsApp Cloud API
    const messageBody: any = {
      messaging_product: 'whatsapp',
      to: conversation.contactId,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };

    if (components && components.length > 0) {
      // For carousel cards with image links, upload to WhatsApp Media API first
      for (const comp of components) {
        if (comp.type === 'carousel' && comp.cards) {
          for (const card of comp.cards) {
            if (card.components) {
              for (const cardComp of card.components) {
                if (cardComp.type === 'header' && cardComp.parameters?.[0]?.type === 'image') {
                  const imgParam = cardComp.parameters[0];
                  if (imgParam.image?.link) {
                    // Download image and upload to WhatsApp
                    try {
                      const imgRes = await fetch(imgParam.image.link);
                      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
                      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

                      const boundary = `----FormBoundary${Date.now()}${Math.random()}`;
                      const parts: Buffer[] = [];
                      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="image.jpg"\r\nContent-Type: ${contentType}\r\n\r\n`));
                      parts.push(imgBuffer);
                      parts.push(Buffer.from('\r\n'));
                      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp\r\n`));
                      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\n${contentType}\r\n`));
                      parts.push(Buffer.from(`--${boundary}--\r\n`));

                      const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${inbox.phoneNumberId}/media`, {
                        method: 'POST',
                        headers: {
                          Authorization: `Bearer ${inbox.accessToken}`,
                          'Content-Type': `multipart/form-data; boundary=${boundary}`,
                        },
                        body: Buffer.concat(parts),
                      });
                      const uploadData = await uploadRes.json();
                      if (uploadData.id) {
                        imgParam.image = { id: uploadData.id };
                      }
                    } catch (err) {
                      console.error('[Templates] Failed to upload carousel image:', err);
                    }
                  }
                }
              }
            }
          }
        }
        // Also handle single header images
        if (comp.type === 'header' && comp.parameters?.[0]?.type === 'image' && comp.parameters[0].image?.link) {
          try {
            const imgRes = await fetch(comp.parameters[0].image.link);
            const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
            const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

            const boundary = `----FormBoundary${Date.now()}${Math.random()}`;
            const parts: Buffer[] = [];
            parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="image.jpg"\r\nContent-Type: ${contentType}\r\n\r\n`));
            parts.push(imgBuffer);
            parts.push(Buffer.from('\r\n'));
            parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp\r\n`));
            parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\n${contentType}\r\n`));
            parts.push(Buffer.from(`--${boundary}--\r\n`));

            const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${inbox.phoneNumberId}/media`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${inbox.accessToken}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
              },
              body: Buffer.concat(parts),
            });
            const uploadData = await uploadRes.json();
            if (uploadData.id) {
              comp.parameters[0].image = { id: uploadData.id };
            }
          } catch (err) {
            console.error('[Templates] Failed to upload header image:', err);
          }
        }
      }
      messageBody.template.components = components;
    }

    const res = await fetch(`https://graph.facebook.com/v21.0/${inbox.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${inbox.accessToken}`,
      },
      body: JSON.stringify(messageBody),
    });
    const data = await res.json();
    const externalId = data.messages?.[0]?.id || null;

    let sendError: string | null = null;
    if (!externalId) {
      console.error('[Templates] Send failed:', JSON.stringify(data));
      console.error('[Templates] Payload sent:', JSON.stringify(messageBody, null, 2));
      sendError = data.error?.message || data.error?.error_data?.details || 'Error desconocido al enviar plantilla';
    }

    // Save message with rendered content
    const displayContent = renderedContent || `[Plantilla: ${templateName}]`;
    const message = this.messageRepo.create({
      conversationId,
      direction: 'outbound',
      messageType: 'template',
      content: displayContent,
      mediaUrl: templateComponents ? JSON.stringify({ name: templateName, language: languageCode, components: templateComponents }) : null,
      externalId,
      senderId: senderId || null,
      status: externalId ? 'sent' : 'failed',
      creditsCost: templateCreditsCost,
    });
    const saved = await this.messageRepo.save(message);

    // If send failed, create a system note with the error details
    if (!externalId && sendError) {
      await this.createSystemNote(conversationId, `⚠️ Error al enviar plantilla "${templateName}": ${sendError}`, inbox.tenantId);
    }

    conversation.lastMessage = `📋 ${templateName}`;
    conversation.lastMessageAt = new Date();
    await this.conversationRepo.save(conversation);

    return saved;
  }

  // === LABELS ===

  async getLabels(tenantId: string): Promise<Label[]> {
    return this.labelRepo.find({ where: { tenantId }, order: { createdAt: 'ASC' } });
  }

  async createLabel(data: { tenantId: string; slug: string; label: string; description?: string; color?: string; showInSidebar?: boolean }): Promise<Label> {
    const label = this.labelRepo.create({
      tenantId: data.tenantId,
      slug: data.slug,
      label: data.label,
      description: data.description || null,
      color: data.color || '#6b7280',
      showInSidebar: data.showInSidebar ?? false,
    });
    return this.labelRepo.save(label);
  }

  async updateLabel(id: string, data: Partial<{ label: string; description: string; color: string; showInSidebar: boolean }>): Promise<Label> {
    const label = await this.labelRepo.findOne({ where: { id } });
    if (!label) throw new NotFoundException('Label not found');
    Object.assign(label, data);
    return this.labelRepo.save(label);
  }

  async deleteLabel(id: string): Promise<void> {
    await this.labelRepo.delete(id);
  }

  async toggleConversationLabel(
    conversationId: string,
    labelId: string,
    action: 'add' | 'remove',
    userId?: string,
    userName?: string,
  ): Promise<{ labelIds: string[] }> {
    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const label = await this.labelRepo.findOne({ where: { id: labelId } });
    if (!label) throw new NotFoundException('Label not found');

    let labelIds = conversation.labelIds || [];

    if (action === 'add') {
      if (!labelIds.includes(labelId)) labelIds.push(labelId);
    } else {
      labelIds = labelIds.filter((id) => id !== labelId);
    }

    conversation.labelIds = labelIds;
    await this.conversationRepo.save(conversation);

    // Create a system note in the chat
    const actionText = action === 'add' ? 'agregó' : 'quitó';
    const noteContent = `${userName || 'Un agente'} ${actionText} ${label.label}`;

    const message = this.messageRepo.create({
      conversationId,
      direction: 'outbound',
      messageType: 'system',
      content: noteContent,
      senderId: userId || null,
      status: 'delivered',
    });
    await this.messageRepo.save(message);

    return { labelIds };
  }

  // === CHAT WIDGET ===

  async getOrCreateChatWidgetSession(
    inbox: Inbox,
    visitorId?: string,
    name?: string,
    email?: string,
    attribution?: Record<string, string>,
  ): Promise<{ conversationId: string; messages: any[] }> {
    const contactId = visitorId || `visitor_${Date.now()}`;

    // Find existing conversation
    let conversation = await this.conversationRepo.findOne({
      where: { inboxId: inbox.id, contactId },
    });

    let isNewConversation = false;

    if (!conversation) {
      isNewConversation = true;
      conversation = this.conversationRepo.create({
        inboxId: inbox.id,
        contactId,
        contactName: name || 'Visitante',
        status: 'open',
      });
      conversation = await this.conversationRepo.save(conversation);

      // Link to client record
      const record = await this.findOrCreateRecordForWidget(inbox.tenantId, contactId, name, email);
      conversation.recordId = record.id;
      await this.conversationRepo.save(conversation);

      // Emit conversation update to agents
      this.chatsGateway.emitConversationUpdate(inbox.tenantId, conversation);

      // Track ad attribution from URL params
      if (attribution && conversation.recordId) {
        const hasAttribution = attribution.fbclid || attribution.gclid || attribution.ttclid || attribution.li_fat_id || attribution.twclid || attribution.utm_source;
        if (hasAttribution) {
          this.conversionsService.trackFromUrlParams(
            inbox.tenantId,
            attribution,
            {
              recordId: conversation.recordId,
              referrer: attribution.referrer,
              landingPage: attribution.landingPage,
              sessionId: `chat_${conversation.id}`,
            },
          ).then((adEvent) => {
            if (adEvent) {
              // Mark conversation with ad tracking
              conversation!.hasAdTracking = true;
              conversation!.adPlatform = adEvent.platform;
              this.conversationRepo.save(conversation!).catch(() => {});

              // Also mark the client record
              if (conversation!.recordId) {
                this.clientRecordRepo.query(
                  `UPDATE clients SET
                    has_ad_tracking = true,
                    ad_first_platform = COALESCE(ad_first_platform, $2),
                    ad_last_platform = $2,
                    ad_touchpoints = COALESCE(ad_touchpoints, 0) + 1
                  WHERE id = $1`,
                  [conversation!.recordId, adEvent.platform],
                ).catch(() => {});
              }
            }
          }).catch((err) => {
            console.warn('[ChatWidget] Failed to track attribution:', err?.message || err);
          });
        }
      }
    }

    // Load recent messages
    const messages = await this.messageRepo.find({
      where: { conversationId: conversation.id },
      order: { createdAt: 'ASC' },
      take: 50,
    });

    return {
      conversationId: conversation.id,
      messages: messages.map((m) => ({
        id: m.id,
        content: m.content,
        direction: m.direction === 'inbound' ? 'in' : 'out',
        createdAt: m.createdAt,
      })),
    };
  }

  async createChatWidgetMessage(
    inbox: Inbox,
    conversationId: string,
    visitorId: string,
    content: string,
  ): Promise<{ id: string; content: string; direction: string; createdAt: Date }> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId, inboxId: inbox.id },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    // Save the inbound message
    const message = this.messageRepo.create({
      conversationId,
      direction: 'inbound',
      messageType: 'text',
      content,
      status: 'delivered',
    });
    await this.messageRepo.save(message);

    // Update conversation
    conversation.lastMessage = content;
    conversation.lastMessageAt = new Date();
    conversation.unreadCount = (conversation.unreadCount || 0) + 1;
    await this.conversationRepo.save(conversation);

    // Emit to agents via main gateway
    this.chatsGateway.emitNewMessage(inbox.tenantId, conversationId, message);
    this.chatsGateway.emitConversationUpdate(inbox.tenantId, conversation);

    // Trigger bot auto-reply if configured
    this.scheduleBotReply(inbox, conversation, content).catch(() => {});

    return {
      id: message.id,
      content: message.content!,
      direction: 'in',
      createdAt: message.createdAt,
    };
  }

  private async findOrCreateRecordForWidget(
    tenantId: string,
    visitorId: string,
    name?: string,
    email?: string,
  ): Promise<ClientRecord> {
    // Try to find by visitorId in customData
    let record = await this.clientRecordRepo
      .createQueryBuilder('client')
      .where('client.tenant_id = :tenantId', { tenantId })
      .andWhere("client.custom_data ->> 'chatVisitorId' = :visitorId", { visitorId })
      .getOne();

    if (!record && email) {
      record = await this.clientRecordRepo.findOne({ where: { tenantId, email } });
    }

    if (!record) {
      const nameParts = (name || 'Visitante').split(' ');
      record = this.clientRecordRepo.create({
        tenantId,
        firstName: nameParts[0] || null,
        lastName: nameParts.slice(1).join(' ') || null,
        email: email || null,
        status: 'active',
        channelSource: 'chat',
        lastContactAt: new Date(),
        customData: { chatVisitorId: visitorId },
      } as Partial<ClientRecord>);
      record = await this.clientRecordRepo.save(record);
    }

    return record;
  }

  // === EVOLUTION API (Chat Genérico) ===

  /**
   * Procesa un mensaje entrante de Evolution API.
   * Crea o actualiza la conversación y guarda el mensaje.
   */
  async handleEvolutionInboundMessage(
    inboxId: string,
    data: {
      contactPhone: string;
      contactName: string;
      messageType: string;
      content: string | null;
      mediaUrl: string | null;
      mediaMimeType: string | null;
      externalId: string | null;
      replyToExternalId: string | null;
    },
  ): Promise<void> {
    const inbox = await this.inboxRepo.findOne({ where: { id: inboxId } });
    if (!inbox) {
      console.warn(`[Evolution Webhook] No inbox found: ${inboxId}`);
      return;
    }

    const { contactPhone, contactName, messageType, content, mediaUrl, mediaMimeType, externalId, replyToExternalId } = data;

    // Buscar o crear conversación
    let conversation = await this.conversationRepo.findOne({
      where: { inboxId: inbox.id, contactId: contactPhone },
    });

    if (!conversation) {
      conversation = this.conversationRepo.create({
        inboxId: inbox.id,
        contactId: contactPhone,
        contactName,
        status: 'open',
      });
      conversation = await this.conversationRepo.save(conversation);
    }

    // Guardar media en storage si viene como base64 data URL
    let storedMediaUrl = mediaUrl;
    if (mediaUrl && mediaUrl.startsWith('data:')) {
      try {
        const matches = mediaUrl.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
          const mimeType = matches[1];
          const base64Data = matches[2];
          const buffer = Buffer.from(base64Data, 'base64');
          const stored = await this.mediaStorageService.uploadBuffer(buffer, {
            channel: 'evolution',
            tenantId: inbox.tenantId,
            conversationId: conversation.id,
            messageId: externalId || `evo-${Date.now()}`,
            mimeType,
            filename: `media_${Date.now()}`,
          });
          storedMediaUrl = stored?.url || null;
        }
      } catch (err) {
        console.error('[Evolution] Failed to store media:', err);
        storedMediaUrl = null;
      }
    }

    // Guardar mensaje
    const message = this.messageRepo.create({
      conversationId: conversation.id,
      direction: 'inbound',
      messageType,
      content,
      mediaUrl: storedMediaUrl,
      mediaMimeType,
      externalId,
      replyToExternalId,
      status: 'delivered',
    });
    await this.messageRepo.save(message);

    // Actualizar conversación
    conversation.lastMessage = content || `[${messageType}]`;
    conversation.lastMessageAt = new Date();
    conversation.lastMessageSource = null;
    conversation.unreadCount = (conversation.unreadCount || 0) + 1;
    if (contactName && !conversation.contactName) conversation.contactName = contactName;

    // Vincular a registro de contacto
    if (!conversation.recordId) {
      const record = await this.findOrCreateRecordByPhone(contactPhone, inbox.tenantId, contactName, inbox.id);
      conversation.recordId = record.id;
    } else {
      await this.clientRecordRepo.update(conversation.recordId, { lastContactAt: new Date() });
    }

    await this.conversationRepo.save(conversation);

    // Emitir eventos en tiempo real
    this.chatsGateway.emitNewMessage(inbox.tenantId, conversation.id, message);
    this.chatsGateway.emitConversationUpdate(inbox.tenantId, conversation);

    // Notificar colaboradores del inbox
    this.notificationsService.getInboxCollaboratorUserIds(inbox.id).then(async (userIds) => {
      let contactLabel = conversation!.contactName || contactPhone || 'Contacto';
      if (conversation!.recordId) {
        const record = await this.clientRecordRepo.findOne({ where: { id: conversation!.recordId! } });
        if (record) {
          contactLabel = record.fullName || record.firstName || contactLabel;
        }
      }
      for (const uid of userIds) {
        this.notificationsService.findUnreadByConversation(uid, conversation!.id).then((existing) => {
          if (!existing) {
            this.notificationsService.notify({
              tenantId: inbox.tenantId,
              userId: uid,
              type: 'message_received',
              title: `Nuevo mensaje de ${contactLabel}`,
              body: (content || `[${messageType}]`).substring(0, 120),
              link: `/${inbox.tenantId}/comunicaciones/conversaciones/${conversation!.id}`,
              metadata: { conversationId: conversation!.id, inboxId: inbox.id, messageType },
            }).catch(() => {});
          } else {
            this.notificationsService.updateBody(existing.id, (content || `[${messageType}]`).substring(0, 120)).catch(() => {});
          }
        }).catch(() => {});
      }
    }).catch(() => {});

    // Dispatch webhooks
    const contactRecord = conversation.recordId ? await this.clientRecordRepo.findOne({ where: { id: conversation.recordId } }) : null;
    this.webhooksService.dispatch(inbox.tenantId, 'message_created', {
      message,
      conversation: { id: conversation.id, contactId: conversation.contactId, contactName: conversation.contactName, status: conversation.status, recordId: conversation.recordId, inboxId: conversation.inboxId, lastMessage: conversation.lastMessage, lastMessageAt: conversation.lastMessageAt },
      contact: contactRecord,
      inbox: { id: inbox.id, name: inbox.name, channel: inbox.channel },
    }).catch(() => {});

    // Trigger bot auto-reply si hay bot asignado
    this.scheduleBotReply(inbox, conversation, content).catch((err) => {
      console.error('[Evolution Bot Auto-Reply] Failed:', err?.message || err);
    });
  }

  /**
   * Actualiza el status de un mensaje por su externalId.
   */
  async updateMessageStatus(externalId: string, status: string): Promise<void> {
    const message = await this.messageRepo.findOne({ where: { externalId } });
    if (!message) return;
    message.status = status;
    await this.messageRepo.save(message);
  }
}
