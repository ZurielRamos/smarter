import { BadRequestException } from '@nestjs/common';
import type { ClientRecord } from '../../records/record.entity';
import { Language, TemplateSyntaxError, collectPaths, parseTemplate } from './contract-engine';

/**
 * Variables disponibles al redactar un contrato. El texto de la plantilla las
 * cita con llaves dobles: {{contacto.nombre_completo}}, {{contrato.tarifa | money}}.
 *
 *   contacto.*   datos del contacto del CRM (fijos + campos personalizados de la cuenta)
 *   contrato.*   datos del contrato (número, fechas, tarifa...)
 *   datos.*      valores libres que se piden al generar cada contrato ({{datos.zona}})
 */

export const LANGUAGES: Language[] = ['es', 'en'];

export interface VariableDef {
  /** Ruta que usa el motor. */
  path: string;
  label: string;
  group: 'contacto' | 'campos' | 'contrato' | 'datos';
  /** Texto que se inserta entre llaves (puede incluir un filtro). */
  insert: string;
  hint?: string;
  /** Posiciones que se retrocede el cursor tras insertar (para completar a mano). */
  caretBack?: number;
}

interface ContactField {
  key: string;
  label: string;
  /** Valor del contacto. */
  get: (r: Partial<ClientRecord>) => string | undefined;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const isoDate = (v: unknown): string | undefined => {
  if (!v) return undefined;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
};

/** Campos fijos del contacto. */
export const CONTACT_FIELDS: ContactField[] = [
  { key: 'nombre_completo', label: 'Nombre completo', get: (r) => str(r.fullName) ?? str([r.firstName, r.lastName].filter(Boolean).join(' ')) },
  { key: 'nombre', label: 'Nombre', get: (r) => str(r.firstName) },
  { key: 'apellido', label: 'Apellido', get: (r) => str(r.lastName) },
  { key: 'tipo_documento', label: 'Tipo de documento', get: (r) => str(r.documentType) },
  { key: 'numero_documento', label: 'Número de documento', get: (r) => str(r.documentNumber) },
  { key: 'correo', label: 'Correo electrónico', get: (r) => str(r.email) },
  { key: 'telefono', label: 'Teléfono', get: (r) => str(r.phone) },
  { key: 'direccion', label: 'Dirección', get: (r) => str(r.address) },
  { key: 'ciudad', label: 'Ciudad', get: (r) => str(r.city) },
  { key: 'departamento', label: 'Departamento / estado / provincia', get: (r) => str(r.region) },
  { key: 'empresa', label: 'Empresa del contacto', get: (r) => str(r.company) },
  { key: 'cargo', label: 'Cargo', get: (r) => str(r.jobTitle) },
  { key: 'fecha_nacimiento', label: 'Fecha de nacimiento', get: (r) => isoDate(r.birthDate) },
  { key: 'genero', label: 'Género', get: (r) => str(r.gender) },
];
const CONTACT_KEYS = new Set(CONTACT_FIELDS.map((f) => f.key));

/** Datos del contrato y cómo se insertan en el texto. */
const CONTRACT_VARIABLES: Array<{ key: string; label: string; insert: string; hint?: string }> = [
  { key: 'numero', label: 'Número del contrato', insert: 'contrato.numero' },
  { key: 'fecha_emision', label: 'Fecha de emisión', insert: 'contrato.fecha_emision | date', hint: 'Fecha en letras: 5 de marzo de 2026' },
  { key: 'fecha_inicio', label: 'Fecha de inicio', insert: 'contrato.fecha_inicio | date' },
  { key: 'fecha_fin', label: 'Fecha de fin', insert: 'contrato.fecha_fin | date', hint: 'Vacía si el contrato es indefinido' },
  { key: 'tarifa', label: 'Tarifa por respuesta aprobada', insert: 'contrato.tarifa | money', hint: 'Con la moneda: 1.500,50 COP' },
  { key: 'tarifa', label: 'Tarifa en letras', insert: 'contrato.tarifa | words', hint: 'mil quinientos con 50/100' },
  { key: 'moneda', label: 'Moneda', insert: 'contrato.moneda' },
  { key: 'pais', label: 'País del contrato', insert: 'contrato.pais' },
];
const CONTRACT_KEYS = new Set(CONTRACT_VARIABLES.map((v) => v.key));

/** Una clave de campo del CRM solo sirve de variable si el motor puede reconocerla. */
const SEGMENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export interface CustomFieldInfo {
  fieldKey: string;
  fieldLabel: string;
  isSystem: boolean;
}

/** Campos personalizados de la cuenta utilizables como variable (excluye los fijos y los de nombre inválido). */
export function usableCustomFields(fields: CustomFieldInfo[]): CustomFieldInfo[] {
  const seen = new Set<string>();
  return fields.filter((f) => {
    if (f.isSystem || CONTACT_KEYS.has(f.fieldKey) || !SEGMENT_RE.test(f.fieldKey) || f.fieldKey.length > 50) return false;
    if (seen.has(f.fieldKey)) return false;
    seen.add(f.fieldKey);
    return true;
  });
}

/** Catálogo que muestra el editor al escribir «{{». */
export function buildVariableCatalog(customFields: CustomFieldInfo[]): VariableDef[] {
  return [
    ...CONTACT_FIELDS.map((f) => ({ path: `contacto.${f.key}`, label: f.label, group: 'contacto' as const, insert: `contacto.${f.key}` })),
    ...usableCustomFields(customFields).map((f) => ({
      path: `contacto.${f.fieldKey}`,
      label: f.fieldLabel,
      group: 'campos' as const,
      insert: `contacto.${f.fieldKey}`,
      hint: 'Campo personalizado del CRM',
    })),
    ...CONTRACT_VARIABLES.map((v) => ({ path: `contrato.${v.key}`, label: v.label, group: 'contrato' as const, insert: v.insert, hint: v.hint })),
    {
      path: 'datos.',
      label: 'Dato a completar al generar el contrato…',
      group: 'datos',
      insert: 'datos.',
      hint: 'Escribe un nombre, por ejemplo datos.zona_de_trabajo',
      caretBack: 2,
    },
  ];
}

// ───────────────────────────── Contexto de redacción ─────────────────────────────

/** Valores del contacto para redactar: campos fijos + campos personalizados + lo capturado a mano. */
export function buildContactContext(
  record: Partial<ClientRecord>,
  overrides: Record<string, string>,
): Record<string, string> {
  const ctx: Record<string, string> = {};
  const custom = record.customData && typeof record.customData === 'object' ? (record.customData as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(custom)) {
    if (!SEGMENT_RE.test(k) || CONTACT_KEYS.has(k)) continue;
    const text = Array.isArray(v) ? v.filter((x) => typeof x === 'string' || typeof x === 'number').join(', ') : typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';
    if (text.trim()) ctx[k] = text.trim();
  }
  for (const f of CONTACT_FIELDS) {
    const v = f.get(record);
    if (v) ctx[f.key] = v;
  }
  for (const [k, v] of Object.entries(overrides)) if (v) ctx[k] = v;
  return ctx;
}

// ───────────────────────────── Análisis del texto ─────────────────────────────

export interface BodyAnalysis {
  errors: string[];
  warnings: string[];
  /** Nombres de los «datos a completar» que usa el texto ({{datos.zona}} → zona). */
  datos: string[];
  usedPaths: string[];
}

/** Valida la sintaxis y que el texto use solo variables que existen. */
export function analyzeBody(body: string, customFieldKeys: Set<string>): BodyAnalysis {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!body.trim()) {
    return { errors: ['El contrato está vacío. Escribe el texto o parte de un modelo de país.'], warnings, datos: [], usedPaths: [] };
  }
  let paths: Set<string>;
  try {
    paths = collectPaths(parseTemplate(body));
  } catch (e) {
    if (e instanceof TemplateSyntaxError) return { errors: [e.message], warnings, datos: [], usedPaths: [] };
    throw e;
  }

  const datos = new Set<string>();
  for (const path of paths) {
    const [root, ...rest] = path.split('.');
    let known = false;
    if (root === 'contacto') known = rest.length === 1 && (CONTACT_KEYS.has(rest[0]) || customFieldKeys.has(rest[0]));
    else if (root === 'contrato') known = rest.length === 1 && CONTRACT_KEYS.has(rest[0]);
    else if (root === 'datos') {
      known = rest.length === 1;
      if (known) datos.add(rest[0]);
    }
    if (!known) {
      errors.push(
        root === 'contacto'
          ? `«{{${path}}}»: el contacto no tiene ese campo. Escribe «{{» y elige uno de la lista.`
          : `La variable «{{${path}}}» no existe. Escribe «{{» y elige una de la lista.`,
      );
    }
  }

  if (!/\{\{\s*contacto\./.test(body)) {
    warnings.push('El texto no usa ningún dato del contacto. Escribe «{{» para insertar su nombre, documento, etc.');
  }
  if (![...paths].some((p) => p.startsWith('contrato.'))) {
    warnings.push('El texto no menciona datos del contrato (tarifa, fechas, número). Escribe «{{» para insertarlos.');
  }
  return { errors, warnings, datos: [...datos].sort(), usedPaths: [...paths].sort() };
}

// ───────────────────────────── Valores al generar ─────────────────────────────

export interface VariableValues {
  /** Valores de {{datos.*}}. */
  datos: Record<string, string>;
  /** Datos del contacto completados a mano para este contrato (prevalecen sobre el CRM). */
  contacto: Record<string, string>;
}

export function sanitizeValues(raw: unknown): VariableValues {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {};
  const pick = (src: unknown, max: number, what: string): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!src || typeof src !== 'object' || Array.isArray(src)) return out;
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (!SEGMENT_RE.test(k) || k.length > 60) continue; // clave inválida: se ignora
      if (v === undefined || v === null || v === '') continue;
      if (typeof v !== 'string' && typeof v !== 'number') throw new BadRequestException(`Valor inválido en ${what}: ${k}`);
      const text = String(v).trim();
      if (text.length > max) throw new BadRequestException(`El valor de «${k}» es demasiado largo`);
      if (text) out[k] = text;
    }
    return out;
  };
  return { datos: pick(input.datos, 2000, 'los datos'), contacto: pick(input.contacto, 300, 'el contacto') };
}

export interface MissingInfo {
  path: string;
  label: string;
  /** Dónde se corrige: ficha del contacto, valor que se escribe al generar, datos del contrato. */
  source: 'contact' | 'input' | 'contract' | 'template';
}

/** Describe una variable sin valor en lenguaje claro, con el campo del CRM si lo es. */
export function describeMissing(path: string, customLabels: Record<string, string>): MissingInfo {
  const [root, key = ''] = path.split('.');
  if (root === 'contacto') {
    const label = CONTACT_FIELDS.find((f) => f.key === key)?.label ?? customLabels[key] ?? key;
    return { path, label: `Contacto: ${label}`, source: 'contact' };
  }
  if (root === 'datos') {
    const label = key.replace(/_/g, ' ');
    return { path, label: label.charAt(0).toUpperCase() + label.slice(1), source: 'input' };
  }
  const label = CONTRACT_VARIABLES.find((v) => v.key === key)?.label ?? key;
  return { path, label: `Contrato: ${label}`, source: 'contract' };
}

// ───────────────────────────── Plantilla ─────────────────────────────

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > 200) {
    throw new BadRequestException('El nombre es obligatorio (máximo 200 caracteres)');
  }
  return raw.trim();
}

export function sanitizeBody(raw: unknown): string {
  if (typeof raw !== 'string') throw new BadRequestException('El texto del contrato es inválido');
  if (raw.length > 200_000) throw new BadRequestException('El texto del contrato es demasiado largo (máximo 200.000 caracteres)');
  return raw;
}

export function sanitizeCountry(raw: unknown): string {
  const c = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(c)) throw new BadRequestException('El país debe ser un código ISO de 2 letras (p. ej. CO)');
  return c;
}

export function sanitizeLanguage(raw: unknown): Language {
  if (typeof raw !== 'string' || !(LANGUAGES as string[]).includes(raw)) throw new BadRequestException('Idioma no disponible');
  return raw as Language;
}

export function sanitizePrefix(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const p = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{1,10}$/.test(p)) throw new BadRequestException('El prefijo de numeración admite hasta 10 letras o números');
  return p;
}
