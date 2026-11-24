import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { ClientRecord } from '../records/record.entity';
import { TenantAuditService } from '../audit/tenant-audit.service';
import { Actor, clampInt, escapeLike, requireUuid } from '../reclutamiento/validation';
import {
  ORGANIZATION_STATUSES,
  ORGANIZATION_TYPES,
  Organization,
} from './entities/organization.entity';
import { ContactOrganization } from './entities/contact-organization.entity';
import { OrganizationInput, parseLinkInput, parseOrganizationInput } from './organization-input';

const PG_UNIQUE_VIOLATION = '23505';
const MAP_LIMIT = 2000;

/** Campos de perfil de la empresa, compartidos por la creación manual y la importación. */
export function extraFields(input: OrganizationInput) {
  return {
    legalName: input.legalName ?? null,
    industry: input.industry ?? null,
    size: input.size ?? null,
    employeeRange: input.employeeRange ?? null,
    phones: input.phones ?? null,
    email: input.email ?? null,
    website: input.website ?? null,
    postalCode: input.postalCode ?? null,
    openingHours: input.openingHours ?? null,
    tags: input.tags ?? null,
    notes: input.notes ?? null,
  };
}

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === PG_UNIQUE_VIOLATION;

/**
 * Empresas de una cuenta (cadenas y sucursales, establecimientos, clientes) y
 * su vínculo con contactos del CRM.
 *
 * Toda consulta lleva `tenantId`: nunca se busca una empresa solo por id.
 * La jerarquía tiene dos niveles (cadena → sucursal).
 */
@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(ContactOrganization) private readonly links: Repository<ContactOrganization>,
    @InjectRepository(ClientRecord) private readonly records: Repository<ClientRecord>,
    private readonly dataSource: DataSource,
    private readonly audit: TenantAuditService,
  ) {}

  /** Empresa de la cuenta o 404. */
  async requireOrg(tenantId: string, id: string, em?: EntityManager): Promise<Organization> {
    const repo = em ? em.getRepository(Organization) : this.orgs;
    const org = await repo.findOne({ where: { id, tenantId } });
    if (!org) throw new NotFoundException('Empresa no encontrada');
    return org;
  }

  // ───────────────────────────── Lectura ─────────────────────────────

  async list(
    tenantId: string,
    q: { search?: string; type?: string; status?: string; parentId?: string; page?: unknown; limit?: unknown },
  ) {
    const page = clampInt(q.page, 1, 1, 100000);
    const limit = clampInt(q.limit, 25, 1, 100);

    const qb = this.filtered(tenantId, q);

    const [rows, total] = await qb
      .orderBy('o.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data: await this.enrich(tenantId, rows), total, page, limit };
  }

  /** Consulta base con los filtros compartidos por la lista y el mapa. */
  private filtered(
    tenantId: string,
    q: { search?: string; type?: string; status?: string; parentId?: string },
  ) {
    const qb = this.orgs.createQueryBuilder('o').where('o.tenantId = :tenantId', { tenantId });

    if (q.type) {
      if (!(ORGANIZATION_TYPES as readonly string[]).includes(q.type)) {
        throw new BadRequestException('Tipo inválido');
      }
      qb.andWhere('o.type = :type', { type: q.type });
    }
    if (q.status) {
      if (!(ORGANIZATION_STATUSES as readonly string[]).includes(q.status)) {
        throw new BadRequestException('Estado inválido');
      }
      qb.andWhere('o.status = :status', { status: q.status });
    }
    if (q.parentId === 'root') {
      qb.andWhere('o.parentId IS NULL');
    } else if (q.parentId) {
      qb.andWhere('o.parentId = :parentId', { parentId: requireUuid(q.parentId, 'Empresa matriz') });
    }
    const term = q.search?.trim();
    if (term) {
      qb.andWhere(
        `(o.name ILIKE :term ESCAPE '\\' OR o.legalName ILIKE :term ESCAPE '\\' OR
          o.documentNumber ILIKE :term ESCAPE '\\' OR o.email ILIKE :term ESCAPE '\\' OR
          o.industry ILIKE :term ESCAPE '\\' OR CAST(o.phones AS text) ILIKE :term ESCAPE '\\' OR
          o.city ILIKE :term ESCAPE '\\' OR o.address ILIKE :term ESCAPE '\\')`,
        { term: `%${escapeLike(term)}%` },
      );
    }

    return qb;
  }

  /** Agrega nombre de la matriz, número de sucursales y de contactos a cada fila. */
  private async enrich(tenantId: string, rows: Organization[]) {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const parentIds = [...new Set(rows.map((r) => r.parentId).filter((p): p is string => !!p))];

    const [parents, childRows, contactRows] = await Promise.all([
      parentIds.length
        ? this.orgs.find({ where: { tenantId, id: In(parentIds) }, select: { id: true, name: true } })
        : Promise.resolve([] as Organization[]),
      this.orgs
        .createQueryBuilder('o')
        .select('o.parentId', 'parentId')
        .addSelect('COUNT(*)::int', 'n')
        .where('o.tenantId = :tenantId AND o.parentId IN (:...ids)', { tenantId, ids })
        .groupBy('o.parentId')
        .getRawMany<{ parentId: string; n: number }>(),
      this.dataSource.query(
        `SELECT co.organization_id AS "organizationId", COUNT(DISTINCT co.record_id)::int AS n
           FROM contact_organizations co
           JOIN clients c ON c.id = co.record_id AND c.tenant_id = co.tenant_id AND c.deleted_at IS NULL
          WHERE co.tenant_id = $1 AND co.organization_id = ANY($2)
          GROUP BY co.organization_id`,
        [tenantId, ids],
      ) as Promise<{ organizationId: string; n: number }[]>,
    ]);

    const parentName = new Map(parents.map((p) => [p.id, p.name]));
    const children = new Map(childRows.map((r) => [r.parentId, Number(r.n)]));
    const contacts = new Map(contactRows.map((r) => [r.organizationId, Number(r.n)]));

    return rows.map((o) => ({
      ...o,
      parentName: o.parentId ? parentName.get(o.parentId) ?? null : null,
      childCount: children.get(o.id) ?? 0,
      contactCount: contacts.get(o.id) ?? 0,
    }));
  }

  /** Empresas a las que está vinculado un contacto de la cuenta. */
  async byContact(tenantId: string, recordId: string) {
    requireUuid(recordId, 'Contacto');
    const rows: { linkId: string; role: string; id: string; name: string; type: string; city: string | null }[] =
      await this.dataSource.query(
        `SELECT co.id AS "linkId", co.role, o.id, o.name, o.type, o.city
           FROM contact_organizations co
           JOIN organizations o ON o.id = co.organization_id AND o.tenant_id = co.tenant_id AND o.deleted_at IS NULL
          WHERE co.tenant_id = $1 AND co.record_id = $2
          ORDER BY o.name ASC`,
        [tenantId, recordId],
      );
    return { data: rows };
  }

  /** Puntos del mapa: empresas con coordenadas que cumplen los filtros (hasta MAP_LIMIT). */
  async mapPoints(
    tenantId: string,
    q: { search?: string; type?: string; status?: string; parentId?: string },
  ) {
    const [rows, total] = await this.filtered(tenantId, q)
      .andWhere('o.lat IS NOT NULL AND o.lng IS NOT NULL')
      .select(['o.id', 'o.name', 'o.type', 'o.status', 'o.city', 'o.address', 'o.lat', 'o.lng'])
      .orderBy('o.name', 'ASC')
      .take(MAP_LIMIT)
      .getManyAndCount();
    return { data: rows, total, truncated: total > rows.length };
  }

  async detail(tenantId: string, id: string) {
    const org = await this.requireOrg(tenantId, id);
    const [parent, children, links] = await Promise.all([
      org.parentId
        ? this.orgs.findOne({ where: { id: org.parentId, tenantId }, select: { id: true, name: true, type: true } })
        : Promise.resolve(null),
      this.orgs.find({
        where: { tenantId, parentId: id },
        order: { name: 'ASC' },
        select: { id: true, name: true, type: true, status: true, city: true, address: true },
      }),
      this.links.find({ where: { tenantId, organizationId: id }, order: { createdAt: 'DESC' } }),
    ]);

    const recordIds = [...new Set(links.map((l) => l.recordId))];
    const recs = recordIds.length
      ? await this.records.find({
          where: { tenantId, id: In(recordIds), deletedAt: IsNull() },
          select: { id: true, fullName: true, firstName: true, lastName: true, phone: true, email: true },
        })
      : [];
    const byId = new Map(recs.map((r) => [r.id, r]));

    // Los vínculos a contactos eliminados no se muestran.
    const contacts = links
      .filter((l) => byId.has(l.recordId))
      .map((l) => {
        const r = byId.get(l.recordId)!;
        return {
          linkId: l.id,
          role: l.role,
          recordId: r.id,
          name: r.fullName || [r.firstName, r.lastName].filter(Boolean).join(' ') || null,
          phone: r.phone ?? null,
          email: r.email ?? null,
        };
      });

    return { organization: org, parent, children, contacts };
  }

  // ───────────────────────────── Escritura ─────────────────────────────

  async create(tenantId: string, actor: Actor, raw: unknown) {
    const input = parseOrganizationInput(raw, 'create');
    await this.assertParent(tenantId, null, input.parentId ?? null);
    await this.assertDocumentFree(tenantId, input.documentNumber ?? null, null);

    try {
      return await this.dataSource.transaction(async (em) => {
        const repo = em.getRepository(Organization);
        const org = await repo.save(
          repo.create({
            tenantId,
            name: input.name!,
            type: input.type ?? 'establishment',
            status: input.status ?? 'active',
            parentId: input.parentId ?? null,
            documentType: input.documentType ?? null,
            documentNumber: input.documentNumber ?? null,
            address: input.address ?? null,
            city: input.city ?? null,
            region: input.region ?? null,
            countryCode: input.countryCode ?? null,
            lat: input.lat ?? null,
            lng: input.lng ?? null,
            ...extraFields(input),
            customData: input.customData ?? null,
          }),
        );
        await this.audit.log(
          {
            tenantId,
            actorType: 'user',
            actorId: actor.id,
            actorLabel: actor.email,
            action: 'companies.organization.create',
            targetType: 'organization',
            targetId: org.id,
            metadata: { type: org.type, parentId: org.parentId },
          },
          em,
        );
        return org;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw this.duplicateDocument();
      throw err;
    }
  }

  async update(tenantId: string, actor: Actor, id: string, raw: unknown) {
    const input = parseOrganizationInput(raw, 'update');

    try {
      return await this.dataSource.transaction(async (em) => {
        const repo = em.getRepository(Organization);
        const org = await this.requireOrg(tenantId, id, em);

        if (input.parentId !== undefined && input.parentId !== org.parentId) {
          await this.assertParent(tenantId, org.id, input.parentId, em);
        }
        if (input.documentNumber !== undefined && input.documentNumber !== org.documentNumber) {
          await this.assertDocumentFree(tenantId, input.documentNumber, org.id, em);
        }

        const changed = (Object.keys(input) as (keyof OrganizationInput)[]).filter(
          (k) => JSON.stringify(input[k]) !== JSON.stringify(org[k as keyof Organization]),
        );
        if (changed.length === 0) return org;

        Object.assign(org, input);
        const saved = await repo.save(org);
        await this.audit.log(
          {
            tenantId,
            actorType: 'user',
            actorId: actor.id,
            actorLabel: actor.email,
            action: 'companies.organization.update',
            targetType: 'organization',
            targetId: id,
            metadata: { fields: changed },
          },
          em,
        );
        return saved;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw this.duplicateDocument();
      throw err;
    }
  }

  async remove(tenantId: string, actor: Actor, id: string) {
    await this.dataSource.transaction(async (em) => {
      const org = await this.requireOrg(tenantId, id, em);
      const childCount = await em.getRepository(Organization).count({ where: { tenantId, parentId: id } });
      if (childCount > 0) {
        throw new ConflictException({
          code: 'HAS_CHILDREN',
          message: `Esta empresa tiene ${childCount} sucursal(es). Muévelas o elimínalas primero.`,
          childCount,
        });
      }
      await em.getRepository(ContactOrganization).delete({ tenantId, organizationId: id });
      await em.getRepository(Organization).softDelete({ id, tenantId });
      await this.audit.log(
        {
          tenantId,
          actorType: 'user',
          actorId: actor.id,
          actorLabel: actor.email,
          action: 'companies.organization.delete',
          targetType: 'organization',
          targetId: id,
          metadata: { name: org.name, type: org.type },
        },
        em,
      );
    });
    return { ok: true };
  }

  // ───────────────────────────── Contactos vinculados ─────────────────────────────

  async linkContact(tenantId: string, actor: Actor, orgId: string, raw: unknown) {
    const { recordId, role } = parseLinkInput(raw);
    await this.requireOrg(tenantId, orgId);
    const record = await this.records.findOne({
      where: { id: recordId, tenantId, deletedAt: IsNull() },
      select: { id: true },
    });
    if (!record) throw new NotFoundException('Contacto no encontrado en esta cuenta');

    try {
      return await this.dataSource.transaction(async (em) => {
        const repo = em.getRepository(ContactOrganization);
        const link = await repo.save(repo.create({ tenantId, organizationId: orgId, recordId, role }));
        await this.audit.log(
          {
            tenantId,
            actorType: 'user',
            actorId: actor.id,
            actorLabel: actor.email,
            action: 'companies.contact.link',
            targetType: 'organization',
            targetId: orgId,
            metadata: { recordId, role },
          },
          em,
        );
        return link;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('Este contacto ya está vinculado con ese rol');
      }
      throw err;
    }
  }

  async unlinkContact(tenantId: string, actor: Actor, orgId: string, linkId: string) {
    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(ContactOrganization);
      const link = await repo.findOne({ where: { id: linkId, tenantId, organizationId: orgId } });
      if (!link) throw new NotFoundException('Vínculo no encontrado');
      await repo.delete({ id: linkId, tenantId });
      await this.audit.log(
        {
          tenantId,
          actorType: 'user',
          actorId: actor.id,
          actorLabel: actor.email,
          action: 'companies.contact.unlink',
          targetType: 'organization',
          targetId: orgId,
          metadata: { recordId: link.recordId, role: link.role },
        },
        em,
      );
    });
    return { ok: true };
  }

  // ───────────────────────────── Reglas ─────────────────────────────

  /**
   * Valida la matriz: de la misma cuenta, existente, distinta de la propia
   * empresa y sin ser ella misma una sucursal. Una empresa con sucursales no
   * puede pasar a ser sucursal (la jerarquía es de dos niveles).
   */
  private async assertParent(
    tenantId: string,
    selfId: string | null,
    parentId: string | null,
    em?: EntityManager,
  ) {
    if (!parentId) return;
    if (selfId && parentId === selfId) {
      throw new BadRequestException('Una empresa no puede ser su propia matriz');
    }
    const repo = em ? em.getRepository(Organization) : this.orgs;
    const parent = await repo.findOne({ where: { id: parentId, tenantId } });
    if (!parent) throw new NotFoundException('Empresa matriz no encontrada');
    if (parent.parentId) {
      throw new BadRequestException('La matriz ya es una sucursal. La jerarquía permite dos niveles.');
    }
    if (selfId) {
      const hasChildren = await repo.count({ where: { tenantId, parentId: selfId } });
      if (hasChildren > 0) {
        throw new BadRequestException('Esta empresa tiene sucursales y no puede pasar a ser una sucursal.');
      }
    }
  }

  private async assertDocumentFree(
    tenantId: string,
    documentNumber: string | null,
    selfId: string | null,
    em?: EntityManager,
  ) {
    if (!documentNumber) return;
    const repo = em ? em.getRepository(Organization) : this.orgs;
    const existing = await repo.findOne({ where: { tenantId, documentNumber }, select: { id: true, name: true } });
    if (existing && existing.id !== selfId) throw this.duplicateDocument(existing);
  }

  private duplicateDocument(existing?: Pick<Organization, 'id' | 'name'>) {
    return new ConflictException({
      code: 'DUPLICATE_DOCUMENT',
      message: existing
        ? `Ya existe una empresa con ese documento: ${existing.name}.`
        : 'Ya existe una empresa con ese documento.',
      organizationId: existing?.id,
    });
  }
}
