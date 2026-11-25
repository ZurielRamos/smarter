import { Controller, Get, Post, Param, Body, Req, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { Tenant } from '../tenants/tenant.entity';
import { ConversionsService } from './conversions.service';

@Controller('t')
@SkipThrottle()
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
   * Usage: <script src="https://smarter.strategee.us/api/t/:slug/pixel.js"></script>
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

    // Generate token if not present
    if (!config.pixelToken) {
      const newToken = require('crypto').randomUUID();
      await this.tenantRepo.query(
        `UPDATE tenants SET tracking_config = COALESCE(tracking_config, '{}'::jsonb) || jsonb_build_object('pixelToken', COALESCE(tracking_config->>'pixelToken', $2::text)) WHERE id = $1`,
        [tenant.id, newToken],
      );
      return this.getPixelScript(slug, res); // re-read with the stored token
    }

    const script = `
(function() {
  var TENANT_SLUG = "${slug}";
  var TOKEN = "${pixelToken}";
  var CODE_PATTERN = ${JSON.stringify(codePattern)};

  // Derive API base from the script's own URL
  var scripts = document.getElementsByTagName("script");
  var apiBase = "";
  for (var i = 0; i < scripts.length; i++) {
    var src = scripts[i].src || "";
    if (src.indexOf("/t/" + TENANT_SLUG + "/pixel.js") !== -1) {
      apiBase = src.substring(0, src.indexOf("/t/" + TENANT_SLUG));
      break;
    }
  }
  var API = apiBase + "/t/" + TENANT_SLUG;

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

  // Attribution data in the URL, an external referrer (search/social/other site),
  // or a code already created earlier in this session (internal navigation).
  var hasAttribution = params.fbclid || params.gclid || params.gbraid || params.wbraid || params.msclkid || params.ttclid || params.li_fat_id || params.twclid || params.ctwa_clid || params.utm_source;
  function externalReferrer() {
    if (!document.referrer) return false;
    try {
      var rh = new URL(document.referrer).hostname.replace(/^www\\./, "");
      var ch = window.location.hostname.replace(/^www\\./, "");
      return rh !== ch && !rh.endsWith("." + ch) && !ch.endsWith("." + rh);
    } catch (e) { return false; }
  }
  var hasStoredCode = !!sessionStorage.getItem("__sg_code");
  if (!hasAttribution && !hasStoredCode && !externalReferrer()) {
    // Nothing to track: just ping
    var pingXhr = new XMLHttpRequest();
    pingXhr.open("GET", API + "/ping", true);
    pingXhr.send();
    return;
  }

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

  // Tracking code (will be populated on page load)
  var trackingCode = sessionStorage.getItem("__sg_code") || null;
  var cachedClickId = sessionStorage.getItem("__sg_cid") || "";

  // Determine current click ID
  var currentClickId = params.gclid || params.gbraid || params.wbraid || params.msclkid || params.fbclid || params.ctwa_clid || params.ttclid || params.li_fat_id || params.twclid || params.utm_campaign || "";

  // If click ID changed, reset and create new event
  if (currentClickId && cachedClickId !== currentClickId) {
    trackingCode = null;
    sessionStorage.removeItem("__sg_code");
    // Also refresh stored params with current URL data
    storedParams = params;
    storedParams._fbc = fbc;
    storedParams._fbp = fbp;
    storedParams._lp = window.location.href;
    storedParams._ref = document.referrer;
    sessionStorage.setItem("__sg_atr", JSON.stringify(storedParams));
  }
  sessionStorage.setItem("__sg_cid", currentClickId);

  // Create AdEvent eagerly on page load
  if (!trackingCode) {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", API + "/event", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4 && xhr.status === 201) {
        var data = JSON.parse(xhr.responseText);
        trackingCode = data.code;
        sessionStorage.setItem("__sg_code", trackingCode);
        // Re-process links now that we have the code
        processLinks();
      }
    };
    xhr.send(JSON.stringify({
      params: storedParams,
      landingPage: storedParams._lp,
      referrer: storedParams._ref,
      token: TOKEN
    }));
  }

  // Modify WhatsApp links to include tracking code and open in new tab
  function processLinks() {
    if (!trackingCode) return;
    var links = document.querySelectorAll('a[href*="wa.me"], a[href*="api.whatsapp.com"], a[href*="web.whatsapp.com/send"], a[href^="whatsapp:"]');
    links.forEach(function(link) {
      if (link.dataset.sgTracked) return;
      link.dataset.sgTracked = "1";
      if (!/^whatsapp:/i.test(link.getAttribute("href") || "")) link.setAttribute("target", "_blank");

      // Modify the href directly to include the code
      try {
        link.href = decorate(link.href);
      } catch (e) {}
    });
  }

  // Appends the tracking code to any WhatsApp URL. Idempotent.
  function decorate(href) {
    if (!trackingCode) return href;
    var codeText = CODE_PATTERN.replace("{{code}}", trackingCode);
    var url = new URL(href);
    var existingText = url.searchParams.get("text") || "";
    if (existingText.indexOf(codeText) !== -1) return href;
    url.searchParams.set("text", existingText + (existingText ? " " : "") + codeText);
    return url.toString();
  }

  // Public helper for custom buttons / widgets that open WhatsApp from JavaScript:
  //   window.open(window.SmarterTrack.decorate("https://wa.me/573001234567?text=Hola"))
  window.SmarterTrack = {
    getCode: function() { return trackingCode; },
    decorate: decorate
  };

  // Process on load and watch for dynamic links
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", processLinks);
  } else {
    processLinks();
  }
  var obs = new MutationObserver(processLinks);
  obs.observe(document.body || document.documentElement, { childList: true, subtree: true });

  // Ping to confirm pixel is loaded
  var pingXhr = new XMLHttpRequest();
  pingXhr.open("GET", API + "/ping", true);
  pingXhr.send();
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
  @SkipThrottle({ default: false })
  @Throttle({ short: { limit: 10, ttl: 60000 }, medium: { limit: 30, ttl: 300000 } })
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
    const code = await this.conversionsService.nextTrackingCode(tenant.id);

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
        allowReferrerOnly: true,
      },
    );

    return res.status(201).json({ code });
  }

  /**
   * Pixel verification ping. Called by the pixel on load to confirm it's running.
   * GET /t/:slug/ping
   */
  @Public()
  @Get(':slug/ping')
  async pixelPing(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const tenant = await this.tenantRepo.findOne({ where: { slug } });
    if (!tenant) return res.status(404).json({ ok: false });

    // Update last ping timestamp (merge atómico, como máximo una vez por minuto)
    const config = tenant.trackingConfig || {};
    const lastPing = config.lastPingAt ? Date.parse(config.lastPingAt) : 0;
    if (Date.now() - lastPing > 60_000) {
      await this.conversionsService.mergeTrackingConfig(tenant.id, {
        lastPingAt: new Date().toISOString(),
        lastPingOrigin: (req.headers['origin'] || req.headers['referer'] || '') as string,
      });
    }

    // Return 1x1 transparent pixel (for img tag fallback) or JSON
    res.setHeader('Cache-Control', 'no-cache');
    return res.status(200).json({ ok: true });
  }

  /**
   * Verify if the pixel is installed on a given URL.
   * POST /t/:slug/verify
   */
  @Public()
  @Post(':slug/verify')
  async verifyPixel(
    @Param('slug') slug: string,
    @Body() body: { url: string },
    @Res() res: Response,
  ) {
    const tenant = await this.tenantRepo.findOne({ where: { slug } });
    if (!tenant) return res.status(404).json({ installed: false, error: 'Tenant not found' });

    const config = tenant.trackingConfig || {};
    const pixelUrl = `/t/${slug}/pixel.js`;

    try {
      const response = await fetch(body.url, {
        headers: { 'User-Agent': 'SmartCRM-PixelVerifier/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      const html = await response.text();

      const hasPixelScript = html.includes(pixelUrl) || html.includes(`/t/${slug}/pixel.js`);
      const hasAnyReference = html.includes(slug) && html.includes('pixel.js');

      return res.json({
        installed: hasPixelScript || hasAnyReference,
        url: body.url,
        lastPingAt: config.lastPingAt || null,
        lastPingOrigin: config.lastPingOrigin || null,
        details: {
          scriptTagFound: hasPixelScript,
          slugReferenceFound: hasAnyReference,
          httpStatus: response.status,
        },
      });
    } catch (error) {
      return res.json({
        installed: false,
        url: body.url,
        error: `No se pudo acceder al sitio: ${String(error).substring(0, 100)}`,
        lastPingAt: config.lastPingAt || null,
      });
    }
  }
}
