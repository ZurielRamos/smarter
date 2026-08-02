import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getStorage, Storage } from 'firebase-admin/storage';
import { v4 as uuid } from 'uuid';
import sharp from 'sharp';

/**
 * Unified media storage service.
 * Handles downloading media from any channel (WhatsApp, Messenger, Instagram, Telegram, etc.)
 * and storing it in Firebase Storage with a consistent path structure.
 *
 * Path convention: media/{tenantId}/{channel}/{conversationId}/{messageId}/{filename}
 */

export interface MediaDownloadOptions {
  /** Source URL to download from (direct URL or needs auth) */
  sourceUrl: string;
  /** Channel identifier: whatsapp | messenger | instagram | telegram | etc */
  channel: string;
  /** Tenant ID for path organization */
  tenantId: string;
  /** Conversation ID for grouping */
  conversationId: string;
  /** Message ID for uniqueness */
  messageId: string;
  /** Original filename if available */
  filename?: string;
  /** MIME type of the media */
  mimeType?: string;
  /** Authorization header value if needed to download */
  authHeader?: string;
}

export interface StoredMedia {
  /** Public URL to access the file */
  url: string;
  /** Storage path in Firebase */
  path: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
}

@Injectable()
export class MediaStorageService implements OnModuleInit {
  private storage: Storage | null = null;
  private bucketName: string;
  private app: App | null = null;

  constructor(private readonly configService: ConfigService) {
    this.bucketName = this.configService.get<string>('FIREBASE_STORAGE_BUCKET', '');
  }

  onModuleInit() {
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

    if (!projectId || !clientEmail || !privateKey) {
      console.warn('[MediaStorage] Firebase credentials not configured. Media storage disabled.');
      return;
    }

    const existingApps = getApps();
    if (existingApps.length === 0) {
      this.app = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
        storageBucket: this.bucketName,
      });
    } else {
      this.app = existingApps[0];
    }

    this.storage = getStorage(this.app);
    console.log('[MediaStorage] Firebase Storage initialized');
  }

  /**
   * Download media from a source URL and upload to Firebase Storage.
   * Works with any channel — just provide the correct sourceUrl and auth.
   */
  async downloadAndStore(options: MediaDownloadOptions): Promise<StoredMedia | null> {
    if (!this.storage) {
      console.warn('[MediaStorage] Storage not initialized, skipping media download');
      return null;
    }

    try {
      // Download the file
      const headers: Record<string, string> = {};
      if (options.authHeader) {
        headers['Authorization'] = options.authHeader;
      }

      const response = await fetch(options.sourceUrl, { headers });
      if (!response.ok) {
        console.error(`[MediaStorage] Failed to download media: ${response.status} ${response.statusText}`);
        return null;
      }

      let buffer = Buffer.from(await response.arrayBuffer());
      let contentType = options.mimeType || response.headers.get('content-type') || 'application/octet-stream';

      // Optimize images: resize to max 600px and convert to webp
      const isImage = contentType.startsWith('image/') && !contentType.includes('svg');
      if (isImage) {
        try {
          const optimized = await sharp(buffer)
            .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();
          buffer = optimized as Buffer<ArrayBuffer>;
          contentType = 'image/webp';
        } catch (err) {
          console.warn('[MediaStorage] Image optimization failed, storing original:', err);
        }
      }

      // Determine filename
      const ext = isImage && contentType === 'image/webp' ? '.webp' : this.getExtension(contentType, options.filename);
      const filename = `${uuid()}${ext}`;

      // Build storage path
      const storagePath = `media/${options.tenantId}/${options.channel}/${options.conversationId}/${options.messageId}/${filename}`;

      // Upload to Firebase Storage
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(storagePath);

      const token = uuid();
      await file.save(buffer, {
        metadata: {
          contentType,
          metadata: {
            firebaseStorageDownloadTokens: token,
            channel: options.channel,
            tenantId: options.tenantId,
            conversationId: options.conversationId,
            messageId: options.messageId,
          },
        },
      });

      // Build Firebase Storage download URL with token
      const encodedPath = encodeURIComponent(storagePath);
      const url = `https://firebasestorage.googleapis.com/v0/b/${this.bucketName}/o/${encodedPath}?alt=media&token=${token}`;

      return {
        url,
        path: storagePath,
        size: buffer.length,
        mimeType: contentType,
      };
    } catch (error) {
      console.error('[MediaStorage] Error downloading/storing media:', error);
      return null;
    }
  }

  /**
   * Get the download URL for a WhatsApp media ID.
   * WhatsApp requires two steps: get URL from media ID, then download with token.
   */
  async getWhatsAppMediaUrl(mediaId: string, accessToken: string): Promise<string | null> {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!data.url) {
        console.error('[MediaStorage] WhatsApp media URL response:', JSON.stringify(data));
      }
      return data.url || null;
    } catch (error) {
      console.error('[MediaStorage] Failed to get WhatsApp media URL:', error);
      return null;
    }
  }

  /**
   * Full flow for WhatsApp: resolve media ID → download → store.
   */
  async processWhatsAppMedia(
    mediaId: string,
    accessToken: string,
    options: Omit<MediaDownloadOptions, 'sourceUrl' | 'authHeader'>,
  ): Promise<StoredMedia | null> {
    const mediaUrl = await this.getWhatsAppMediaUrl(mediaId, accessToken);
    if (!mediaUrl) return null;

    return this.downloadAndStore({
      ...options,
      sourceUrl: mediaUrl,
      authHeader: `Bearer ${accessToken}`,
    });
  }

  /**
   * For Messenger/Instagram: media URLs are direct but may need page token.
   */
  async processMetaMedia(
    mediaUrl: string,
    options: Omit<MediaDownloadOptions, 'sourceUrl' | 'authHeader'>,
    accessToken?: string,
  ): Promise<StoredMedia | null> {
    return this.downloadAndStore({
      ...options,
      sourceUrl: accessToken ? `${mediaUrl}&access_token=${accessToken}` : mediaUrl,
    });
  }

  /**
   * Generic: download from any direct URL (Telegram, etc.)
   */
  async processDirectMedia(
    mediaUrl: string,
    options: Omit<MediaDownloadOptions, 'sourceUrl'>,
    authHeader?: string,
  ): Promise<StoredMedia | null> {
    return this.downloadAndStore({
      ...options,
      sourceUrl: mediaUrl,
      authHeader,
    });
  }

  /**
   * Upload a file buffer directly to Firebase Storage (for outbound media from agents).
   */
  async uploadBuffer(
    buffer: Buffer,
    options: {
      channel: string;
      tenantId: string;
      conversationId: string;
      messageId: string;
      mimeType: string;
      filename?: string;
    },
  ): Promise<StoredMedia | null> {
    if (!this.storage) {
      console.warn('[MediaStorage] Storage not initialized, skipping upload');
      return null;
    }

    try {
      let finalBuffer = buffer;
      let contentType = options.mimeType;

      // Optimize images
      const isImage = contentType.startsWith('image/') && !contentType.includes('svg');
      if (isImage) {
        try {
          const optimized = await sharp(finalBuffer)
            .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();
          finalBuffer = optimized as Buffer<ArrayBuffer>;
          contentType = 'image/webp';
        } catch (err) {
          console.warn('[MediaStorage] Image optimization failed:', err);
        }
      }

      const ext = isImage && contentType === 'image/webp' ? '.webp' : this.getExtension(contentType, options.filename);
      const filename = `${uuid()}${ext}`;
      const storagePath = `media/${options.tenantId}/${options.channel}/${options.conversationId}/${options.messageId}/${filename}`;

      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(storagePath);

      const token = uuid();
      await file.save(finalBuffer, {
        metadata: {
          contentType,
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });

      const encodedPath = encodeURIComponent(storagePath);
      const url = `https://firebasestorage.googleapis.com/v0/b/${this.bucketName}/o/${encodedPath}?alt=media&token=${token}`;

      return { url, path: storagePath, size: finalBuffer.length, mimeType: contentType };
    } catch (error) {
      console.error('[MediaStorage] Error uploading buffer:', error);
      return null;
    }
  }

  private getExtension(mimeType: string, filename?: string): string {
    if (filename) {
      const ext = filename.substring(filename.lastIndexOf('.'));
      if (ext && ext !== filename) return ext;
    }

    const mimeMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'video/mp4': '.mp4',
      'video/3gpp': '.3gp',
      'audio/ogg': '.ogg',
      'audio/mpeg': '.mp3',
      'audio/aac': '.aac',
      'audio/amr': '.amr',
      'application/pdf': '.pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'application/zip': '.zip',
    };

    return mimeMap[mimeType] || '';
  }
}
