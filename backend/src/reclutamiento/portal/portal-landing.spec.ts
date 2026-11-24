import { BadRequestException } from '@nestjs/common';
import { DEFAULT_LANDING, LANDING_SECTION_IDS, landingImageUrls, mergeLanding, parseLanding } from './portal-landing';

const own = 'https://cdn.example.com/media/t1/recruit-landing/landing/hero/a.webp';
const ctx = { isOwnImage: (url: string) => url.startsWith('https://cdn.example.com/media/t1/recruit-landing/') };

describe('parseLanding', () => {
  it('con una entrada vacía devuelve los valores por defecto, apagada', () => {
    const l = parseLanding({}, ctx);
    expect(l.enabled).toBe(false);
    expect(l.brand.primaryColor).toBe(DEFAULT_LANDING.brand.primaryColor);
    expect(l.content.hero.title).toBe(DEFAULT_LANDING.content.hero.title);
    expect(l.sections.map((s) => s.id).sort()).toEqual([...LANDING_SECTION_IDS].sort());
  });

  it('respeta el orden y la visibilidad, y agrega las secciones faltantes desactivadas al final', () => {
    const l = parseLanding({ sections: [{ id: 'faq', enabled: true }, { id: 'hero', enabled: true }] }, ctx);
    expect(l.sections.slice(0, 2)).toEqual([
      { id: 'faq', enabled: true },
      { id: 'hero', enabled: true },
    ]);
    expect(l.sections).toHaveLength(LANDING_SECTION_IDS.length);
    expect(l.sections.slice(2).every((s) => !s.enabled)).toBe(true);
  });

  it('rechaza secciones desconocidas o repetidas', () => {
    expect(() => parseLanding({ sections: [{ id: 'script', enabled: true }] }, ctx)).toThrow(BadRequestException);
    expect(() => parseLanding({ sections: [{ id: 'hero' }, { id: 'hero' }] }, ctx)).toThrow(BadRequestException);
  });

  it('valida el color y la tipografía', () => {
    expect(() => parseLanding({ brand: { primaryColor: 'red' } }, ctx)).toThrow(BadRequestException);
    expect(() => parseLanding({ brand: { primaryColor: '#12345' } }, ctx)).toThrow(BadRequestException);
    expect(() => parseLanding({ brand: { font: 'comic' } }, ctx)).toThrow(BadRequestException);
    expect(parseLanding({ brand: { primaryColor: '#ABCDEF' } }, ctx).brand.primaryColor).toBe('#abcdef');
  });

  it('la apariencia por defecto es automática y solo admite claro, oscuro o automático', () => {
    expect(parseLanding({}, ctx).brand.appearance).toBe('light');
    expect(parseLanding({ brand: { appearance: 'dark' } }, ctx).brand.appearance).toBe('dark');
    expect(() => parseLanding({ brand: { appearance: 'sepia' } }, ctx)).toThrow(BadRequestException);
  });

  it('solo acepta imágenes subidas desde el editor de la propia cuenta', () => {
    expect(parseLanding({ content: { hero: { imageUrl: own } } }, ctx).content.hero.imageUrl).toBe(own);
    expect(() => parseLanding({ content: { hero: { imageUrl: 'https://evil.example/pixel.png' } } }, ctx)).toThrow(BadRequestException);
    expect(() => parseLanding({ brand: { logoUrl: 'javascript:alert(1)' } }, ctx)).toThrow(BadRequestException);
    expect(() => parseLanding({ content: { hero: { imageUrl: own.replace('t1', 't2') } } }, ctx)).toThrow(BadRequestException);
  });

  it('los elementos llevan un icono opcional (solo identificadores simples)', () => {
    const l = parseLanding({ content: { benefits: { items: [{ title: 'a', text: 'b', icon: 'wallet' }, { title: 'c', text: 'd' }] } } }, ctx);
    expect(l.content.benefits.items.map((i) => i.icon)).toEqual(['wallet', '']);
    expect(parseLanding({}, ctx).content.benefits.items.map((i) => i.icon)).toEqual(['clock', 'laptop', 'wallet']);
    for (const icon of ['<script>', 'Wallet', '../x', 'a b', 'a'.repeat(41), 5]) {
      expect(() => parseLanding({ content: { benefits: { items: [{ title: 'a', text: 'b', icon }] } } }, ctx)).toThrow(BadRequestException);
    }
  });

  it('el fondo de la portada: tipo, diseño, oscurecimiento e imagen propia', () => {
    expect(parseLanding({}, ctx).content.hero.background).toEqual({ type: 'none', imageUrl: '', preset: 'degradado', overlay: 45 });
    const bg = parseLanding({ content: { hero: { background: { type: 'image', imageUrl: own, overlay: 60 } } } }, ctx).content.hero.background;
    expect(bg).toMatchObject({ type: 'image', imageUrl: own, overlay: 60 });
    expect(parseLanding({ content: { hero: { background: { type: 'preset', preset: 'aurora' } } } }, ctx).content.hero.background.preset).toBe('aurora');
    for (const background of [{ type: 'video' }, { overlay: 81 }, { overlay: -1 }, { overlay: 1.5 }, { preset: 'a b' }, { preset: '../x' }, { imageUrl: 'https://evil.example/x.png' }]) {
      expect(() => parseLanding({ content: { hero: { background } } }, ctx)).toThrow(BadRequestException);
    }
  });

  it('las imágenes de fondo cuentan como imágenes en uso', () => {
    const l = parseLanding({ content: { hero: { background: { type: 'image', imageUrl: own } } } }, ctx);
    expect(landingImageUrls(l)).toEqual([own]);
  });

  it('solo acepta enlaces http(s) en el pie', () => {
    const ok = parseLanding({ content: { footer: { links: [{ label: 'Privacidad', url: 'https://example.com/privacidad' }] } } }, ctx);
    expect(ok.content.footer.links).toEqual([{ label: 'Privacidad', url: 'https://example.com/privacidad' }]);
    for (const url of ['javascript:alert(1)', 'data:text/html,hola', 'mailto:a@b.co', 'ftp://x.com', '/relativo']) {
      expect(() => parseLanding({ content: { footer: { links: [{ label: 'x', url }] } } }, ctx)).toThrow(BadRequestException);
    }
  });

  it('limita longitudes y cantidades', () => {
    expect(() => parseLanding({ content: { hero: { title: 'a'.repeat(121) } } }, ctx)).toThrow(BadRequestException);
    const nine = Array.from({ length: 9 }, () => ({ title: 't', text: 'x' }));
    expect(() => parseLanding({ content: { benefits: { items: nine } } }, ctx)).toThrow(BadRequestException);
    expect(() => parseLanding({ content: { hero: { title: 123 } } }, ctx)).toThrow(BadRequestException);
    expect(() => parseLanding({ content: { faq: { items: 'no' } } }, ctx)).toThrow(BadRequestException);
  });

  it('quita caracteres de control y saltos de línea de los textos de una línea', () => {
    const l = parseLanding({ content: { hero: { title: 'Hola\u0000\nmundo' } } }, ctx);
    expect(l.content.hero.title).toBe('Hola mundo');
  });

  it('permite vaciar listas', () => {
    const l = parseLanding({ content: { requirements: { items: [] }, benefits: { items: [] } } }, ctx);
    expect(l.content.requirements.items).toEqual([]);
    expect(l.content.benefits.items).toEqual([]);
  });

  it('solo `enabled: true` publica', () => {
    expect(parseLanding({ enabled: 'true' }, ctx).enabled).toBe(false);
    expect(parseLanding({ enabled: true }, ctx).enabled).toBe(true);
  });
});

describe('mergeLanding', () => {
  it('devuelve los valores por defecto si lo guardado falta o es inválido', () => {
    expect(mergeLanding(undefined)).toEqual(DEFAULT_LANDING);
    expect(mergeLanding({ brand: { primaryColor: 'nope' } })).toEqual(DEFAULT_LANDING);
  });

  it('no comparte referencias con los valores por defecto', () => {
    const a = mergeLanding(undefined);
    a.content.hero.title = 'cambiado';
    expect(DEFAULT_LANDING.content.hero.title).not.toBe('cambiado');
  });
});

describe('landingImageUrls', () => {
  it('lista las imágenes usadas', () => {
    const l = parseLanding({ brand: { logoUrl: own }, content: { hero: { imageUrl: own } } }, ctx);
    expect(landingImageUrls(l)).toEqual([own, own]);
    expect(landingImageUrls(parseLanding({}, ctx))).toEqual([]);
  });
});
