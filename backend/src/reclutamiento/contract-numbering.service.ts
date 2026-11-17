import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';

@Injectable()
export class ContractNumberingService {
  /**
   * Siguiente número de contrato, p. ej. «CT-2026-0007». El incremento es
   * ATÓMICO (INSERT ... ON CONFLICT DO UPDATE), así que dos contratos emitidos a
   * la vez nunca reciben el mismo número. Debe llamarse dentro de la misma
   * transacción que guarda el contrato: si esta se revierte, el número no se gasta.
   */
  async next(em: EntityManager, tenantId: string, prefix: string | null | undefined, year: number): Promise<string> {
    const clean = (prefix || 'CT').toUpperCase();
    if (!/^[A-Z0-9]{1,10}$/.test(clean)) throw new BadRequestException('El prefijo de numeración de la plantilla no es válido');
    const series = `${clean}-${year}`;
    const result: unknown = await em.query(
      `INSERT INTO contract_counters (id, tenant_id, series, value)
       VALUES ($3, $1, $2, 1)
       ON CONFLICT (tenant_id, series) DO UPDATE SET value = contract_counters.value + 1
       RETURNING value`,
      [tenantId, series, randomUUID()],
    );
    // Según la versión de TypeORM, el resultado es [filas, cantidad] o solo las filas.
    const rows = (Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result) as Array<{ value: number }>;
    const n = Array.isArray(rows) ? rows[0]?.value : undefined;
    if (!n) throw new BadRequestException('No se pudo generar el número de contrato');
    return `${series}-${String(n).padStart(4, '0')}`;
  }
}
