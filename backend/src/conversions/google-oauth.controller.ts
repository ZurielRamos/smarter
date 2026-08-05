import { Controller, Get, Query, Res, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { Tenant } from '../tenants/tenant.entity';
import { AdPlatform } from './ad-platform.entity';
import { ConversionsService } from './conversions.service';

/**
 * Handles Google Ads OAuth2 flow.
 * 
 * Environment variables required:
 * - GOOGLE_ADS_CLIENT_ID: OAuth2 client ID from Google Cloud Console
 * - GOOGLE_ADS_CLIENT_SECRET: OAuth2 client secret
 * - GOOGLE_ADS_DEVELOPER_TOKEN: Developer token from Google Ads MCC
 * - GOOGLE_ADS_REDIRECT_URI: Callback URL (e.g. https://crm.strategee.us/api/conversions/google/callback)
 */
@Controller('conversions/google')
export class GoogleOAuthController {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly developerToken: string;
  private readonly redirectUri: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(AdPlatform)
    private readonly adPlatformRepo: Repository<AdPlatform>,
    private readonly conversionsService: ConversionsService,
  ) {
    this.clientId = this.configService.get<string>('GOOGLE_ADS_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>('GOOGLE_ADS_CLIENT_SECRET', '');
    this.developerToken = this.configService.get<string>('GOOGLE_ADS_DEVELOPER_TOKEN', '');
    this.redirectUri = this.configService.get<string>('GOOGLE_ADS_REDIRECT_URI', '');
  }

  /**
   * Step 1: Redirect user to Google OAuth consent screen.
   * Called from frontend: GET /api/conversions/google/auth?tenantId=xxx
   */
  @Public()
  @Get('auth')
  authorize(@Query('tenantId') tenantId: string, @Res() res: Response) {
    if (!this.clientId) {
      return res.status(500).json({ error: 'Google Ads OAuth not configured' });
    }

    const scopes = [
      'https://www.googleapis.com/auth/adwords',
    ].join(' ');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(this.clientId)}` +
      `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&state=${encodeURIComponent(tenantId)}`;

    return res.redirect(authUrl);
  }

  /**
   * Step 2: Google redirects back here with an authorization code.
   * We exchange it for tokens and save the platform credentials.
   */
  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') tenantId: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error) {
      return res.redirect(`/settings?google_error=${encodeURIComponent(error)}`);
    }

    if (!code || !tenantId) {
      return res.redirect('/settings?google_error=missing_params');
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenResponse.json();

      if (!tokens.access_token) {
        return res.redirect(`/settings?google_error=${encodeURIComponent(tokens.error || 'token_error')}`);
      }

      // Get the customer ID(s) from Google Ads API
      const customersResponse = await fetch(
        'https://googleads.googleapis.com/v17/customers:listAccessibleCustomers',
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'developer-token': this.developerToken,
          },
        },
      );
      const customersData = await customersResponse.json();
      const customerIds = (customersData.resourceNames || []).map((rn: string) => rn.replace('customers/', ''));

      // Get the tenant slug for redirect
      const tenant = await this.tenantRepo.findOneBy({ id: tenantId });
      if (!tenant) {
        return res.redirect('/settings?google_error=tenant_not_found');
      }

      // Save or update the platform connection
      let existing = await this.adPlatformRepo.findOne({ where: { tenantId, platform: 'google' } });
      const credentials = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        developerToken: this.developerToken,
        customerIds,
        customerId: customerIds[0] || '',
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
      };

      if (existing) {
        await this.adPlatformRepo.update(existing.id, { credentials, isActive: true } as any);
      } else {
        const created = await this.conversionsService.createAdPlatform({
          tenantId,
          platform: 'google',
          name: 'Google Ads',
          credentials,
          isActive: true,
        });
        existing = created;
      }

      return res.redirect(`/${tenant.slug}/settings?google_connected=true`);
    } catch (err) {
      console.error('[Google OAuth] Error:', err);
      return res.redirect('/settings?google_error=server_error');
    }
  }

  /**
   * Refresh the access token using the stored refresh token.
   * Called internally before dispatching conversions.
   */
  async refreshAccessToken(platformId: string): Promise<string | null> {
    const platform = await this.adPlatformRepo.findOneBy({ id: platformId });
    if (!platform?.credentials?.refreshToken) return null;

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: platform.credentials.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
        }),
      });

      const tokens = await response.json();
      if (!tokens.access_token) return null;

      // Update stored token
      await this.adPlatformRepo.update(platformId, {
        credentials: {
          ...platform.credentials,
          accessToken: tokens.access_token,
          expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
        },
      } as any);

      return tokens.access_token;
    } catch {
      return null;
    }
  }
}
