import { BadRequestException } from '@nestjs/common';
import {
  optionalString,
  requireCountry,
  requireObject,
  requireString,
  requireUuid,
} from '../reclutamiento/validation';
import {
  CONTACT_ORG_ROLES,
  ContactOrgRole,
} from './entities/contact-organization.entity';
import {
  EMPLOYEE_RANGES,
  EmployeeRange,
  ORGANIZATION_SIZES,
  ORGANIZATION_STATUSES,
  ORGANIZATION_TYPES,
  OrganizationPhone,
  OrganizationSize,
  OrganizationStatus,
  OrganizationType,
} from './entities/organization.entity';

/**
 * Validación de entradas del módulo Empresas. No hay ValidationPipe global,
 * así que se valida aquí, igual que en Encuestas y Reclutamiento.
 */

const MAX_CUSTOM_BYTES = 8 * 1024;
const MAX_CUSTOM_KEYS = 50;
const CUSTOM_KEY_RE = /^[\p{L}\p{N}_\- .]{1,100}$/u;

export interface OrganizationInput {
  name?: string;
  type?: OrganizationType;
  status?: OrganizationStatus;
  parentId?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  countryCode?: string | null;
  lat?: number | null;
  lng?: number | null;
  legalName?: string | null;
  industry?: string | null;
  size?: OrganizationSize | null;
  employeeRange?: EmployeeRange | null;
  phones?: OrganizationPhone[] | null;
  email?: string | null;
  website?: string | null;
  postalCode?: string | null;
  openingHours?: string | null;
  tags?: string[] | null;
  notes?: string | null;
  customData?: Record<string, unknown> | null;
}

const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function parseCoordinate(value: unknown, field: string, limit: number): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < -limit || n > limit) {
    throw new BadRequestException(`${field} inválida`);
  }
  return n;
}

function parseCustomData(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  const obj = requireObject(value, 'Campos personalizados');
  const entries = Object.entries(obj).filter(([k]) => !k.startsWith('__'));
  if (entries.length > MAX_CUSTOM_KEYS) {
    throw new BadRequestException('Demasiados campos personalizados');
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    if (!CUSTOM_KEY_RE.test(k)) throw new BadRequestException('Nombre de campo personalizado inválido');
    const ok =
      v === null ||
      typeof v === 'string' ||
      typeof v === 'boolean' ||
      (typeof v === 'number' && Number.isFinite(v)) ||
      (Array.isArray(v) && v.every((i) => typeof i === 'string' || typeof i === 'number' || typeof i === 'boolean'));
    if (!ok) throw new BadRequestException(`Valor inválido en "${k}"`);
    out[k] = v;
  }
  if (Buffer.byteLength(JSON.stringify(out), 'utf8') > MAX_CUSTOM_BYTES) {
    throw new BadRequestException('Los campos personalizados son demasiado grandes');
  }
  return Object.keys(out).length ? out : null;
}

const MAX_PHONES = 5;
const MAX_TAGS = 20;
const PHONE_RE = /^\+?[\d(][\d\s().\-]{4,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Valor de una lista cerrada, o null si viene vacío. */
function parseEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new BadRequestException(`${field} inválido`);
  }
  return value as T;
}

function parsePhones(value: unknown): OrganizationPhone[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) throw new BadRequestException('Los teléfonos deben ser una lista');
  if (value.length > MAX_PHONES) throw new BadRequestException(`Máximo ${MAX_PHONES} teléfonos`);
  const out: OrganizationPhone[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    // Se acepta un texto suelto o un objeto { number, label }.
    const raw = typeof item === 'string' ? { number: item } : item;
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BadRequestException('Teléfono inválido');
    }
    const number = optionalString((raw as any).number, 'Teléfono', 30);
    if (!number) continue;
    const key = number.replace(/\D/g, '');
    if (!PHONE_RE.test(number) || key.length < 6 || key.length > 15) {
      throw new BadRequestException(`Teléfono inválido: ${number}`);
    }
    if (seen.has(key)) continue;
    seen.add(key);
    const label = optionalString((raw as any).label, 'Etiqueta del teléfono', 30);
    out.push(label ? { number, label } : { number });
  }
  return out.length ? out : null;
}

function parseEmail(value: unknown): string | null {
  const v = optionalString(value, 'Correo', 200);
  if (!v) return null;
  if (!EMAIL_RE.test(v)) throw new BadRequestException('Correo inválido');
  return v.toLowerCase();
}

/** Sitio web http(s). Si falta el esquema se asume https. */
function parseWebsite(value: unknown): string | null {
  const v = optionalString(value, 'Sitio web', 300);
  if (!v) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new BadRequestException('Sitio web inválido');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('El sitio web debe empezar por http:// o https://');
  }
  if (!url.hostname.includes('.')) throw new BadRequestException('Sitio web inválido');
  return withScheme.slice(0, 300);
}

function parseTags(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) throw new BadRequestException('Las etiquetas deben ser una lista');
  const out: string[] = [];
  for (const item of value) {
    const tag = optionalString(item, 'Etiqueta', 50);
    if (tag && !out.some((t) => t.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  if (out.length > MAX_TAGS) throw new BadRequestException(`Máximo ${MAX_TAGS} etiquetas`);
  return out.length ? out : null;
}

/** El documento se guarda sin espacios en los extremos y en mayúsculas para que la unicidad no dependa del formato. */
function parseDocumentNumber(value: unknown): string | null {
  const v = optionalString(value, 'Número de documento', 50);
  return v ? v.toUpperCase() : null;
}

/**
 * Parsea el cuerpo de creación o edición. Solo devuelve las claves presentes
 * en el cuerpo, de modo que un PATCH no borra lo que no se envió.
 */
export function parseOrganizationInput(raw: unknown, mode: 'create' | 'update'): OrganizationInput {
  const body = requireObject(raw ?? {}, 'Cuerpo');
  const out: OrganizationInput = {};

  if (mode === 'create' || has(body, 'name')) out.name = requireString(body.name, 'Nombre', 2, 200);

  if (has(body, 'type')) {
    if (!(ORGANIZATION_TYPES as readonly string[]).includes(body.type as string)) {
      throw new BadRequestException('Tipo de empresa inválido');
    }
    out.type = body.type as OrganizationType;
  }
  if (has(body, 'status')) {
    if (!(ORGANIZATION_STATUSES as readonly string[]).includes(body.status as string)) {
      throw new BadRequestException('Estado inválido');
    }
    out.status = body.status as OrganizationStatus;
  }
  if (has(body, 'parentId')) {
    out.parentId = body.parentId === null || body.parentId === '' ? null : requireUuid(body.parentId, 'Empresa matriz');
  }
  if (has(body, 'documentType')) out.documentType = optionalString(body.documentType, 'Tipo de documento', 20);
  if (has(body, 'documentNumber')) out.documentNumber = parseDocumentNumber(body.documentNumber);
  if (has(body, 'address')) out.address = optionalString(body.address, 'Dirección', 300);
  if (has(body, 'city')) out.city = optionalString(body.city, 'Ciudad', 100);
  if (has(body, 'region')) out.region = optionalString(body.region, 'Región', 100);
  if (has(body, 'countryCode')) {
    out.countryCode =
      body.countryCode === null || body.countryCode === '' ? null : requireCountry(body.countryCode);
  }

  if (has(body, 'lat') || has(body, 'lng')) {
    const lat = parseCoordinate(body.lat, 'Latitud', 90);
    const lng = parseCoordinate(body.lng, 'Longitud', 180);
    if ((lat === null) !== (lng === null)) {
      throw new BadRequestException('Latitud y longitud deben enviarse juntas');
    }
    out.lat = lat;
    out.lng = lng;
  }

  if (has(body, 'legalName')) out.legalName = optionalString(body.legalName, 'Razón social', 200);
  if (has(body, 'industry')) out.industry = optionalString(body.industry, 'Sector', 100);
  if (has(body, 'size')) out.size = parseEnum(body.size, ORGANIZATION_SIZES, 'Tamaño');
  if (has(body, 'employeeRange')) out.employeeRange = parseEnum(body.employeeRange, EMPLOYEE_RANGES, 'Rango de empleados');
  if (has(body, 'phones')) out.phones = parsePhones(body.phones);
  if (has(body, 'email')) out.email = parseEmail(body.email);
  if (has(body, 'website')) out.website = parseWebsite(body.website);
  if (has(body, 'postalCode')) out.postalCode = optionalString(body.postalCode, 'Código postal', 20);
  if (has(body, 'openingHours')) out.openingHours = optionalString(body.openingHours, 'Horario', 300);
  if (has(body, 'tags')) out.tags = parseTags(body.tags);
  if (has(body, 'notes')) out.notes = optionalString(body.notes, 'Notas', 2000);

  if (has(body, 'customData')) out.customData = parseCustomData(body.customData);

  if (mode === 'update' && Object.keys(out).length === 0) {
    throw new BadRequestException('No hay cambios que guardar');
  }
  return out;
}

export function parseLinkInput(raw: unknown): { recordId: string; role: ContactOrgRole } {
  const body = requireObject(raw ?? {}, 'Cuerpo');
  const recordId = requireUuid(body.recordId, 'Contacto');
  const role = (body.role ?? 'employee') as string;
  if (!(CONTACT_ORG_ROLES as readonly string[]).includes(role)) {
    throw new BadRequestException('Rol inválido');
  }
  return { recordId, role: role as ContactOrgRole };
}
