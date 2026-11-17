import type { ClientRecord } from '../../records/record.entity';
import type { CustomField } from '../../records/custom-field.entity';
import { CONTACT_FIELDS, usableCustomFields } from '../contracts/contract-variables';

/**
 * Datos del contacto que el encuestador puede completar en el portal. Las
 * claves son las mismas de las variables `contacto.*` de los contratos, así lo
 * que se pide en el portal es lo que los contratos necesitan.
 *
 * El correo y el teléfono NO se editan desde el portal: son los canales con los
 * que el encuestador se identifica.
 */
export type PortalFieldType = 'text' | 'longtext' | 'date' | 'select' | 'number' | 'boolean';

export interface PortalFieldDef {
  key: string;
  label: string;
  type: PortalFieldType;
  options?: Array<{ value: string; label: string }>;
  /** Campo fijo del contacto (propiedad de ClientRecord) o campo personalizado del CRM. */
  source: 'fixed' | 'custom';
  prop?: keyof ClientRecord;
  maxLength: number;
  /** Se bloquea cuando el encuestador ya firmó un contrato (el contrato lo cita). */
  lockedWhenSigned?: boolean;
  /** Valores sugeridos (no restrictivos). */
  suggestions?: string[];
}

const FIXED: PortalFieldDef[] = [
  { key: 'nombre_completo', label: 'Nombre completo', type: 'text', source: 'fixed', prop: 'fullName', maxLength: 200, lockedWhenSigned: true },
  { key: 'nombre', label: 'Nombre', type: 'text', source: 'fixed', prop: 'firstName', maxLength: 100, lockedWhenSigned: true },
  { key: 'apellido', label: 'Apellido', type: 'text', source: 'fixed', prop: 'lastName', maxLength: 100, lockedWhenSigned: true },
  { key: 'tipo_documento', label: 'Tipo de documento', type: 'text', source: 'fixed', prop: 'documentType', maxLength: 20, lockedWhenSigned: true, suggestions: ['CC', 'CE', 'TI', 'PA', 'PEP', 'PPT', 'NIT', 'DNI', 'RUC', 'RUT', 'CURP'] },
  { key: 'numero_documento', label: 'Número de documento', type: 'text', source: 'fixed', prop: 'documentNumber', maxLength: 50, lockedWhenSigned: true },
  { key: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date', source: 'fixed', prop: 'birthDate', maxLength: 10, lockedWhenSigned: true },
  {
    key: 'genero',
    label: 'Género',
    type: 'select',
    source: 'fixed',
    prop: 'gender',
    maxLength: 20,
    options: [
      { value: 'male', label: 'Masculino' },
      { value: 'female', label: 'Femenino' },
      { value: 'other', label: 'Otro' },
      { value: 'prefer_not_to_say', label: 'Prefiero no decirlo' },
    ],
  },
  { key: 'direccion', label: 'Dirección', type: 'text', source: 'fixed', prop: 'address', maxLength: 250 },
  { key: 'ciudad', label: 'Ciudad', type: 'text', source: 'fixed', prop: 'city', maxLength: 100 },
  { key: 'departamento', label: 'Departamento / estado / provincia', type: 'text', source: 'fixed', prop: 'region', maxLength: 100 },
];

const CUSTOM_TYPE: Record<string, PortalFieldType> = {
  text: 'text',
  url: 'text',
  email: 'text',
  phone: 'text',
  textarea: 'longtext',
  number: 'number',
  date: 'date',
  select: 'select',
  boolean: 'boolean',
};

/** Campos que se pueden pedir: los fijos del contacto y los personalizados utilizables del CRM de la cuenta. */
export function buildFieldCatalog(customFields: CustomField[]): PortalFieldDef[] {
  const fixed = FIXED.filter((f) => CONTACT_FIELDS.some((c) => c.key === f.key));
  const usable = usableCustomFields(customFields.map((f) => ({ fieldKey: f.fieldKey, fieldLabel: f.fieldLabel, isSystem: f.isSystem })));
  const byKey = new Map(customFields.map((f) => [f.fieldKey, f]));
  const custom: PortalFieldDef[] = usable.map((u) => {
    const f = byKey.get(u.fieldKey)!;
    const type = CUSTOM_TYPE[f.fieldType] ?? 'text';
    return {
      key: f.fieldKey,
      label: f.fieldLabel,
      type,
      source: 'custom' as const,
      maxLength: type === 'longtext' ? 2000 : 300,
      options: type === 'select' ? (f.options ?? []).filter((o) => typeof o === 'string').map((o) => ({ value: o, label: o })) : undefined,
    };
  });
  return [...fixed, ...custom];
}

const isoDate = (v: unknown): string => {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

/** Valor actual del campo en el contacto, como texto. */
export function readFieldValue(record: ClientRecord, def: PortalFieldDef): string {
  let raw: unknown;
  if (def.source === 'fixed') raw = record[def.prop!];
  else raw = record.customData && typeof record.customData === 'object' ? (record.customData as Record<string, unknown>)[def.key] : undefined;
  if (def.type === 'date') return isoDate(raw);
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return '';
}

/**
 * Valida un valor enviado por el encuestador para un campo. Devuelve el valor
 * normalizado como texto (vacío = sin valor) o lanza un mensaje en español.
 */
export function normalizeFieldValue(def: PortalFieldDef, raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') {
    throw new Error(`«${def.label}» tiene un valor inválido`);
  }
  const value = String(raw).trim();
  if (!value) return '';
  if (value.length > def.maxLength) throw new Error(`«${def.label}» no puede superar ${def.maxLength} caracteres`);
  switch (def.type) {
    case 'date': {
      const d = new Date(`${value}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
        throw new Error(`«${def.label}» debe ser una fecha válida`);
      }
      if (d.getTime() > Date.now()) throw new Error(`«${def.label}» no puede ser futura`);
      if (d.getUTCFullYear() < 1900) throw new Error(`«${def.label}» no es una fecha válida`);
      return value;
    }
    case 'number':
      if (!Number.isFinite(Number(value))) throw new Error(`«${def.label}» debe ser un número`);
      return value;
    case 'boolean':
      if (value !== 'true' && value !== 'false') throw new Error(`«${def.label}» debe ser Sí o No`);
      return value;
    case 'select':
      if (def.options && !def.options.some((o) => o.value === value)) throw new Error(`«${def.label}» tiene una opción no válida`);
      return value;
    default:
      return value;
  }
}
