import { Controller, Get, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { Tenant } from '../tenants/tenant.entity';
import { AdPlatform } from './ad-platform.entity';
import { ConversionsService } from './conversions.service';

/**
 * Handles Meta (Facebook) OAuth2 flow for Conversions API.
 * 
 * Uses existing env vars:
 * - META_APP_ID
 * - META_APP_SECRET
 * 
 * New env var needed:
 * - META_ADS_REDIRECT_URI (e.g. https://smarter.strategee.us/api/conversions/meta/callback)
 */
@Controller('conversions/meta')
export class MetaOAuthController {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly redirectUri: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(AdPlatform)
    private readonly adPlatformRepo: Repository<AdPlatform>,
    private readonly conversionsService: ConversionsService,
  ) {
    this.appId = this.configService.get<string>('META_APP_ID', '');
    this.appSecret = this.configService.get<string>('META_APP_SECRET', '');
    this.redirectUri = this.configService.get<string>('META_ADS_REDIRECT_URI', '');
  }

  /**
   * Step 1: Redirect user to Facebook OAuth consent screen.
   */
  @Public()
  @Get('auth')
  authorize(@Query('tenantId') tenantId: string, @Res() res: Response) {
    if (!this.appId) {
      return res.status(500).json({ error: 'Meta OAuth not configured' });
    }

    const scopes = 'ads_management,business_management';
    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?` +
      `client_id=${this.appId}` +
      `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&state=${encodeURIComponent(tenantId)}` +
      `&response_type=code`;

    return res.redirect(authUrl);
  }

  /**
   * Step 2: Facebook redirects back with an authorization code.
   */
  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') tenantId: string,
    @Query('error') error: string,
    @Query('error_description') errorDesc: string,
    @Res() res: Response,
  ) {
    const tenant = await this.tenantRepo.findOneBy({ id: tenantId });
    const slug = tenant?.slug || '';

    if (error) {
      return res.redirect(`/${slug}/settings?meta_error=${encodeURIComponent(errorDesc || error)}`);
    }

    if (!code || !tenantId) {
      return res.redirect(`/${slug}/settings?meta_error=missing_params`);
    }

    try {
      // Exchange code for short-lived token
      const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?` +
        `client_id=${this.appId}` +
        `&client_secret=${this.appSecret}` +
        `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
        `&code=${code}`;

      const tokenResponse = await fetch(tokenUrl);
      const tokenData = await tokenResponse.json();

      if (!tokenData.access_token) {
        return res.redirect(`/${slug}/settings?meta_error=${encodeURIComponent(tokenData.error?.message || 'token_error')}`);
      }

      // Exchange for long-lived token (60 days)
      const longLivedUrl = `https://graph.facebook.com/v21.0/oauth/access_token?` +
        `grant_type=fb_exchange_token` +
        `&client_id=${this.appId}` +
        `&client_secret=${this.appSecret}` +
        `&fb_exchange_token=${tokenData.access_token}`;

      const longLivedResponse = await fetch(longLivedUrl);
      const longLivedData = await longLivedResponse.json();
      const accessToken = longLivedData.access_token || tokenData.access_token;

      // Get user's ad accounts and their pixels
      const adAccountsResponse = await fetch(
        `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_id&access_token=${accessToken}`,
      );
      const adAccountsData = await adAccountsResponse.json();
      const adAccounts = adAccountsData.data || [];

      // Get pixels from each ad account
      const pixels: Array<{ id: string; name: string; adAccountId: string; adAccountName: string }> = [];
      for (const account of adAccounts.slice(0, 10)) { // limit to 10 accounts
        try {
          const pixelsResponse = await fetch(
            `https://graph.facebook.com/v21.0/${account.id}/adspixels?fields=id,name&access_token=${accessToken}`,
          );
          const pixelsData = await pixelsResponse.json();
          for (const pixel of (pixelsData.data || [])) {
            pixels.push({
              id: pixel.id,
              name: pixel.name,
              adAccountId: account.account_id,
              adAccountName: account.name,
            });
          }
        } catch {
          // Skip accounts that fail
        }
      }

      // If multiple pixels, redirect for selection
      if (pixels.length > 1) {
        const tempPlatform = await this.conversionsService.createAdPlatform({
          tenantId,
          platform: 'meta',
          name: 'Meta (pendiente)',
          credentials: {
            accessToken,
            pixels,
            pixelId: '',
            pendingSelection: true,
          },
          isActive: false,
        });
        const pixelList = pixels.map((p) => `${p.id}:${encodeURIComponent(p.name)}`).join(',');
        return res.redirect(`/${slug}/settings?meta_select_pixel=${tempPlatform.id}&pixels=${encodeURIComponent(pixelList)}`);
      }

      // Single pixel or no pixels — save directly
      const pixelId = pixels[0]?.id || '';
      const pixelName = pixels[0]?.name || '';

      let existing = await this.adPlatformRepo.findOne({ where: { tenantId, platform: 'meta' } });
      const credentials = {
        accessToken,
        pixelId,
        pixelName,
      };

      if (existing) {
        await this.adPlatformRepo.update(existing.id, { credentials, isActive: true, name: 'Meta Ads' } as any);
      } else {
        await this.conversionsService.createAdPlatform({
          tenantId,
          platform: 'meta',
          name: 'Meta Ads',
          credentials,
          isActive: true,
        });
      }

      return res.redirect(`/${slug}/settings?meta_connected=true`);
    } catch (err) {
      console.error('[Meta OAuth] Error:', err);
      return res.redirect(`/${slug}/settings?meta_error=${encodeURIComponent(String(err).substring(0, 100))}`);
    }
  }

  /**
   * Step 3 (optional): User selects which pixel to use.
   */
  @Public()
  @Get('select-pixel')
  async selectPixel(
    @Query('platformId') platformId: string,
    @Query('pixelId') pixelId: string,
    @Res() res: Response,
  ) {
    if (!platformId || !pixelId) {
      return res.status(400).json({ error: 'Missing platformId or pixelId' });
    }

    const platform = await this.adPlatformRepo.findOneBy({ id: platformId });
    if (!platform) {
      return res.status(404).json({ error: 'Platform not found' });
    }

    const pixels = platform.credentials?.pixels || [];
    const selected = pixels.find((p: any) => p.id === pixelId);

    await this.adPlatformRepo.update(platformId, {
      name: 'Meta Ads',
      credentials: {
        accessToken: platform.credentials.accessToken,
        pixelId,
        pixelName: selected?.name || '',
      },
      isActive: true,
    } as any);

    // Activate in conversion events
    const events = await this.adPlatformRepo.manager.query(
      'SELECT id, platforms FROM conversion_events WHERE tenant_id = $1',
      [platform.tenantId],
    );
    for (const evt of events) {
      const platforms = evt.platforms || [];
      if (!platforms.includes('meta')) {
        platforms.push('meta');
        await this.adPlatformRepo.manager.query(
          'UPDATE conversion_events SET platforms = $1 WHERE id = $2',
          [JSON.stringify(platforms), evt.id],
        );
      }
    }

    return res.json({ success: true, pixelId });
  }
}
