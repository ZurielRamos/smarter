import { classifyReferrer, hasAttributionData, ConversionsService } from './conversions.service';
import { LinkTrackerController } from './link-tracker.controller';

describe('classifyReferrer', () => {
  const lp = 'https://miweb.com/landing';
  it('clasifica buscadores como organic', () => {
    expect(classifyReferrer('https://www.google.com.mx/', lp)).toEqual({ source: 'google', medium: 'organic' });
    expect(classifyReferrer('https://www.bing.com/search?q=x', lp)).toEqual({ source: 'bing', medium: 'organic' });
  });
  it('clasifica redes sociales como social', () => {
    expect(classifyReferrer('https://l.facebook.com/l.php', lp)).toEqual({ source: 'facebook', medium: 'social' });
    expect(classifyReferrer('https://t.co/abc', lp)).toEqual({ source: 'twitter', medium: 'social' });
  });
  it('clasifica otros sitios como referral', () => {
    expect(classifyReferrer('https://blog.ejemplo.org/post', lp)).toEqual({ source: 'blog.ejemplo.org', medium: 'referral' });
  });
  it('ignora el propio sitio, vacío o inválido', () => {
    expect(classifyReferrer('https://miweb.com/otra', lp)).toBeNull();
    expect(classifyReferrer('https://www.miweb.com/', lp)).toBeNull();
    expect(classifyReferrer('', lp)).toBeNull();
    expect(classifyReferrer('no-es-url', lp)).toBeNull();
  });
});

describe('hasAttributionData', () => {
  it('los IDs de campaña solos no cuentan como atribución', () => {
    expect(hasAttributionData({ campaign_id: '1' })).toBe(false);
    expect(hasAttributionData({ campaign_id: '1', utm_source: 'meta' })).toBe(true);
  });
});

describe('trackFromUrlParams', () => {
  let service: ConversionsService;
  let trackEvent: jest.SpyInstance;
  beforeEach(() => {
    service = new ConversionsService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    trackEvent = jest.spyOn(service, 'trackEvent').mockResolvedValue({ id: 'e1' } as any);
  });

  it('visita sin parámetros ni referrer: no crea evento', async () => {
    expect(await service.trackFromUrlParams('t', {}, { allowReferrerOnly: true })).toBeNull();
    expect(trackEvent).not.toHaveBeenCalled();
  });
  it('sin parámetros y con referrer externo: crea evento organic solo si se permite', async () => {
    const ctx = { referrer: 'https://www.google.com/', landingPage: 'https://miweb.com/' };
    expect(await service.trackFromUrlParams('t', {}, ctx)).toBeNull();
    await service.trackFromUrlParams('t', {}, { ...ctx, allowReferrerOnly: true });
    expect(trackEvent).toHaveBeenCalledWith(expect.objectContaining({ platform: 'organic', utmSource: 'google', utmMedium: 'organic' }));
  });
  it('guarda campaign/adset/ad id en metadata', async () => {
    await service.trackFromUrlParams('t', { gclid: 'g1', campaignid: '111', adset_id: '222', ad_id: '333' }, {});
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'google', metadata: { campaignId: '111', adsetId: '222', adId: '333' } }),
    );
  });
});

describe('pixel.js generado', () => {
  it('es JavaScript válido y expone SmarterTrack', async () => {
    const tenantRepo: any = {
      findOne: async () => ({ id: 't', trackingConfig: { pixelToken: 'tok', codePattern: 'ref-{{code}}' } }),
    };
    const ctrl = new LinkTrackerController(tenantRepo, {} as any);
    let body = '';
    const res: any = { status: () => res, send: (b: string) => { body = b; return res; }, setHeader: () => undefined };
    await ctrl.getPixelScript('demo', res);
    expect(() => new Function(body)).not.toThrow();
    expect(body).toContain('window.SmarterTrack');
    expect(body).toContain('a[href^="whatsapp:"]');
  });
});
