import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { Tenant } from '../tenants/tenant.entity';
import { ConversionsService } from './conversions.service';
import { AdEvent } from './ad-event.entity';

@Controller('t')
export class LinkTrackerController {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(AdEvent)
    private readonly adEventRepo: Repository<AdEvent>,
    private readonly conversionsService: ConversionsService,
  ) {}

  /**
   * Link tracker redirect endpoint.
   * URL: GET /t/:tenantSlug/wa?gclid=xxx&utm_source=google&...
   * 
   * 1. Finds the tenant by slug
   * 2. Creates an AdEvent with a sequential code
   * 3. Redirects to WhatsApp with the configured message + code
   */
  @Public()
  @Get(':slug/wa')
  async trackAndRedirect(
    @Param('slug') slug: string,
    @Query() query: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const tenant = await this.tenantRepo.findOne({ where: { slug } });
    if (!tenant) {
      return res.status(404).send('Not found');
    }

    const config = tenant.trackingConfig || {};
    const whatsappPhone = query.phone || config.whatsappPhone;
    if (!whatsappPhone) {
      return res.status(400).send('No WhatsApp phone configured');
    }

    // Generate sequential code for this tenant
    const code = await this.generateCode(tenant);

    // Create AdEvent with the code
    const adEvent = await this.conversionsService.trackFromUrlParams(
      tenant.id,
      query,
      {
        ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip,
        userAgent: req.headers['user-agent'],
        referrer: (req.headers['referer'] || req.headers['referrer'] || '') as string,
        landingPage: req.originalUrl,
        sessionId: `trk_${code}`,
      },
    );

    // If no ad event was created (no attribution params), create a minimal one
    if (!adEvent) {
      await this.conversionsService.trackEvent({
        tenantId: tenant.id,
        sessionId: `trk_${code}`,
        platform: 'direct',
        metadata: { trackingCode: code, source: 'link_tracker' },
      });
    } else {
      // Update the ad event with the tracking code
      await this.adEventRepo.update(adEvent.id, {
        sessionId: `trk_${code}`,
        metadata: { ...(adEvent.metadata || {}), trackingCode: code },
      } as any);
    }

    // Build WhatsApp redirect URL
    const messageTemplate = config.messageTemplate || 'Hola, me interesa información. Ref: {{code}}';
    const message = messageTemplate.replace(/\{\{code\}\}/g, code);
    const cleanPhone = whatsappPhone.replace(/[^0-9]/g, '');
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

    return res.redirect(302, waUrl);
  }

  /**
   * Pixel script endpoint.
   * Returns a JavaScript snippet that captures URL params and sends them
   * to the tracking endpoint, appending the ref code to WhatsApp links.
   * 
   * Usage: <script src="https://crm.strategee.us/t/:slug/pixel.js"></script>
   */
  @Public()
  @Get(':slug/pixel.js')
  async getPixelScript(
    @Param('slug') slug: string,
    @Res() res: Response,
  ) {
    const tenant = await this.tenantRepo.findOne({ where: { slug } });
    if (!tenant) {
      return res.status(404).send('// tenant not found');
    }

    const config = tenant.trackingConfig || {};
    const messageTemplate = config.messageTemplate || 'Hola, me interesa información. Ref: {{code}}';
    const apiBase = process.env.API_BASE_URL || '';

    const script = `
(function() {
  var TENANT_ID = "${tenant.id}";
  var SLUG = "${slug}";
  var MSG_TEMPLATE = ${JSON.stringify(messageTemplate)};
  var API = "${apiBase}/t/" + SLUG;

  // Read URL params
  var params = {};
  var search = window.location.search.substring(1);
  search.split("&").forEach(function(p) {
    var kv = p.split("=");
    if (kv[0]) params[kv[0]] = decodeURIComponent(kv[1] || "");
  });

  // Read cookies
  function getCookie(name) {
    var match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? match[2] : null;
  }
  params._fbc = getCookie("_fbc") || params.fbclid ? "fb.1." + Date.now() + "." + params.fbclid : "";
  params._fbp = getCookie("_fbp") || "";

  // Store in sessionStorage for form submissions
  sessionStorage.setItem("__sg_params", JSON.stringify(params));

  // Check if there are attribution params worth tracking
  var hasAttribution = params.fbclid || params.gclid || params.ttclid || params.li_fat_id || params.utm_source;
  if (!hasAttribution) return;

  // Intercept WhatsApp links and append tracking
  function processWaLinks() {
    var links = document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp.com"]');
    links.forEach(function(link) {
      if (link.dataset.sgProcessed) return;
      link.dataset.sgProcessed = "1";
      link.addEventListener("click", function(e) {
        e.preventDefault();
        // Redirect through link tracker
        var trackUrl = API + "/wa?" + new URLSearchParams(params).toString();
        var phone = link.href.match(/wa\\.me\\/(\\d+)/);
        if (phone) trackUrl += "&phone=" + phone[1];
        window.location.href = trackUrl;
      });
    });
  }

  // Process on load and on DOM changes
  processWaLinks();
  var observer = new MutationObserver(processWaLinks);
  observer.observe(document.body, { childList: true, subtree: true });
})();
`;

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(script);
  }

  /**
   * Generate a sequential code for the tenant and increment the counter.
   */
  private async generateCode(tenant: Tenant): Promise<string> {
    const config = tenant.trackingConfig || {};
    const nextCode = config.nextCode || 1;

    // Update the counter atomically
    await this.tenantRepo.update(tenant.id, {
      trackingConfig: { ...config, nextCode: nextCode + 1 },
    } as any);

    // Format: tenant prefix (first 2 chars) + padded number
    const prefix = tenant.slug.substring(0, 2).toUpperCase();
    return `${prefix}${String(nextCode).padStart(5, '0')}`;
  }
}
