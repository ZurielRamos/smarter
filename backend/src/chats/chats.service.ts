import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Inbox } from './inbox.entity';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { InboxCollaborator } from './inbox-collaborator.entity';
import { ClientRecord } from '../records/record.entity';
import { Label } from './label.entity';
import { ChatsGateway } from './chats.gateway';
import { MediaStorageService } from '../media/media-storage.service';
import { BillingService } from '../billing/billing.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversionsService } from '../conversions/conversions.service';

@Injectable()
export class ChatsService {
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
    private readonly mediaStorageService: MediaStorageService,
    private readonly configService: ConfigService,
    private readonly billingService: BillingService,
    private readonly webhooksService: WebhooksService,
    private readonly notificationsService: NotificationsService,
    private readonly conversionsService: ConversionsService,
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
    const alwaysConnected = ['sms', 'llamada', 'form'];
    const status = alwaysConnected.includes(data.channel) ? 'connected' : 'disconnected';
    const inbox = this.inboxRepo.create({ ...data, status, metadata: { schedule: defaultSchedule } });
    return this.inboxRepo.save(inbox);
  }

  async deleteInbox(id: string): Promise<{ softDeleted: boolean }> {
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

      switch (messageType) {
        case 'text':
          content = msg.text?.body || '';
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
      }

      // Check if message contains a tracking code (from pixel/link tracker)
      if (!msg.referral && content) {
        const linked = await this.conversionsService.matchAndLinkTrackingCode(inbox.tenantId, content, conversation.recordId!).catch(() => false);
        if (linked) {
          conversation.hasAdTracking = true;
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
      // Update last contact
      record.lastContactAt = new Date();
      await this.clientRecordRepo.save(record);
    }

    return record;
  }

  private async handleWhatsAppStatuses(statuses: any[]): Promise<void> {
    for (const status of statuses) {
      if (status.id) {
        const message = await this.messageRepo.findOne({ where: { externalId: status.id } });
        if (message) {
          message.status = status.status; // sent, delivered, read, failed
          await this.messageRepo.save(message);
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
      // Try to get sender name
      let contactName = senderId;
      try {
        const res = await fetch(`https://graph.facebook.com/v21.0/${senderId}?fields=name&access_token=${inbox.accessToken}`);
        const data = await res.json();
        if (data.name) contactName = data.name;
      } catch {}

      conversation = this.conversationRepo.create({
        inboxId: inbox.id,
        contactId: senderId,
        contactName,
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
          status: 'active',
          channelSource: inbox.id,
          lastContactAt: new Date(),
          customData: { messengerPsid: senderId },
        } as Partial<ClientRecord>);
        record = await this.clientRecordRepo.save(record);
      } else {
        record.lastContactAt = new Date();
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
      // Try to get sender name via Instagram API
      let contactName = senderId;
      try {
        const res = await fetch(`https://graph.instagram.com/v21.0/${senderId}?fields=username,name&access_token=${inbox.accessToken}`);
        const data = await res.json();
        contactName = data.username ? `@${data.username}` : data.name || senderId;
      } catch {}

      conversation = this.conversationRepo.create({
        inboxId: inbox.id,
        contactId: senderId,
        contactName,
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
    // Admin sees all unread for the tenant
    if (role === 'admin' || role === 'owner' || !userId) {
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
    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId } });
    if (conversation) {
      conversation.unreadCount = 0;
      await this.conversationRepo.save(conversation);
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.messageRepo.delete({ conversationId });
    await this.conversationRepo.delete(conversationId);
  }

  // === SEND MESSAGE ===

  async sendMessage(conversationId: string, content: string, messageType = 'text', senderId?: string, replyToExternalId?: string): Promise<Message> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
      relations: { inbox: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const inbox = conversation.inbox;
    if (!inbox.accessToken) throw new Error('Inbox not connected');

    let externalId: string | null = null;

    if (inbox.channel === 'whatsapp') {
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
      const res = await fetch(`https://graph.facebook.com/v21.0/${inbox.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${inbox.accessToken}`,
        },
        body: JSON.stringify(messageBody),
      });
      const data = await res.json();
      externalId = data.messages?.[0]?.id || null;
    } else if (inbox.channel === 'messenger' || inbox.channel === 'instagram') {
      // Send via Page Send API
      const messengerPayload: any = {
        recipient: { id: conversation.contactId },
        message: { text: content },
      };
      if (replyToExternalId) {
        messengerPayload.reply_to = { mid: replyToExternalId };
      }
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

    // Update conversation
    conversation.lastMessage = content;
    conversation.lastMessageAt = new Date();
    await this.conversationRepo.save(conversation);

    // Emit real-time events
    this.chatsGateway.emitNewMessage(inbox.tenantId, conversationId, saved);
    this.chatsGateway.emitConversationUpdate(inbox.tenantId, conversation);

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

    // Determine message type from mime
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
        }
      } catch (err) {
        console.error('[Chat] Failed to send media via WhatsApp:', err);
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
        }
      } catch (err) {
        console.error('[Chat] Failed to send media via Messenger:', err);
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

    // Update conversation
    conversation.lastMessage = caption || `[${messageType}]`;
    conversation.lastMessageAt = new Date();
    await this.conversationRepo.save(conversation);

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

    try {
      await this.billingService.consumeByAction(
        inbox.tenantId,
        billingAction,
        conversationId,
        performedBy,
      );
    } catch (err) {
      throw new Error(`No se pudo enviar la plantilla: ${err.message}`);
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

    if (!externalId) {
      console.error('[Templates] Send failed:', JSON.stringify(data));
      console.error('[Templates] Payload sent:', JSON.stringify(messageBody, null, 2));
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
    });
    const saved = await this.messageRepo.save(message);

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
}
