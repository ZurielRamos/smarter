import { EntityManager } from 'typeorm';
import { ClientRecord } from '../records/record.entity';

/** Solo dígitos: así se comparan teléfonos escritos de distinta forma. */
export const digitsOf = (s: unknown): string => String(s ?? '').replace(/\D/g, '');

/** Correo normalizado para comparar. */
export const normalizeEmail = (s: unknown): string => (typeof s === 'string' ? s.trim().toLowerCase() : '');

/**
 * Contactos de la cuenta cuyo correo o teléfono coincide con el dato dado.
 * El teléfono coincide con o sin indicativo de país guardado aparte en el contacto.
 * Devuelve a lo sumo `limit` contactos, más recientes primero.
 */
export async function findRecordsByContact(
  em: EntityManager,
  tenantId: string,
  contact: { email?: string | null; phone?: string | null },
  limit = 5,
): Promise<ClientRecord[]> {
  const email = normalizeEmail(contact.email);
  const phone = digitsOf(contact.phone);
  if (!email && phone.length < 7) return [];
  const qb = em
    .getRepository(ClientRecord)
    .createQueryBuilder('r')
    .where('r.tenantId = :tenantId AND r.deletedAt IS NULL', { tenantId });
  const ors: string[] = [];
  const params: Record<string, string> = {};
  if (email) {
    ors.push("lower(trim(coalesce(r.email, ''))) = :email");
    params.email = email;
  }
  if (phone.length >= 7) {
    ors.push(
      "(regexp_replace(coalesce(r.phone, ''), '\\D', '', 'g') = :phone OR regexp_replace(coalesce(r.countryCode, ''), '\\D', '', 'g') || regexp_replace(coalesce(r.phone, ''), '\\D', '', 'g') = :phone)",
    );
    params.phone = phone;
  }
  return qb
    .andWhere(`(${ors.join(' OR ')})`, params)
    .orderBy('r.createdAt', 'DESC')
    .limit(limit)
    .getMany();
}
