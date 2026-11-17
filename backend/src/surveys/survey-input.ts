import { BadRequestException } from '@nestjs/common';

/**
 * Validación y saneamiento de entradas del módulo Encuestas. No hay
 * ValidationPipe global en la app, así que estas comprobaciones viven aquí.
 */

const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_RESPONSE_KEYS = 200;
const MAX_STRING = 5000;
const MAX_ARRAY_ITEMS = 100;
const MAX_ARRAY_STRING = 1000;
const FIELD_KEY_RE = /^[\p{L}\p{N}_\- .]{1,100}$/u;
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|(rgb|hsl)a?\([\d\s.,%/a-z]+\)|[a-zA-Z]{3,20})$/;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Sanea las respuestas enviadas desde el enlace público (no autenticado).
 *
 * - Solo acepta texto, números, booleanos y listas de esos tipos (lo que
 *   produce el formulario). Rechaza objetos anidados y valores enormes.
 * - Descarta las claves reservadas `__*` (el servidor usa `__location__` para
 *   la ubicación; un cliente no debe poder falsificarla).
 */
export function sanitizeResponseData(raw: unknown): Record<string, any> {
  if (!isPlainObject(raw)) throw new BadRequestException('Respuestas inválidas');
  if (Buffer.byteLength(JSON.stringify(raw), 'utf8') > MAX_RESPONSE_BYTES) {
    throw new BadRequestException('Las respuestas son demasiado grandes');
  }
  const entries = Object.entries(raw);
  if (entries.length > MAX_RESPONSE_KEYS) {
    throw new BadRequestException('Demasiados campos en la respuesta');
  }

  const out: Record<string, any> = {};
  for (const [key, value] of entries) {
    if (key.startsWith('__')) continue; // reservadas del servidor
    if (!FIELD_KEY_RE.test(key)) throw new BadRequestException('Nombre de campo inválido');
    if (value === undefined || value === null) continue;

    if (typeof value === 'string') {
      if (value.length > MAX_STRING) throw new BadRequestException(`El campo "${key}" es demasiado largo`);
      out[key] = value;
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new BadRequestException(`Valor inválido en "${key}"`);
      out[key] = value;
    } else if (typeof value === 'boolean') {
      out[key] = value;
    } else if (Array.isArray(value)) {
      if (value.length > MAX_ARRAY_ITEMS) throw new BadRequestException(`Demasiadas opciones en "${key}"`);
      const items = value.map((item) => {
        if (typeof item === 'string' && item.length <= MAX_ARRAY_STRING) return item;
        if (typeof item === 'number' && Number.isFinite(item)) return item;
        if (typeof item === 'boolean') return item;
        throw new BadRequestException(`Valor inválido en "${key}"`);
      });
      out[key] = items;
    } else {
      throw new BadRequestException(`Valor inválido en "${key}"`);
    }
  }
  return out;
}

export function parseLocation(raw: unknown): { lat: number; lng: number; accuracy?: number } | null {
  if (raw === undefined || raw === null) return null;
  if (!isPlainObject(raw)) throw new BadRequestException('Ubicación inválida');
  const { lat, lng, accuracy } = raw;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new BadRequestException('Ubicación inválida');
  }
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new BadRequestException('Ubicación inválida');
  }
  const out: { lat: number; lng: number; accuracy?: number } = { lat, lng };
  if (accuracy !== undefined && accuracy !== null) {
    if (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1_000_000) {
      throw new BadRequestException('Ubicación inválida');
    }
    out.accuracy = accuracy;
  }
  return out;
}

export function parseRespondentIdentifier(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string' || raw.length > 200) throw new BadRequestException('Identificador inválido');
  return raw.trim() || undefined;
}

/** El token de agente es opaco; solo se acota su longitud. Si no existe en la encuesta, no atribuye a nadie. */
export function parseAgentToken(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length <= 100 ? raw : null;
}

export interface SurveyUpdateFields {
  name?: string;
  displayTitle?: string | null;
  description?: string | null;
  theme?: { primary?: string; background?: string } | null;
  requireLocation?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Lista blanca de campos editables con PUT /surveys/:id. Todo lo demás
 * (tenantId, slug, status, metaFlowId, responseCount, agentTokens, logoUrl,
 * flowJson...) se ignora: tiene sus propios endpoints o es del sistema.
 */
export function parseSurveyUpdate(body: unknown): SurveyUpdateFields {
  if (!isPlainObject(body)) throw new BadRequestException('Cuerpo inválido');
  const out: SurveyUpdateFields = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 200) {
      throw new BadRequestException('El nombre debe tener entre 1 y 200 caracteres');
    }
    out.name = body.name.trim();
  }
  if (body.displayTitle !== undefined) {
    if (body.displayTitle !== null && typeof body.displayTitle !== 'string') {
      throw new BadRequestException('Título inválido');
    }
    const t = (body.displayTitle as string | null)?.trim() ?? '';
    if (t.length > 200) throw new BadRequestException('El título no puede superar 200 caracteres');
    out.displayTitle = t || null;
  }
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') {
      throw new BadRequestException('Descripción inválida');
    }
    const d = (body.description as string | null) ?? '';
    if (d.length > 5000) throw new BadRequestException('La descripción no puede superar 5000 caracteres');
    out.description = d || null;
  }
  if (body.theme !== undefined) {
    if (body.theme === null) {
      out.theme = null;
    } else if (isPlainObject(body.theme)) {
      const theme: { primary?: string; background?: string } = {};
      for (const k of ['primary', 'background'] as const) {
        const v = body.theme[k];
        if (v === undefined || v === null || v === '') continue;
        if (typeof v !== 'string' || !COLOR_RE.test(v.trim())) {
          throw new BadRequestException(`Color inválido en "${k}"`);
        }
        theme[k] = v.trim();
      }
      out.theme = theme;
    } else {
      throw new BadRequestException('Tema inválido');
    }
  }
  if (body.requireLocation !== undefined) {
    if (typeof body.requireLocation !== 'boolean') throw new BadRequestException('requireLocation inválido');
    out.requireLocation = body.requireLocation;
  }
  if (body.metadata !== undefined) {
    if (!isPlainObject(body.metadata) || Buffer.byteLength(JSON.stringify(body.metadata), 'utf8') > 8 * 1024) {
      throw new BadRequestException('Metadata inválida');
    }
    out.metadata = body.metadata;
  }
  return out;
}

export interface CrmMappingInput {
  fields?: Record<string, string>;
  matchRules?: { logic: 'and' | 'or'; fields: string[] };
  matchField?: string | null;
}

/**
 * Valida el mapeo encuesta→CRM. `allowedTargets` son los campos del CRM que el
 * catálogo del tenant ofrece (nunca columnas arbitrarias).
 */
export function parseCrmMapping(body: unknown, allowedTargets: Set<string>): CrmMappingInput {
  if (!isPlainObject(body)) throw new BadRequestException('Mapeo inválido');
  const out: CrmMappingInput = {};

  if (body.fields !== undefined) {
    if (!isPlainObject(body.fields)) throw new BadRequestException('Mapeo de campos inválido');
    const entries = Object.entries(body.fields);
    if (entries.length > 100) throw new BadRequestException('Demasiados campos mapeados');
    const fields: Record<string, string> = {};
    for (const [surveyField, target] of entries) {
      if (!FIELD_KEY_RE.test(surveyField)) throw new BadRequestException('Nombre de campo inválido en el mapeo');
      if (target === null || target === undefined || target === '') continue; // sin mapear
      if (typeof target !== 'string' || !allowedTargets.has(target)) {
        throw new BadRequestException(`Destino del CRM no válido: "${String(target).slice(0, 50)}"`);
      }
      fields[surveyField] = target;
    }
    out.fields = fields;
  }

  if (body.matchRules !== undefined && body.matchRules !== null) {
    const r = body.matchRules;
    if (!isPlainObject(r) || (r.logic !== 'and' && r.logic !== 'or') || !Array.isArray(r.fields)) {
      throw new BadRequestException('Regla de coincidencia inválida');
    }
    if (r.fields.length > 10 || !r.fields.every((f) => typeof f === 'string' && FIELD_KEY_RE.test(f))) {
      throw new BadRequestException('Regla de coincidencia inválida');
    }
    out.matchRules = { logic: r.logic, fields: r.fields as string[] };
  }

  if (body.matchField !== undefined && body.matchField !== null) {
    if (typeof body.matchField !== 'string' || !FIELD_KEY_RE.test(body.matchField)) {
      throw new BadRequestException('Campo de coincidencia inválido');
    }
    out.matchField = body.matchField;
  } else if (body.matchField === null) {
    out.matchField = null;
  }

  return out;
}

/** flowJson aceptable al crear una encuesta: objeto con pantallas y tamaño acotado. */
export function assertValidFlowJson(flowJson: unknown): asserts flowJson is Record<string, any> {
  if (
    !isPlainObject(flowJson) ||
    !Array.isArray(flowJson.screens) ||
    flowJson.screens.length === 0 ||
    Buffer.byteLength(JSON.stringify(flowJson), 'utf8') > 1024 * 1024
  ) {
    throw new BadRequestException('flowJson inválido: debe tener pantallas y pesar menos de 1 MB');
  }
}
