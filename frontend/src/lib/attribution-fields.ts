/**
 * Campos de atribución (first / last touch) del contacto.
 * Mantener alineado con backend/src/records/attribution-fields.ts.
 * Son de solo lectura: los escribe el módulo de conversiones.
 */

export interface AttributionFieldDef {
  key: string;
  label: string;
  type: "text" | "date";
  /** Pocos valores distintos: se ofrece como lista en segmentos. */
  listable: boolean;
}

const PARTS: Array<{ suffix: string; label: string; type: "text" | "date"; listable: boolean }> = [
  { suffix: "Platform", label: "plataforma", type: "text", listable: true },
  { suffix: "Medium", label: "medio", type: "text", listable: true },
  { suffix: "Campaign", label: "campaña", type: "text", listable: true },
  { suffix: "Content", label: "contenido", type: "text", listable: true },
  { suffix: "Term", label: "término", type: "text", listable: true },
  { suffix: "ClickId", label: "click ID", type: "text", listable: false },
  { suffix: "LandingPage", label: "landing", type: "text", listable: false },
  { suffix: "Referrer", label: "referrer", type: "text", listable: false },
  { suffix: "At", label: "fecha", type: "date", listable: false },
];

const TOUCHES: Array<{ prefix: "first" | "last"; title: string }> = [
  { prefix: "first", title: "Primer toque" },
  { prefix: "last", title: "Último toque" },
];

export const ATTRIBUTION_FIELDS: AttributionFieldDef[] = TOUCHES.flatMap((t) =>
  PARTS.map((p) => ({
    key: `${t.prefix}Touch${p.suffix}`,
    label: `${t.title}: ${p.label}`,
    type: p.type,
    listable: p.listable,
  })),
);

export const ATTRIBUTION_FIELD_KEYS: string[] = ATTRIBUTION_FIELDS.map((f) => f.key);

/** Claves con pocos valores distintos (listas en segmentos). */
export const ATTRIBUTION_LIST_KEYS: string[] = ATTRIBUTION_FIELDS.filter((f) => f.listable).map((f) => f.key);

export const ATTRIBUTION_GROUP = "atribucion";

export const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  microsoft: "Microsoft Ads",
  tiktok: "TikTok Ads",
  linkedin: "LinkedIn Ads",
  twitter: "X Ads",
  organic: "Orgánico",
  direct: "Directo",
};

export const platformLabel = (p?: string | null): string => (p ? PLATFORM_LABELS[p] || p : "—");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `channelSource` puede guardar el UUID de un inbox. */
export const isUuid = (v?: string | null): boolean => !!v && UUID_RE.test(v.trim());
