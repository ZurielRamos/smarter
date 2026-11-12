/**
 * Campos de atribución (first touch / last touch) de la tabla `clients`.
 *
 * Fuente única para todas las capas que traducen "campo del contacto" a columna
 * (listado, filtros, listas dinámicas, segmentos, variables de plantillas y
 * flujos, automatizaciones). Si se agrega o renombra una columna de atribución,
 * se cambia solo aquí.
 *
 * Son campos de SOLO LECTURA: los escribe únicamente el módulo de conversiones.
 */

export const ATTRIBUTION_GROUP = 'atribucion';

export interface AttributionFieldDef {
  /** Propiedad camelCase en ClientRecord */
  key: string;
  /** Columna snake_case en la tabla clients */
  column: string;
  label: string;
  type: 'text' | 'date';
  /** Tiene pocos valores distintos: sirve como lista en segmentos. */
  listable: boolean;
}

const PARTS: Array<{ suffix: string; column: string; label: string; type: 'text' | 'date'; listable: boolean }> = [
  { suffix: 'Platform', column: 'platform', label: 'plataforma', type: 'text', listable: true },
  { suffix: 'Medium', column: 'medium', label: 'medio', type: 'text', listable: true },
  { suffix: 'Campaign', column: 'campaign', label: 'campaña', type: 'text', listable: true },
  { suffix: 'Content', column: 'content', label: 'contenido', type: 'text', listable: true },
  { suffix: 'Term', column: 'term', label: 'término', type: 'text', listable: true },
  { suffix: 'ClickId', column: 'click_id', label: 'click ID', type: 'text', listable: false },
  { suffix: 'LandingPage', column: 'landing_page', label: 'landing', type: 'text', listable: false },
  { suffix: 'Referrer', column: 'referrer', label: 'referrer', type: 'text', listable: false },
  { suffix: 'At', column: 'at', label: 'fecha', type: 'date', listable: false },
];

const TOUCHES: Array<{ prefix: 'first' | 'last'; title: string }> = [
  { prefix: 'first', title: 'Primer toque' },
  { prefix: 'last', title: 'Último toque' },
];

export const ATTRIBUTION_FIELDS: AttributionFieldDef[] = TOUCHES.flatMap((t) =>
  PARTS.map((p) => ({
    key: `${t.prefix}Touch${p.suffix}`,
    column: `${t.prefix}_touch_${p.column}`,
    label: `${t.title}: ${p.label}`,
    type: p.type,
    listable: p.listable,
  })),
);

export const ATTRIBUTION_FIELD_KEYS: string[] = ATTRIBUTION_FIELDS.map((f) => f.key);

/** camelCase -> snake_case */
export const ATTRIBUTION_COLUMN_MAP: Record<string, string> = Object.fromEntries(
  ATTRIBUTION_FIELDS.map((f) => [f.key, f.column]),
);

/** Claves de tipo fecha (timestamptz). */
export const ATTRIBUTION_TIMESTAMP_KEYS: string[] = ATTRIBUTION_FIELDS.filter((f) => f.type === 'date').map(
  (f) => f.key,
);

/** camelCase -> snake_case solo de los campos con pocos valores (para listas de segmentos). */
export const ATTRIBUTION_LIST_COLUMN_MAP: Record<string, string> = Object.fromEntries(
  ATTRIBUTION_FIELDS.filter((f) => f.listable).map((f) => [f.key, f.column]),
);

/**
 * Propiedades de ClientRecord que no deben poder escribirse desde la API,
 * el editor ni importaciones: las mantiene el módulo de conversiones.
 */
const READ_ONLY_RECORD_KEYS = new Set<string>([...ATTRIBUTION_FIELD_KEYS, 'firstAdEventId', 'lastAdEventId']);

/** Devuelve una copia sin las propiedades de solo lectura de atribución. */
export function stripReadOnlyRecordFields<T extends Record<string, any>>(data: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (!READ_ONLY_RECORD_KEYS.has(k)) out[k] = v;
  }
  return out as T;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `channelSource` a veces guarda el UUID de un inbox. Ese identificador no debe
 * llegar a un mensaje de cliente final: se devuelve vacío si parece un UUID.
 */
export function publicChannelSource(value: unknown): string {
  if (typeof value !== 'string') return '';
  return UUID_RE.test(value.trim()) ? '' : value;
}

/**
 * Valor de un campo de atribución listo para sustituir en un texto
 * ({{firstTouchCampaign}}). Devuelve undefined si la clave no es de atribución.
 * Las fechas salen como dd/mm/yyyy en America/Bogota.
 */
export function getAttributionValue(record: object, key: string): string | undefined {
  if (!(key in ATTRIBUTION_COLUMN_MAP)) return undefined;
  const raw = (record as Record<string, unknown>)[key];
  if (raw == null || raw === '') return '';
  if (raw instanceof Date || ATTRIBUTION_TIMESTAMP_KEYS.includes(key)) {
    const d = raw instanceof Date ? raw : new Date(String(raw));
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }
  return String(raw);
}
