import type { ClientRecord } from '../records/record.entity';

/**
 * Campos del CRM que los flujos pueden usar como {{variable}}. Usan la misma
 * clave que el CRM y las campañas (p. ej. {{firstName}}, {{city}}); los campos
 * personalizados se usan por su clave (p. ej. {{cedula}}).
 */
export interface ContactFieldDef {
  key: string;
  label: string;
  group: string;
}

export const CONTACT_SYSTEM_FIELDS: ContactFieldDef[] = [
  // Identificación
  { key: 'firstName', label: 'Nombre', group: 'identificacion' },
  { key: 'lastName', label: 'Apellido', group: 'identificacion' },
  { key: 'fullName', label: 'Nombre completo', group: 'identificacion' },
  { key: 'documentType', label: 'Tipo de documento', group: 'identificacion' },
  {
    key: 'documentNumber',
    label: 'Número de documento',
    group: 'identificacion',
  },
  { key: 'company', label: 'Empresa', group: 'identificacion' },
  { key: 'jobTitle', label: 'Cargo', group: 'identificacion' },
  // Contacto
  { key: 'phone', label: 'Teléfono', group: 'contacto' },
  { key: 'whatsappId', label: 'WhatsApp ID (BSUID)', group: 'contacto' },
  { key: 'countryCode', label: 'Código de país', group: 'contacto' },
  { key: 'email', label: 'Email', group: 'contacto' },
  { key: 'website', label: 'Sitio web', group: 'contacto' },
  { key: 'language', label: 'Idioma preferido', group: 'contacto' },
  // Demografía
  { key: 'gender', label: 'Género', group: 'demografia' },
  { key: 'birthDate', label: 'Fecha de nacimiento', group: 'demografia' },
  // Ubicación
  { key: 'city', label: 'Ciudad', group: 'ubicacion' },
  { key: 'region', label: 'Departamento / Estado', group: 'ubicacion' },
  { key: 'address', label: 'Dirección', group: 'ubicacion' },
  // Segmentación
  { key: 'status', label: 'Estado', group: 'segmentacion' },
  { key: 'channelSource', label: 'Canal de origen', group: 'segmentacion' },
  { key: 'source', label: 'Fuente de adquisición', group: 'segmentacion' },
  { key: 'score', label: 'Score', group: 'segmentacion' },
  { key: 'tags', label: 'Etiquetas', group: 'segmentacion' },
  // Consentimiento
  { key: 'optInWhatsapp', label: 'Opt-in WhatsApp', group: 'consentimiento' },
  { key: 'optInEmail', label: 'Opt-in Email', group: 'consentimiento' },
  // Actividad
  { key: 'createdAt', label: 'Fecha de creación', group: 'actividad' },
  { key: 'lastContactAt', label: 'Último contacto', group: 'actividad' },
  { key: 'lastActivityAt', label: 'Última actividad', group: 'actividad' },
  // General
  { key: 'notes', label: 'Notas rápidas', group: 'general' },
];

/** Variables propias del flujo que siempre existen. */
export const FLOW_SPECIAL_VARIABLES: {
  key: string;
  label: string;
  description: string;
}[] = [
  {
    key: 'contact_name',
    label: 'Nombre del contacto',
    description: 'Nombre con el que aparece en el chat',
  },
  {
    key: 'last_button',
    label: 'Último botón pulsado',
    description: 'Título del último botón de respuesta que eligió',
  },
  {
    key: 'last_link',
    label: 'Último enlace abierto',
    description: 'Título del último enlace con seguimiento que abrió',
  },
];

/** Una clave usable como {{variable}} (el motor reconoce letras, números y _). */
export const VARIABLE_KEY_RE = /^[A-Za-z0-9_]+$/;

const SYSTEM_DATE_KEYS = new Set([
  'birthDate',
  'createdAt',
  'lastContactAt',
  'lastActivityAt',
]);
const TIMEZONE = 'America/Bogota';

function formatDate(value: Date | string): string {
  // Una fecha sin hora (YYYY-MM-DD) no debe pasar por Date: se corre un día por la zona horaria.
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return value;
  }
  if (Number.isNaN(value.getTime())) return '';
  return value.toLocaleDateString('es-CO', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatValue(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return formatDate(value);
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'number')
    return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(formatValue).filter(Boolean).join(', ');
  }
  // Objetos: no se vuelcan al mensaje del contacto.
  return '';
}

/**
 * Valores del contacto listos para sustituir en los textos del flujo: campos del
 * sistema y campos personalizados (los calculados también, viven en customData).
 * Un campo vacío es ''. Sin contacto vinculado devuelve {}.
 */
export function buildContactVariables(
  record: ClientRecord | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!record) return out;
  const r = record as unknown as Record<string, unknown>;

  for (const { key } of CONTACT_SYSTEM_FIELDS) {
    let raw: unknown = r[key];
    if (key === 'fullName' && !raw) {
      raw = [record.firstName, record.lastName].filter(Boolean).join(' ');
    }
    out[key] = SYSTEM_DATE_KEYS.has(key)
      ? raw
        ? formatDate(raw as Date | string)
        : ''
      : formatValue(raw);
  }

  // Los campos personalizados no pisan a los del sistema.
  for (const [key, value] of Object.entries(record.customData || {})) {
    if (VARIABLE_KEY_RE.test(key) && !(key in out)) {
      out[key] = formatValue(value);
    }
  }
  return out;
}
