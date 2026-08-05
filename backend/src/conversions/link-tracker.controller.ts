import { Controller, Get, Post, Param, Body, Req, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { Tenant } from '../tenants/tenant.entity';
import { ConversionsService } from './conversions.service';

@Controller('t')
export class LinkTrackerController {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly conversionsService: ConversionsService,
  ) {}

  /**
   * Pixel endpoint: returns a JavaScript snippet that:
   * 1. Reads URL params (gclid, fbclid, ttclid, UTMs)
   * 2. When user clicks a WhatsApp link, calls our API to create an AdEvent
   * 3. Appends the tracking code (camuflado) to the WhatsApp message text
   *
   * Usage: <script src="https://crm.strategee.us/api/t/:slug/pixel.js"></script>
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
    const codePattern = config.codePattern || 'ref-{{code}}';
    const pixelToken = config.pixelToken || '';
    const apiBase = process.env.API_BASE_URL || '';

    // Generate token if not present
    if (!config.pixelToken) {
      const newToken = require('crypto').randomUUID();
      await this.tenantRepo.update(tenant.id, {
        trackingConfig: { ...config, pixelToken: newToken },
      } as any);
      return this.getPixelScript(slug, res); // recurse with new token
    }

    const script = `
(function() {
  var TENANT_SLUG = "${slug}";
  var TOKEN = "${pixelToken}";
  var CODE_PATTERN = ${JSON.stringify(codePattern)};
  var API = "${apiBase}/t/" + TENANT_SLUG;

  // Read URL params
  var params = {};
  window.location.search.substring(1).split("&").forEach(function(p) {
    var kv = p.split("=");
    if (kv[0]) params[kv[0]] = decodeURIComponent(kv[1] || "");
  });

  // Read Meta cookies
  function getCookie(name) {
    var m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return m ? m[2] : "";
  }

  var fbc = getCookie("_fbc");
  var fbp = getCookie("_fbp");
  if (!fbc && params.fbclid) fbc = "fb.1." + Date.now() + "." + params.fbclid;

  // Check if there's any attribution data worth tracking
  var hasAttribution = params.fbclid || params.gclid || params.ttclid || params.li_fat_id || params.twclid || params.utm_source;
  if (!hasAttribution) return;

  // Store params for this session
  var storedParams = JSON.parse(sessionStorage.getItem("__sg_atr") || "null");
  if (!storedParams) {
    storedParams = params;
    storedParams._fbc = fbc;
    storedParams._fbp = fbp;
    storedParams._lp = window.location.href;
    storedParams._ref = document.referrer;
    sessionStorage.setItem("__sg_atr", JSON.stringify(storedParams));
  }

  // Create AdEvent and get tracking code
  function getTrackingCode(callback) {
    var cached = sessionStorage.getItem("__sg_code");
    if (cached) return callback(cached);

    var xhr = new XMLHttpRequest();
    xhr.open("POST", API + "/event", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4 && xhr.status === 201) {
        var data = JSON.parse(xhr.responseText);
        var code = data.code;
        sessionStorage.setItem("__sg_code", code);
        callback(code);
      }
    };
    xhr.send(JSON.stringify({
      params: storedParams,
      landingPage: storedParams._lp,
      referrer: storedParams._ref,
      token: TOKEN
    }));
  }

  // Intercept WhatsApp links
  function processLinks() {
    var links = document.querySelectorAll('a[href*="wa.me"], a[href*="api.whatsapp.com"]');
    links.forEach(function(link) {
      if (link.dataset.sgTracked) return;
      link.dataset.sgTracked = "1";

      link.addEventListener("click", function(e) {
        e.preventDefault();
        var href = link.href;

        getTrackingCode(function(code) {
          var codeText = CODE_PATTERN.replace("{{code}}", code);

          // Parse existing text param and append code
          var url = new URL(href);
          var existingText = url.searchParams.get("text") || "";
          var separator = existingText ? " " : "";
          url.searchParams.set("text", existingText + separator + codeText);

          window.location.href = url.toString();
        });
      });
    });
  }

  // Process on load and watch for dynamic links
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", processLinks);
  } else {
    processLinks();
  }
  var obs = new MutationObserver(processLinks);
  obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
`;

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(script);
  }

  /**
   * Called by the pixel to create an AdEvent and return a tracking code.
   * POST /t/:slug/event
   */
  @Public()
  @Post(':slug/event')
  async createEvent(
    @Param('slug') slug: string,
    @Body() body: { params: Record<string, string>; landingPage?: string; referrer?: string; token?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const tenant = await this.tenantRepo.findOne({ where: { slug } });
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Validate pixel token
    const config = tenant.trackingConfig || {};
    if (!config.pixelToken || body.token !== config.pixelToken) {
      return res.status(403).json({ error: 'Invalid pixel token' });
    }

    // Generate sequential code
    const code = await this.generateCode(tenant);

    // Create the AdEvent
    await this.conversionsService.trackFromUrlParams(
      tenant.id,
      body.params,
      {
        ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || undefined,
        userAgent: req.headers['user-agent'],
        referrer: body.referrer,
        landingPage: body.landingPage,
        sessionId: `trk_${code}`,
      },
    );

    return res.status(201).json({ code });
  }

  /**
   * Generate a sequential code for the tenant and increment the counter.
   */
  private async generateCode(tenant: Tenant): Promise<string> {
    const config = tenant.trackingConfig || {};
    const nextCode = config.nextCode || 1;

    // Increment atomically
    await this.tenantRepo.update(tenant.id, {
      trackingConfig: { ...config, nextCode: nextCode + 1 },
    } as any);

    // Format: 2 letter prefix (tenant slug) + 5 digit padded number
    const prefix = tenant.slug.substring(0, 2).toUpperCase();
    return `${prefix}${String(nextCode).padStart(5, '0')}`;
  }
}
