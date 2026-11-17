import { BadRequestException } from '@nestjs/common';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new BadRequestException(`${field} inválido`);
  }
  return value;
}

export function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`${field} debe ser un objeto`);
  }
  return value as Record<string, unknown>;
}

export function requireString(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new BadRequestException(`${field} es requerido`);
  const v = value.trim();
  if (v.length < min || v.length > max) {
    throw new BadRequestException(`${field} debe tener entre ${min} y ${max} caracteres`);
  }
  return v;
}

export function optionalString(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new BadRequestException(`${field} inválido`);
  const v = value.trim();
  if (v.length > max) throw new BadRequestException(`${field} no puede superar ${max} caracteres`);
  return v || null;
}

/** Fecha calendario real en formato YYYY-MM-DD. */
export function requireIsoDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(`${field} debe tener formato AAAA-MM-DD`);
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${field} no es una fecha válida`);
  }
  return value;
}

export function requireRate(value: unknown, field: string): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1_000_000_000) {
    throw new BadRequestException(`${field} debe ser un número válido mayor o igual a 0`);
  }
  // Máximo 2 decimales (columna decimal(14,2)).
  return Math.round(n * 100) / 100;
}

export function requireCountry(value: unknown): string {
  const v = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(v)) {
    throw new BadRequestException('El país debe ser un código ISO de 2 letras (p. ej. CO)');
  }
  return v;
}

export function requireCurrency(value: unknown): string {
  const v = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(v)) {
    throw new BadRequestException('La moneda debe ser un código ISO de 3 letras (p. ej. COP)');
  }
  return v;
}

/** Escapa %, _ y \ para usarlos de forma literal en un ILIKE ... ESCAPE '\'. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}

export function clampInt(value: unknown, def: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

export interface Actor {
  id: string;
  email: string;
}
