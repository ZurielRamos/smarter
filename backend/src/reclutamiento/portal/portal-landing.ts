import { BadRequestException } from '@nestjs/common';

/**
 * Landing pública del portal de una cuenta reclutadora. Es un conjunto fijo de
 * secciones que la cuenta activa, ordena y edita; no hay HTML libre. Todo el
 * contenido es texto plano: la interfaz lo muestra escapado.
 *
 * `{{empresa}}` en cualquier texto se reemplaza por el nombre de la cuenta al
 * mostrarlo.
 */

/** Secciones que se pueden activar y ordenar. El encabezado y el pie son fijos. */
export const LANDING_SECTION_IDS = ['hero', 'about', 'benefits', 'steps', 'requirements', 'faq', 'cta'] as const;
export type LandingSectionId = (typeof LANDING_SECTION_IDS)[number];

export const LANDING_FONTS = ['sans', 'serif'] as const;
export type LandingFont = (typeof LANDING_FONTS)[number];

/** Modo de color de la landing: fijo claro u oscuro, o el del dispositivo de quien la visita. */
export const LANDING_APPEARANCES = ['light', 'dark', 'auto'] as const;
export type LandingAppearance = (typeof LANDING_APPEARANCES)[number];

/** Imágenes que se pueden subir y el campo del contenido al que pertenecen. */
export const LANDING_IMAGE_SLOTS = ['logo', 'hero', 'background', 'about'] as const;
export type LandingImageSlot = (typeof LANDING_IMAGE_SLOTS)[number];

/** Prefijo de almacenamiento (canal) de las imágenes de la landing. */
export const LANDING_MEDIA_CHANNEL = 'recruit-landing';

/** Fondo de la portada: ninguno, una imagen subida o un diseño generado con los colores de la marca. */
export const HERO_BACKGROUND_TYPES = ['none', 'image', 'preset'] as const;
export type HeroBackgroundType = (typeof HERO_BACKGROUND_TYPES)[number];

export interface HeroBackground {
  type: HeroBackgroundType;
  imageUrl: string;
  /** Identificador del diseño (la interfaz lo dibuja; uno desconocido se ignora). */
  preset: string;
  /** Oscurecimiento de la imagen, de 0 a 80 %, para que el texto se lea. */
  overlay: number;
}

export interface LandingItem {
  title: string;
  text: string;
  /** Identificador de un icono de la biblioteca de la interfaz (p. ej. «clock»); vacío usa el predeterminado. */
  icon: string;
}

export interface LandingConfig {
  /** Interruptor de publicación: apagada, el portal muestra solo el acceso. */
  enabled: boolean;
  brand: { primaryColor: string; font: LandingFont; appearance: LandingAppearance; logoUrl: string; showName: boolean };
  /** Orden y visibilidad de las secciones. */
  sections: Array<{ id: LandingSectionId; enabled: boolean }>;
  content: {
    hero: { title: string; subtitle: string; ctaLabel: string; imageUrl: string; background: HeroBackground };
    about: { title: string; body: string; imageUrl: string };
    benefits: { title: string; items: LandingItem[] };
    steps: { title: string; items: LandingItem[] };
    requirements: { title: string; items: string[] };
    faq: { title: string; items: Array<{ question: string; answer: string }> };
    cta: { title: string; text: string; buttonLabel: string };
    footer: { text: string; email: string; phone: string; links: Array<{ label: string; url: string }> };
  };
}

export const DEFAULT_LANDING: LandingConfig = {
  enabled: false,
  brand: { primaryColor: '#2563eb', font: 'sans', appearance: 'light', logoUrl: '', showName: true },
  sections: [
    { id: 'hero', enabled: true },
    { id: 'about', enabled: true },
    { id: 'benefits', enabled: true },
    { id: 'steps', enabled: true },
    { id: 'requirements', enabled: false },
    { id: 'faq', enabled: false },
    { id: 'cta', enabled: true },
  ],
  content: {
    hero: {
      title: 'Trabaja con {{empresa}}',
      subtitle: 'Regístrate, completa tu información y firma tu contrato en línea.',
      ctaLabel: 'Quiero registrarme',
      imageUrl: '',
      background: { type: 'none', imageUrl: '', preset: 'degradado', overlay: 45 },
    },
    about: {
      title: 'Sobre el proyecto',
      body: 'Cuéntale a las personas qué hace {{empresa}}, en qué consiste el trabajo y por qué vale la pena participar.',
      imageUrl: '',
    },
    benefits: {
      title: 'Por qué unirte',
      items: [
        { title: 'Trabajo flexible', text: 'Tú decides cuándo y cuánto participar.', icon: 'clock' },
        { title: 'Todo en línea', text: 'Te registras, subes tus documentos y firmas sin desplazarte.', icon: 'laptop' },
        { title: 'Pagos claros', text: 'Conoces las condiciones antes de firmar.', icon: 'wallet' },
      ],
    },
    steps: {
      title: 'Cómo funciona',
      items: [
        { title: 'Regístrate', text: 'Verifica tu correo o tu WhatsApp con un código.', icon: '' },
        { title: 'Completa tu perfil', text: 'Llena tus datos y sube los documentos que te pedimos.', icon: '' },
        { title: 'Firma tu contrato', text: 'Cuando tu perfil esté listo, firmas en línea.', icon: '' },
      ],
    },
    requirements: {
      title: 'Requisitos',
      items: ['Ser mayor de edad', 'Contar con un documento de identidad vigente', 'Tener un teléfono con WhatsApp o un correo electrónico'],
    },
    faq: {
      title: 'Preguntas frecuentes',
      items: [{ question: '¿Tiene algún costo registrarme?', answer: 'No. El registro no tiene ningún costo.' }],
    },
    cta: {
      title: '¿Listo para empezar?',
      text: 'El registro toma pocos minutos.',
      buttonLabel: 'Registrarme ahora',
    },
    footer: { text: '', email: '', phone: '', links: [] },
  },
};

/**
 * Valores iniciales de la landing de un proyecto. Usa `{{proyecto}}` (el nombre
 * público del proyecto) en lugar de `{{empresa}}`.
 */
export const DEFAULT_PROJECT_LANDING: LandingConfig = {
  ...DEFAULT_LANDING,
  content: {
    ...DEFAULT_LANDING.content,
    hero: {
      ...DEFAULT_LANDING.content.hero,
      title: 'Súmate a {{proyecto}}',
      subtitle: 'Postúlate en pocos minutos y entérate si encajas en el proyecto.',
      ctaLabel: 'Quiero postularme',
    },
    about: {
      ...DEFAULT_LANDING.content.about,
      body: 'Cuéntale a las personas en qué consiste {{proyecto}}, qué tendrán que hacer y por qué vale la pena participar.',
    },
    cta: { title: '¿Listo para postularte?', text: 'Llenar el formulario toma pocos minutos.', buttonLabel: 'Postularme ahora' },
  },
};

/** Valor simple escogido para cada texto: quita caracteres de control y recorta. */
const clean = (v: string) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();

function text(v: unknown, field: string, max: number, fallback: string, multiline = false): string {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== 'string') throw new BadRequestException(`${field} es inválido`);
  const t = clean(multiline ? v : v.replace(/[\r\n]+/g, ' '));
  if (t.length > max) throw new BadRequestException(`${field} no puede superar ${max} caracteres`);
  return t;
}

function list<T>(v: unknown, field: string, max: number, fallback: T[], map: (item: Record<string, unknown>, i: number) => T): T[] {
  if (v === undefined || v === null) return fallback;
  if (!Array.isArray(v)) throw new BadRequestException(`${field} es inválido`);
  if (v.length > max) throw new BadRequestException(`${field} admite máximo ${max} elementos`);
  return v.map((item, i) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) throw new BadRequestException(`${field} es inválido`);
    return map(item as Record<string, unknown>, i);
  });
}

/** Identificador de icono: minúsculas, números y guiones. La interfaz ignora los que no conoce. */
function iconId(v: unknown, field: string): string {
  const id = text(v, `El icono en ${field}`, 40, '');
  if (!/^[a-z0-9-]*$/.test(id)) throw new BadRequestException(`El icono en ${field} es inválido`);
  return id;
}

function stringList(v: unknown, field: string, max: number, maxLen: number, fallback: string[]): string[] {
  if (v === undefined || v === null) return fallback;
  if (!Array.isArray(v)) throw new BadRequestException(`${field} es inválido`);
  if (v.length > max) throw new BadRequestException(`${field} admite máximo ${max} elementos`);
  return v.map((x) => text(x, `Un elemento de ${field}`, maxLen, '')).filter(Boolean);
}

function obj(v: unknown, field: string): Record<string, unknown> {
  if (v === undefined || v === null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new BadRequestException(`${field} es inválido`);
  return v as Record<string, unknown>;
}

/** Enlaces del pie: solo http(s). Evita `javascript:` y similares. */
export function isSafeLink(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export interface LandingParseContext {
  /** ¿Es una URL de imagen que subió esta cuenta a su carpeta de landing? */
  isOwnImage: (url: string) => boolean;
}

function image(v: unknown, field: string, fallback: string, ctx: LandingParseContext): string {
  const url = text(v, field, 600, fallback);
  if (url && !ctx.isOwnImage(url)) throw new BadRequestException(`${field} no es una imagen subida desde el editor`);
  return url;
}

/** Variante tolerante para leer lo guardado: completa con los valores por defecto lo que falte o sea inválido. */
export function mergeLanding(saved: unknown, defaults: LandingConfig = DEFAULT_LANDING): LandingConfig {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return structuredClone(defaults);
  try {
    // Lo guardado ya se validó al escribir: aquí solo se normaliza.
    return parseLanding(saved, { isOwnImage: () => true }, defaults);
  } catch {
    return structuredClone(defaults);
  }
}

/**
 * Valida y normaliza la landing que envía la interfaz. Lo que no se envía toma
 * el valor por defecto. Lanza BadRequest ante cualquier valor inválido.
 */
export function parseLanding(raw: unknown, ctx: LandingParseContext, defaults: LandingConfig = DEFAULT_LANDING): LandingConfig {
  const d = defaults;
  const input = obj(raw, 'La landing');
  const brand = obj(input.brand, 'La marca');
  const content = obj(input.content, 'El contenido');

  const color = typeof brand.primaryColor === 'string' ? brand.primaryColor.trim() : d.brand.primaryColor;
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new BadRequestException('El color de marca debe tener formato #RRGGBB');
  const font = (brand.font ?? d.brand.font) as LandingFont;
  if (!(LANDING_FONTS as readonly string[]).includes(font)) throw new BadRequestException('La tipografía es inválida');

  const appearance = (brand.appearance ?? d.brand.appearance) as LandingAppearance;
  if (!(LANDING_APPEARANCES as readonly string[]).includes(appearance)) throw new BadRequestException('La apariencia es inválida');

  // Secciones: cada una una sola vez; las que falten se agregan al final, desactivadas.
  const sections: LandingConfig['sections'] = [];
  const seen = new Set<string>();
  const rawSections = input.sections === undefined ? d.sections : input.sections;
  if (!Array.isArray(rawSections)) throw new BadRequestException('Las secciones son inválidas');
  for (const item of rawSections) {
    const s = obj(item, 'Una sección');
    const id = String(s.id ?? '');
    if (!(LANDING_SECTION_IDS as readonly string[]).includes(id)) throw new BadRequestException(`La sección «${id}» no existe`);
    if (seen.has(id)) throw new BadRequestException(`La sección «${id}» está repetida`);
    seen.add(id);
    sections.push({ id: id as LandingSectionId, enabled: s.enabled === true });
  }
  for (const id of LANDING_SECTION_IDS) if (!seen.has(id)) sections.push({ id, enabled: false });

  const hero = obj(content.hero, 'La portada');
  const bg = obj(hero.background, 'El fondo de la portada');
  const bgType = (bg.type ?? 'none') as HeroBackgroundType;
  if (!(HERO_BACKGROUND_TYPES as readonly string[]).includes(bgType)) throw new BadRequestException('El tipo de fondo es inválido');
  const preset = text(bg.preset, 'El diseño del fondo', 30, d.content.hero.background.preset);
  if (!/^[a-z0-9-]*$/.test(preset)) throw new BadRequestException('El diseño del fondo es inválido');
  const overlay = bg.overlay === undefined || bg.overlay === null ? d.content.hero.background.overlay : Number(bg.overlay);
  if (!Number.isInteger(overlay) || overlay < 0 || overlay > 80) throw new BadRequestException('El oscurecimiento debe estar entre 0 y 80');
  const about = obj(content.about, 'La sección «Sobre el proyecto»');
  const benefits = obj(content.benefits, 'La sección de beneficios');
  const steps = obj(content.steps, 'La sección de pasos');
  const reqs = obj(content.requirements, 'La sección de requisitos');
  const faq = obj(content.faq, 'La sección de preguntas');
  const cta = obj(content.cta, 'El llamado final');
  const footer = obj(content.footer, 'El pie de página');
  const dc = d.content;

  const items = (v: unknown, field: string, fallback: LandingItem[]) =>
    list(v, field, 8, fallback, (it) => ({
      title: text(it.title, `El título en ${field}`, 80, ''),
      text: text(it.text, `El texto en ${field}`, 300, '', true),
      icon: iconId(it.icon, field),
    }));

  return {
    enabled: input.enabled === true,
    brand: {
      primaryColor: color.toLowerCase(),
      font,
      appearance,
      logoUrl: image(brand.logoUrl, 'El logo', d.brand.logoUrl, ctx),
      showName: brand.showName !== false,
    },
    sections,
    content: {
      hero: {
        title: text(hero.title, 'El título de la portada', 120, dc.hero.title),
        subtitle: text(hero.subtitle, 'El subtítulo de la portada', 300, dc.hero.subtitle, true),
        ctaLabel: text(hero.ctaLabel, 'El botón de la portada', 40, dc.hero.ctaLabel),
        imageUrl: image(hero.imageUrl, 'La imagen de la portada', dc.hero.imageUrl, ctx),
        background: { type: bgType, imageUrl: image(bg.imageUrl, 'La imagen de fondo', '', ctx), preset, overlay },
      },
      about: {
        title: text(about.title, 'El título de «Sobre el proyecto»', 120, dc.about.title),
        body: text(about.body, 'El texto de «Sobre el proyecto»', 3000, dc.about.body, true),
        imageUrl: image(about.imageUrl, 'La imagen de «Sobre el proyecto»', dc.about.imageUrl, ctx),
      },
      benefits: { title: text(benefits.title, 'El título de beneficios', 120, dc.benefits.title), items: items(benefits.items, 'beneficios', dc.benefits.items) },
      steps: { title: text(steps.title, 'El título de pasos', 120, dc.steps.title), items: items(steps.items, 'pasos', dc.steps.items) },
      requirements: {
        title: text(reqs.title, 'El título de requisitos', 120, dc.requirements.title),
        items: stringList(reqs.items, 'requisitos', 12, 200, dc.requirements.items),
      },
      faq: {
        title: text(faq.title, 'El título de preguntas', 120, dc.faq.title),
        items: list(faq.items, 'preguntas', 12, dc.faq.items, (it) => ({
          question: text(it.question, 'Una pregunta', 200, ''),
          answer: text(it.answer, 'Una respuesta', 1000, '', true),
        })),
      },
      cta: {
        title: text(cta.title, 'El título del llamado final', 120, dc.cta.title),
        text: text(cta.text, 'El texto del llamado final', 300, dc.cta.text, true),
        buttonLabel: text(cta.buttonLabel, 'El botón del llamado final', 40, dc.cta.buttonLabel),
      },
      footer: {
        text: text(footer.text, 'El texto del pie', 300, dc.footer.text, true),
        email: text(footer.email, 'El correo de contacto', 200, dc.footer.email),
        phone: text(footer.phone, 'El teléfono de contacto', 40, dc.footer.phone),
        links: list(footer.links, 'enlaces', 6, dc.footer.links, (l) => {
          const url = text(l.url, 'La dirección de un enlace', 500, '');
          if (!isSafeLink(url)) throw new BadRequestException('Los enlaces del pie deben empezar por https:// o http://');
          return { label: text(l.label, 'El texto de un enlace', 60, '') || url, url };
        }),
      },
    },
  };
}

/** URLs de imagen que usa una landing (para borrar del almacenamiento las que se quitan). */
export function landingImageUrls(l: LandingConfig): string[] {
  return [l.brand.logoUrl, l.content.hero.imageUrl, l.content.hero.background.imageUrl, l.content.about.imageUrl].filter(Boolean);
}
