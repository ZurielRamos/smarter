import type { ClientRecord } from '../records/record.entity';

/**
 * Campos del CRM que los flujos pueden usar como {{variable}}. Usan la misma
 * clave que el CRM y las campañas (p. ej. {{firstName}}, {{city}}); los campos
 * personalizados se usan por su clave (p. ej. {{cedula}}).
 */
export type ContactFieldType =
  'text' | 'number' | 'date' | 'boolean' | 'select' | 'array';

export interface ContactFieldDef {
  key: string;
  label: string;
  group: string;
  /** Tipo de dato: el editor lo usa para ofrecer los operadores que tienen sentido. */
  type: ContactFieldType;
  /** Valores posibles de un campo de selección. */
  options?: string[];
  /** Un nodo Entrada puede guardar la respuesta en este campo. */
  writable?: boolean;
}

export const CONTACT_SYSTEM_FIELDS: ContactFieldDef[] = [
  // Identificación
  { key: 'firstName', label: 'Nombre', group: 'identificacion', type: 'text' },
  { key: 'lastName', label: 'Apellido', group: 'identificacion', type: 'text' },
  {
    key: 'fullName',
    label: 'Nombre completo',
    group: 'identificacion',
    type: 'text',
  },
  {
    key: 'documentType',
    label: 'Tipo de documento',
    group: 'identificacion',
    type: 'select',
    options: ['CC', 'CE', 'NIT', 'TI', 'Pasaporte', 'RUT'],
  },
  {
    key: 'documentNumber',
    label: 'Número de documento',
    group: 'identificacion',
    type: 'text',
  },
  { key: 'company', label: 'Empresa', group: 'identificacion', type: 'text' },
  { key: 'jobTitle', label: 'Cargo', group: 'identificacion', type: 'text' },
  // Contacto
  { key: 'phone', label: 'Teléfono', group: 'contacto', type: 'text' },
  {
    key: 'whatsappId',
    label: 'WhatsApp ID (BSUID)',
    group: 'contacto',
    type: 'text',
  },
  {
    key: 'countryCode',
    label: 'Código de país',
    group: 'contacto',
    type: 'text',
  },
  { key: 'email', label: 'Email', group: 'contacto', type: 'text' },
  { key: 'website', label: 'Sitio web', group: 'contacto', type: 'text' },
  {
    key: 'language',
    label: 'Idioma preferido',
    group: 'contacto',
    type: 'select',
    options: ['es', 'en', 'pt', 'fr', 'de'],
  },
  // Demografía
  {
    key: 'gender',
    label: 'Género',
    group: 'demografia',
    type: 'select',
    options: ['male', 'female', 'other', 'prefer_not_to_say'],
  },
  {
    key: 'birthDate',
    label: 'Fecha de nacimiento',
    group: 'demografia',
    type: 'date',
  },
  // Ubicación
  { key: 'city', label: 'Ciudad', group: 'ubicacion', type: 'text' },
  {
    key: 'region',
    label: 'Departamento / Estado',
    group: 'ubicacion',
    type: 'text',
  },
  { key: 'address', label: 'Dirección', group: 'ubicacion', type: 'text' },
  // Segmentación
  {
    key: 'status',
    label: 'Estado',
    group: 'segmentacion',
    type: 'select',
    options: [
      'lead',
      'contactado',
      'interesado',
      'oportunidad',
      'cliente',
      'premium',
      'fidelizado',
      'inactivo',
      'perdido',
    ],
  },
  {
    key: 'channelSource',
    label: 'Canal de origen',
    group: 'segmentacion',
    type: 'select',
    options: [
      'whatsapp',
      'messenger',
      'instagram',
      'sms',
      'llamada',
      'email',
      'web',
      'formulario',
      'landing',
      'referido',
      'campaña',
      'import',
      'manual',
      'api',
    ],
  },
  {
    key: 'source',
    label: 'Fuente de adquisición',
    group: 'segmentacion',
    type: 'text',
  },
  { key: 'score', label: 'Score', group: 'segmentacion', type: 'number' },
  { key: 'tags', label: 'Etiquetas', group: 'segmentacion', type: 'array' },
  // Consentimiento
  {
    key: 'optInWhatsapp',
    label: 'Opt-in WhatsApp',
    group: 'consentimiento',
    type: 'boolean',
  },
  {
    key: 'optInEmail',
    label: 'Opt-in Email',
    group: 'consentimiento',
    type: 'boolean',
  },
  // Actividad
  {
    key: 'createdAt',
    label: 'Fecha de creación',
    group: 'actividad',
    type: 'date',
  },
  {
    key: 'lastContactAt',
    label: 'Último contacto',
    group: 'actividad',
    type: 'date',
  },
  {
    key: 'lastActivityAt',
    label: 'Última actividad',
    group: 'actividad',
    type: 'date',
  },
  // General
  { key: 'notes', label: 'Notas rápidas', group: 'general', type: 'text' },
];

/**
 * Campos del sistema donde un nodo Entrada puede guardar la respuesta. Quedan
 * fuera los que gestiona el CRM (estado, score, etiquetas, consentimientos,
 * fechas de actividad, identificadores del canal).
 */
export const WRITABLE_CONTACT_KEYS = new Set([
  'firstName',
  'lastName',
  'fullName',
  'documentType',
  'documentNumber',
  'company',
  'jobTitle',
  'phone',
  'email',
  'website',
  'language',
  'gender',
  'birthDate',
  'city',
  'region',
  'address',
  'source',
  'notes',
]);
for (const f of CONTACT_SYSTEM_FIELDS) {
  if (WRITABLE_CONTACT_KEYS.has(f.key)) f.writable = true;
}

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
  {
    key: 'ai_outcome',
    label: 'Resultado de la conversación con IA',
    description: 'Resultado al que llegó el último nodo Conversación con IA',
  },
  {
    key: 'ai_summary',
    label: 'Resumen de la conversación con IA',
    description: 'Resumen que escribió la IA al terminar el tramo',
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
