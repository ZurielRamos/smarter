import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { TenantAuditService } from '../audit/tenant-audit.service';
import { Actor } from '../reclutamiento/validation';
import { Organization } from './entities/organization.entity';

const MAX_MIGRATE_NAMES = 5000;

export interface MigrationReport {
  dryRun: boolean;
  /** Nombres distintos de empresa encontrados en los contactos. */
  distinctNames: number;
  /** Empresas nuevas que se crean (tipo cliente). */
  toCreate: number;
  /** Nombres que ya tienen una empresa con ese nombre y se reutilizan. */
  existing: number;
  /** Vínculos contacto ↔ empresa que se crean. */
  contactsToLink: number;
  /** Nombres descartados por tener menos de 2 o más de 200 caracteres. */
  skipped: number;
}

const norm = (v: string) => v.trim().toLowerCase();

/**
 * Migración desde el campo de texto `clients.company`.
 * Toda consulta lleva `tenantId`.
 */
@Injectable()
export class CompaniesBulkService {
  constructor(
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    private readonly dataSource: DataSource,
    private readonly audit: TenantAuditService,
  ) {}

  // ───────────────────────────── Migración desde contactos ─────────────────────────────

  /**
   * Crea empresas (tipo cliente) a partir del texto de `clients.company` y
   * vincula a cada contacto como empleado. Reutiliza una empresa raíz con el
   * mismo nombre (sin distinguir mayúsculas). No modifica el campo de los
   * contactos y se puede repetir: no duplica empresas ni vínculos.
   */
  async migrateFromContacts(tenantId: string, actor: Actor, dryRun: boolean): Promise<MigrationReport> {
    if (dryRun) return this.computeMigration(this.dataSource.manager, tenantId, false, null);

    return this.dataSource.transaction(async (em) => {
      // Evita que dos migraciones simultáneas de la misma cuenta dupliquen empresas.
      await em.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`companies-migrate:${tenantId}`]);
      const report = await this.computeMigration(em, tenantId, true, actor);
      return report;
    });
  }

  private async computeMigration(
    em: EntityManager,
    tenantId: string,
    apply: boolean,
    actor: Actor | null,
  ): Promise<MigrationReport> {
    const spellings: { key: string; name: string; n: number }[] = await em.query(
      `SELECT lower(btrim(company)) AS key, btrim(company) AS name, count(*)::int AS n
         FROM clients
        WHERE tenant_id = $1 AND deleted_at IS NULL AND company IS NOT NULL AND btrim(company) <> ''
        GROUP BY 1, 2`,
      [tenantId],
    );
    // Un mismo nombre puede venir con distinta grafía ("Acme", "ACME"): se usa la más
    // frecuente y, en empate, la primera en orden binario (resultado estable).
    const grouped = new Map<string, { key: string; name: string; n: number; best: number }>();
    for (const sp of spellings) {
      const g = grouped.get(sp.key);
      if (!g) {
        grouped.set(sp.key, { key: sp.key, name: sp.name, n: sp.n, best: sp.n });
      } else {
        g.n += sp.n;
        if (sp.n > g.best || (sp.n === g.best && sp.name < g.name)) {
          g.name = sp.name;
          g.best = sp.n;
        }
      }
    }
    const names = [...grouped.values()];

    const usable = names.filter((x) => x.name.length >= 2 && x.name.length <= 200);
    if (usable.length > MAX_MIGRATE_NAMES) {
      throw new BadRequestException(
        `Hay ${usable.length} nombres de empresa distintos. El máximo por migración es ${MAX_MIGRATE_NAMES}.`,
      );
    }
    const report: MigrationReport = {
      dryRun: !apply,
      distinctNames: names.length,
      toCreate: 0,
      existing: 0,
      contactsToLink: 0,
      skipped: names.length - usable.length,
    };
    if (usable.length === 0) return report;

    // Empresas raíz existentes con el mismo nombre (la más antigua si hay varias).
    const found: { id: string; key: string }[] = await em.query(
      `SELECT DISTINCT ON (lower(name)) id, lower(name) AS key
         FROM organizations
        WHERE tenant_id = $1 AND deleted_at IS NULL AND parent_id IS NULL AND lower(name) = ANY($2)
        ORDER BY lower(name), created_at ASC`,
      [tenantId, usable.map((u) => u.key)],
    );
    const idByKey = new Map(found.map((f) => [f.key, f.id]));
    const missing = usable.filter((u) => !idByKey.has(u.key));
    report.existing = usable.length - missing.length;
    report.toCreate = missing.length;

    if (apply && missing.length) {
      const repo = em.getRepository(Organization);
      const created = await repo.save(
        missing.map((m) => repo.create({ tenantId, name: m.name, type: 'client', status: 'active' })),
        { chunk: 200 },
      );
      missing.forEach((m, i) => idByKey.set(m.key, created[i].id));
    }

    const keys = [...idByKey.keys()].filter((k) => usable.some((u) => u.key === k));
    const orgIds = keys.map((k) => idByKey.get(k)!);

    if (!apply) {
      // Sin escribir: los contactos de empresas nuevas se vincularían todos; los de empresas
      // existentes, solo los que aún no están vinculados.
      const newContacts = missing.reduce((s, m) => s + m.n, 0);
      const existingKeys = keys;
      const rows: { n: number }[] = existingKeys.length
        ? await em.query(
            `SELECT count(*)::int AS n
               FROM clients c
               JOIN unnest($2::text[], $3::uuid[]) AS m(key, org_id) ON lower(btrim(c.company)) = m.key
              WHERE c.tenant_id = $1 AND c.deleted_at IS NULL
                AND NOT EXISTS (
                  SELECT 1 FROM contact_organizations x
                   WHERE x.tenant_id = $1 AND x.record_id = c.id AND x.organization_id = m.org_id)`,
            [tenantId, existingKeys, orgIds],
          )
        : [{ n: 0 }];
      report.contactsToLink = newContacts + (rows[0]?.n ?? 0);
      return report;
    }

    const linked: { id: string }[] = await em.query(
      `INSERT INTO contact_organizations (id, tenant_id, record_id, organization_id, role)
       SELECT gen_random_uuid(), $1, c.id, m.org_id, 'employee'
         FROM clients c
         JOIN unnest($2::text[], $3::uuid[]) AS m(key, org_id) ON lower(btrim(c.company)) = m.key
        WHERE c.tenant_id = $1 AND c.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM contact_organizations x
             WHERE x.tenant_id = $1 AND x.record_id = c.id AND x.organization_id = m.org_id)
       RETURNING id`,
      [tenantId, keys, orgIds],
    );
    report.contactsToLink = linked.length;

    await this.audit.log(
      {
        tenantId,
        actorType: 'user',
        actorId: actor?.id ?? null,
        actorLabel: actor?.email ?? null,
        action: 'companies.migrate-from-contacts',
        targetType: 'organization',
        metadata: { created: report.toCreate, reused: report.existing, linked: report.contactsToLink },
      },
      em,
    );
    return report;
  }
}
