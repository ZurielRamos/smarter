import { BadRequestException } from '@nestjs/common';
import type { TargetFieldDefinition } from '../etl/processors/transform.processor';
import { OrganizationInput, parseOrganizationInput } from './organization-input';

/**
 * Campos destino de la importación de empresas y su conversión a la entrada
 * validada de `parseOrganizationInput` (la misma que usa el formulario). Así el
 * archivo cumple exactamente las reglas de una empresa creada a mano.
 */

const f = (
  field: string,
  label: string,
  category: string,
  type: TargetFieldDefinition['type'] = 'text',
  extra: Partial<TargetFieldDefinition> = {},
): TargetFieldDefinition => ({ field, label, required: false, type, allowMultiple: false, category, ...extra });

export const COMPANY_TARGET_FIELDS: TargetFieldDefinition[] = [
  f('name', 'Nombre comercial', 'General', 'text', { required: true, allowMultiple: true }),
  f('legalName', 'Razón social', 'General'),
  f('type', 'Tipo (cliente, establecimiento, otro)', 'General', 'list'),
  f('status', 'Estado (activa, inactiva)', 'General', 'list'),
  f('parent', 'Empresa matriz (nombre o documento)', 'General'),
  f('industry', 'Sector o categoría', 'General'),
  f('size', 'Tamaño de la empresa', 'Tamaño', 'list'),
  f('employeeRange', 'Número de empleados', 'Tamaño', 'list'),
  f('documentType', 'Tipo de documento', 'Documento'),
  f('documentNumber', 'Número de documento', 'Documento'),
  f('phone1', 'Teléfono', 'Contacto'),
  f('phone2', 'Teléfono 2', 'Contacto'),
  f('email', 'Correo', 'Contacto'),
  f('website', 'Sitio web', 'Contacto'),
  f('address', 'Dirección', 'Ubicación', 'text', { allowMultiple: true }),
  f('postalCode', 'Código postal', 'Ubicación'),
  f('city', 'Ciudad', 'Ubicación'),
  f('region', 'Región', 'Ubicación'),
  f('countryCode', 'País (código de 2 letras)', 'Ubicación'),
  f('lat', 'Latitud', 'Ubicación', 'number'),
  f('lng', 'Longitud', 'Ubicación', 'number'),
  f('openingHours', 'Horario de atención', 'Ubicación'),
  f('tags', 'Etiquetas (separadas por ; o ,)', 'Notas'),
  f('notes', 'Notas internas', 'Notas', 'text', { allowMultiple: true }),
];

export const COMPANY_FIELD_KEYS = new Set(COMPANY_TARGET_FIELDS.map((x) => x.field));

/** Campos por los que se puede detectar una empresa ya existente. */
export const COMPANY_MATCH_FIELDS = ['documentNumber', 'name', 'email', 'phone1'] as const;
export type CompanyMatchField = (typeof COMPANY_MATCH_FIELDS)[number];

/** Campo de importación al que pertenece cada clave de `OrganizationInput`. */
const INPUT_TO_FIELD: Record<string, string> = { phones: 'phone1' };

const plain = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const TYPE_VALUES: Record<string, string> = {
  cliente: 'client',
  client: 'client',
  establecimiento: 'establishment',
  establishment: 'establishment',
  otro: 'other',
  other: 'other',
};
const STATUS_VALUES: Record<string, string> = {
  activa: 'active',
  activo: 'active',
  active: 'active',
  inactiva: 'inactive',
  inactivo: 'inactive',
  inactive: 'inactive',
};
const SIZE_VALUES: Record<string, string> = {
  micro: 'micro',
  microempresa: 'micro',
  pequena: 'small',
  small: 'small',
  mediana: 'medium',
  medium: 'medium',
  grande: 'large',
  large: 'large',
};

/** "1 a 10", "1-10", "501 a 1.000", "Más de 5.000" → código del rango; lo que no se reconoce pasa tal cual y la validación lo rechaza. */
export function employeeValue(raw: string): string {
  const text = raw.replace(/(\d)\.(\d{3})/g, '$1$2');
  const range = text.match(/(\d+)\D+(\d+)/);
  if (range) return `${range[1]}-${range[2]}`;
  const open = text.match(/(\d+)/);
  if (open && /(m[aá]s|\+)/i.test(text) && Number(open[1]) >= 5000) return '5001+';
  return raw;
}

const text = (v: unknown): string | undefined => {
  if (v === undefined || v === null) return undefined;
  const s = typeof v === 'string' ? v.trim() : String(v);
  return s === '' ? undefined : s;
};

export interface CompanyRowResult {
  input: OrganizationInput | null;
  /** Nombre o documento de la matriz, tal como vino en el archivo. */
  parentRef: string | null;
  errors: { field: string; message: string; originalValue: string | null }[];
}

/** Convierte un registro transformado (claves = campos de importación) en el cuerpo que valida `parseOrganizationInput`. */
export function toOrganizationRaw(record: Record<string, unknown>): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const key of ['name', 'legalName', 'industry', 'documentType', 'documentNumber', 'email', 'website', 'address', 'postalCode', 'city', 'region', 'countryCode', 'openingHours', 'notes']) {
    const v = text(record[key]);
    if (v !== undefined) raw[key] = v;
  }
  const type = text(record.type);
  if (type !== undefined) raw.type = TYPE_VALUES[plain(type)] ?? type;
  const status = text(record.status);
  if (status !== undefined) raw.status = STATUS_VALUES[plain(status)] ?? status;
  const size = text(record.size);
  if (size !== undefined) raw.size = SIZE_VALUES[plain(size)] ?? size;
  const employees = text(record.employeeRange);
  if (employees !== undefined) raw.employeeRange = employeeValue(employees);

  const phones = [text(record.phone1), text(record.phone2)].filter((p): p is string => !!p);
  if (phones.length) raw.phones = phones;

  const tags = text(record.tags);
  if (tags !== undefined) raw.tags = tags.split(/[;|,]/).map((t) => t.trim()).filter(Boolean);

  // Las coordenadas llegan como número (o null si no se pudieron leer).
  if (record.lat !== undefined) raw.lat = record.lat;
  if (record.lng !== undefined) raw.lng = record.lng;
  return raw;
}

const errorMessage = (e: unknown) => (e instanceof BadRequestException ? e.message : 'Valor inválido');

/**
 * Valida un registro con las mismas reglas que el formulario y devuelve la
 * entrada lista o, si falla, cada error con su campo (no solo el primero).
 */
export function validateCompanyRecord(record: Record<string, unknown>): CompanyRowResult {
  const parentRef = text(record.parent) ?? null;
  const raw = toOrganizationRaw(record);
  const original = (key: string) => {
    const field = INPUT_TO_FIELD[key] ?? key;
    const v = field === 'phone1' ? [record.phone1, record.phone2].filter(Boolean).join(' / ') : record[field];
    return v === undefined || v === null || v === '' ? null : String(v);
  };

  try {
    return { input: parseOrganizationInput(raw, 'create'), parentRef, errors: [] };
  } catch {
    // Se revisa cada campo por separado para informar todos los problemas de la fila.
  }

  const errors: CompanyRowResult['errors'] = [];
  const probe = (patch: Record<string, unknown>, field: string, key: string) => {
    try {
      parseOrganizationInput({ name: 'Nombre de prueba', ...patch }, 'create');
    } catch (e) {
      errors.push({ field, message: errorMessage(e), originalValue: original(key) });
    }
  };
  if (!('name' in raw)) {
    errors.push({ field: 'name', message: 'El nombre es obligatorio', originalValue: null });
  } else {
    probe({ name: raw.name }, 'name', 'name');
  }
  for (const key of Object.keys(raw)) {
    if (key === 'name' || key === 'lat' || key === 'lng') continue;
    probe({ [key]: raw[key] }, INPUT_TO_FIELD[key] ?? key, key);
  }
  if ('lat' in raw || 'lng' in raw) probe({ lat: raw.lat, lng: raw.lng }, 'lat', 'lat');
  if (errors.length === 0) {
    // Falla solo la combinación de campos; se informa sin campo concreto.
    errors.push({ field: '', message: 'La fila no es válida', originalValue: null });
  }
  return { input: null, parentRef, errors };
}
