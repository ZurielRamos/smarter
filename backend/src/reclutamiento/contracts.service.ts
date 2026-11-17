import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { TenantAuditService } from '../audit/tenant-audit.service';
import { ContractTemplate } from './entities/contract-template.entity';
import { SurveyorContract } from './entities/surveyor-contract.entity';
import { ContractFacts, ContractRenderService, toRenderedClauses } from './contracts/contract-render.service';
import { sanitizeValues } from './contracts/contract-variables';
import { ProfilesService } from './profiles.service';
import { ContractNumberingService } from './contract-numbering.service';
import {
  Actor,
  optionalString,
  requireCountry,
  requireCurrency,
  requireIsoDate,
  requireRate,
} from './validation';

const ALL_SIGNATURE_METHODS = ['wet', 'electronic_simple', 'electronic_advanced', 'digital_certificate'];
const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class ContractsService {
  constructor(
    @InjectRepository(SurveyorContract) private readonly contracts: Repository<SurveyorContract>,
    @InjectRepository(ContractTemplate) private readonly templates: Repository<ContractTemplate>,
    private readonly profiles: ProfilesService,
    private readonly numbering: ContractNumberingService,
    private readonly render: ContractRenderService,
    private readonly dataSource: DataSource,
    private readonly audit: TenantAuditService,
  ) {}

  private async requireContract(tenantId: string, contractId: string): Promise<SurveyorContract> {
    const contract = await this.contracts.findOne({ where: { id: contractId, tenantId } });
    if (!contract) throw new NotFoundException('Contrato no encontrado');
    return contract;
  }

  // ───────────────────────────── Crear ─────────────────────────────

  async create(tenantId: string, actor: Actor, profileId: string, body: Record<string, unknown>) {
    const profile = await this.profiles.requireProfile(tenantId, profileId);
    if (profile.status === 'ended') {
      throw new ConflictException('El perfil está terminado. Reábrelo para crear contratos.');
    }
    if (body.templateId) return this.createFromTemplate(tenantId, actor, profile, body);

    // Contrato manual (sin plantilla): el documento se gestiona fuera de la plataforma.
    const fields = this.parseFields(body, true);
    const saved = await this.contracts.save(
      this.contracts.create({ ...fields, countryCode: fields.countryCode!, tenantId, profileId, status: 'draft', createdBy: actor.id }),
    );
    await this.audit.log({
      tenantId,
      actorType: 'user',
      actorId: actor.id,
      actorLabel: actor.email,
      action: 'reclutamiento.contract.create',
      targetType: 'surveyor_contract',
      targetId: saved.id,
      scopeId: profileId,
      metadata: { rate: saved.defaultRate, currency: saved.currency, countryCode: saved.countryCode },
    });
    return saved;
  }

  private async createFromTemplate(
    tenantId: string,
    actor: Actor,
    profile: { id: string; recordId: string },
    body: Record<string, unknown>,
  ) {
    const template = await this.templates.findOne({ where: { id: String(body.templateId), tenantId } });
    if (!template) throw new NotFoundException('Plantilla no encontrada');
    if (template.status !== 'published') {
      throw new ConflictException('Solo se pueden usar plantillas publicadas para generar contratos.');
    }
    const fields = this.parseFields(body, false);
    const issueDate = body.issueDate ? requireIsoDate(body.issueDate, 'La fecha de emisión') : today();
    const values = sanitizeValues(body.values);

    const saved = await this.dataSource.transaction(async (em) => {
      const number = await this.numbering.next(em, tenantId, template.contractPrefix, Number(issueDate.slice(0, 4)));
      const patch = await this.generate(em, tenantId, profile.recordId, template, {
        number,
        issueDate,
        startDate: fields.startDate,
        endDate: fields.endDate,
        rate: fields.defaultRate,
        currency: fields.currency,
      }, values);

      const repo = em.getRepository(SurveyorContract);
      const entity = await repo.save(
        repo.create({
          ...patch,
          tenantId,
          profileId: profile.id,
          countryCode: template.countryCode,
          startDate: fields.startDate,
          endDate: fields.endDate,
          defaultRate: fields.defaultRate,
          currency: fields.currency,
          notes: fields.notes,
          status: 'draft',
          signatureStatus: 'unsigned',
          createdBy: actor.id,
        }),
      );
      await this.audit.log(
        {
          tenantId,
          actorType: 'user',
          actorId: actor.id,
          actorLabel: actor.email,
          action: 'reclutamiento.contract.create',
          targetType: 'surveyor_contract',
          targetId: entity.id,
          scopeId: profile.id,
          metadata: { number, templateId: template.id, templateVersion: template.version, contentHash: patch.contentHash, rate: fields.defaultRate, currency: fields.currency },
        },
        em,
      );
      return entity;
    });
    return saved;
  }

  /**
   * Redacta el documento y devuelve las columnas que se guardan con el contrato.
   * Lanza 400 con el detalle si faltan datos o el contratista no cumple un
   * requisito (p. ej. edad mínima): nunca se emite un contrato con huecos.
   */
  private async generate(
    em: EntityManager,
    tenantId: string,
    recordId: string,
    template: ContractTemplate,
    facts: ContractFacts,
    values: ReturnType<typeof sanitizeValues>,
  ) {
    const contact = await this.render.loadContact(tenantId, recordId);
    if (!contact) throw new NotFoundException('El contacto del encuestador ya no existe');
    const customFields = await this.render.loadCustomFields(tenantId);
    const out = this.render.render(template, contact, values, facts, customFields);
    const clauses = toRenderedClauses(out.text);
    if (out.blockers.length) {
      throw new BadRequestException({ code: 'CONTRACT_BLOCKED', message: out.blockers[0], blockers: out.blockers });
    }
    if (out.missing.length) {
      throw new BadRequestException({
        code: 'CONTRACT_MISSING_DATA',
        message: `Faltan ${out.missing.length} dato(s) para redactar el contrato.`,
        missing: out.missing,
      });
    }

    const contentHash = this.render.hash({
      templateId: template.id,
      templateVersion: template.version,
      languageCode: template.languageCode,
      contractType: template.contractType,
      facts,
      clauses,
      parties: {
        contractorName: out.parties.contractor.fullName,
        contractorDocument: out.parties.contractor.documentNumber,
      },
    });

    return {
      templateId: template.id,
      templateName: template.name,
      templateVersion: template.version,
      contractType: template.contractType,
      languageCode: template.languageCode,
      contractNumber: facts.number,
      issueDate: facts.issueDate,
      variableValues: values as unknown as Record<string, any>,
      partiesSnapshot: out.parties,
      renderedClauses: clauses,
      contentHash,
    };
  }

  // ───────────────────────────── Editar ─────────────────────────────

  /** Solo se edita un borrador sin firmar: los contratos vigentes conservan lo pactado. */
  async update(tenantId: string, actor: Actor, contractId: string, body: Record<string, unknown>) {
    const contract = await this.requireContract(tenantId, contractId);
    if (contract.status !== 'draft') {
      throw new ConflictException('Solo se puede editar un contrato en borrador. Termina este y crea uno nuevo para cambiar la tarifa.');
    }

    if (contract.templateId) {
      if (contract.sentToContactAt) {
        throw new ConflictException('El contrato está disponible en el portal del encuestador. Retíralo del portal antes de editarlo.');
      }
      if (contract.signatureStatus === 'signed') {
        throw new ConflictException('El contrato ya está firmado y no se puede modificar. Elimina el borrador firmado y genera uno nuevo si hay un error.');
      }
      const template = await this.templates.findOne({ where: { id: contract.templateId, tenantId } });
      if (!template) throw new NotFoundException('La plantilla de este contrato ya no existe');
      const fields = this.parseFields(body, false);
      const issueDate = body.issueDate ? requireIsoDate(body.issueDate, 'La fecha de emisión') : contract.issueDate ?? today();
      const values = sanitizeValues(body.values ?? contract.variableValues);
      const profile = await this.profiles.requireProfile(tenantId, contract.profileId);

      await this.dataSource.transaction(async (em) => {
        // Se conserva el número: re-redactar un borrador no consume consecutivos.
        const patch = await this.generate(em, tenantId, profile.recordId, template, {
          number: contract.contractNumber!,
          issueDate,
          startDate: fields.startDate,
          endDate: fields.endDate,
          rate: fields.defaultRate,
          currency: fields.currency,
        }, values);
        const res = await em.getRepository(SurveyorContract).update(
          { id: contractId, tenantId, status: 'draft', signatureStatus: 'unsigned' },
          { ...patch, startDate: fields.startDate, endDate: fields.endDate, defaultRate: fields.defaultRate, currency: fields.currency, notes: fields.notes },
        );
        if (!res.affected) throw new ConflictException('El contrato cambió mientras se procesaba. Reintenta.');
        await this.audit.log(
          {
            tenantId,
            actorType: 'user',
            actorId: actor.id,
            actorLabel: actor.email,
            action: 'reclutamiento.contract.update',
            targetType: 'surveyor_contract',
            targetId: contractId,
            scopeId: contract.profileId,
            metadata: { number: contract.contractNumber, contentHash: patch.contentHash, rate: fields.defaultRate, currency: fields.currency },
          },
          em,
        );
      });
      return this.requireContract(tenantId, contractId);
    }

    const fields = this.parseFields(body, true);
    await this.contracts.update({ id: contractId, tenantId, status: 'draft' }, { ...fields, countryCode: fields.countryCode! });
    await this.audit.log({
      tenantId,
      actorType: 'user',
      actorId: actor.id,
      actorLabel: actor.email,
      action: 'reclutamiento.contract.update',
      targetType: 'surveyor_contract',
      targetId: contractId,
      scopeId: contract.profileId,
      metadata: { rate: fields.defaultRate, currency: fields.currency, countryCode: fields.countryCode },
    });
    return this.requireContract(tenantId, contractId);
  }

  // ───────────────────────────── Firma y documento ─────────────────────────────

  /**
   * Registra la firma de un contrato generado desde plantilla. La plataforma NO
   * firma por las partes: deja constancia de CÓMO y CUÁNDO se firmó, con la huella
   * del texto firmado. Antes se comprueba que el texto no haya cambiado.
   */
  async sign(tenantId: string, actor: Actor, contractId: string, body: Record<string, unknown>) {
    const contract = await this.requireContract(tenantId, contractId);
    if (!contract.templateId || !contract.renderedClauses) {
      throw new BadRequestException('Solo los contratos generados desde una plantilla registran firma en la plataforma.');
    }
    if (contract.status !== 'draft') throw new ConflictException('Solo se registra la firma de un contrato en borrador.');
    if (contract.signatureStatus === 'signed') throw new ConflictException('El contrato ya está firmado.');
    if (!this.integrityOk(contract)) {
      throw new ConflictException('El texto del contrato no coincide con su huella. No se puede registrar la firma; genera el contrato de nuevo.');
    }

    const method = typeof body.method === 'string' ? body.method : '';
    if (!ALL_SIGNATURE_METHODS.includes(method)) throw new BadRequestException('Método de firma no admitido');

    const signedAt = requireIsoDate(body.signedAt, 'La fecha de firma');
    if (signedAt > today()) throw new BadRequestException('La fecha de firma no puede ser futura');
    if (contract.issueDate && signedAt < contract.issueDate) {
      throw new BadRequestException('La fecha de firma no puede ser anterior a la fecha de emisión del contrato');
    }
    const witnessName = optionalString(body.witnessName, 'El nombre del testigo', 200);

    const evidence = {
      method,
      reference: optionalString(body.reference, 'La referencia', 200) ?? undefined,
      notes: optionalString(body.notes, 'Las notas', 1000) ?? undefined,
      witnessName: witnessName ?? undefined,
      registeredBy: actor.email,
      registeredAt: new Date().toISOString(),
      contentHash: contract.contentHash!,
    };

    await this.dataSource.transaction(async (em) => {
      const res = await em
        .getRepository(SurveyorContract)
        .update({ id: contractId, tenantId, status: 'draft', signatureStatus: 'unsigned' }, { signatureStatus: 'signed', signedAt, signatureEvidence: evidence });
      if (!res.affected) throw new ConflictException('El contrato cambió mientras se procesaba. Reintenta.');
      await this.audit.log(
        {
          tenantId,
          actorType: 'user',
          actorId: actor.id,
          actorLabel: actor.email,
          action: 'reclutamiento.contract.sign',
          targetType: 'surveyor_contract',
          targetId: contractId,
          scopeId: contract.profileId,
          metadata: { number: contract.contractNumber, method, signedAt, contentHash: contract.contentHash },
        },
        em,
      );
    });
    return this.requireContract(tenantId, contractId);
  }

  // ───────────────────────────── Portal del encuestador ─────────────────────────────

  /** Pone el contrato a disposición del encuestador en el portal para que lo lea y lo firme. */
  async sendToContact(tenantId: string, actor: Actor, contractId: string) {
    const contract = await this.requireContract(tenantId, contractId);
    if (!contract.templateId || !contract.renderedClauses) {
      throw new BadRequestException('Solo los contratos generados desde una plantilla se pueden enviar al portal.');
    }
    if (contract.status !== 'draft' || contract.signatureStatus === 'signed') {
      throw new ConflictException('Solo se envía al portal un contrato en borrador sin firmar.');
    }
    if (!this.integrityOk(contract)) {
      throw new ConflictException('El texto del contrato no coincide con su huella; vuelve a generarlo antes de enviarlo.');
    }
    await this.dataSource.transaction(async (em) => {
      const res = await em
        .getRepository(SurveyorContract)
        .update({ id: contractId, tenantId, status: 'draft', signatureStatus: 'unsigned' }, { sentToContactAt: new Date() });
      if (!res.affected) throw new ConflictException('El contrato cambió mientras se procesaba. Reintenta.');
      await this.audit.log(
        {
          tenantId,
          actorType: 'user',
          actorId: actor.id,
          actorLabel: actor.email,
          action: 'reclutamiento.contract.send',
          targetType: 'surveyor_contract',
          targetId: contractId,
          scopeId: contract.profileId,
          metadata: { number: contract.contractNumber, contentHash: contract.contentHash },
        },
        em,
      );
    });
    return this.requireContract(tenantId, contractId);
  }

  /** Retira el contrato del portal (por ejemplo, para corregirlo). */
  async withdrawFromContact(tenantId: string, actor: Actor, contractId: string) {
    const contract = await this.requireContract(tenantId, contractId);
    if (contract.signatureStatus === 'signed') throw new ConflictException('El contrato ya está firmado.');
    if (!contract.sentToContactAt) return contract;
    await this.dataSource.transaction(async (em) => {
      await em
        .getRepository(SurveyorContract)
        .update({ id: contractId, tenantId, signatureStatus: 'unsigned' }, { sentToContactAt: null });
      await this.audit.log(
        {
          tenantId,
          actorType: 'user',
          actorId: actor.id,
          actorLabel: actor.email,
          action: 'reclutamiento.contract.withdraw',
          targetType: 'surveyor_contract',
          targetId: contractId,
          scopeId: contract.profileId,
          metadata: { number: contract.contractNumber },
        },
        em,
      );
    });
    return this.requireContract(tenantId, contractId);
  }

  /** Contratos que el encuestador puede ver en el portal: solo los suyos que se le enviaron. */
  async listForPortal(tenantId: string, profileId: string) {
    const rows = await this.contracts
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId AND c.profileId = :profileId AND c.templateId IS NOT NULL AND c.sentToContactAt IS NOT NULL', { tenantId, profileId })
      .orderBy('c.createdAt', 'DESC')
      .getMany();
    return rows.map((c) => ({
      id: c.id,
      number: c.contractNumber,
      title: c.templateName,
      status: c.status,
      signatureStatus: c.signatureStatus,
      signedAt: c.signedAt,
      issueDate: c.issueDate,
      startDate: c.startDate,
      endDate: c.endDate,
      rate: c.defaultRate,
      currency: c.currency,
      sentAt: c.sentToContactAt,
      canSign: c.status === 'draft' && c.signatureStatus === 'unsigned' && !!c.issueDate && c.issueDate <= today() && this.integrityOk(c),
    }));
  }

  /** Un contrato del portal, solo si es del encuestador y se le envió. */
  private async requireForPortal(tenantId: string, profileId: string, contractId: string): Promise<SurveyorContract> {
    const c = await this.contracts.findOne({ where: { id: contractId, tenantId, profileId } });
    if (!c || !c.templateId || !c.sentToContactAt) throw new NotFoundException('Contrato no encontrado');
    return c;
  }

  async documentForPortal(tenantId: string, profileId: string, contractId: string) {
    await this.requireForPortal(tenantId, profileId, contractId);
    return this.document(tenantId, contractId);
  }

  /** Comprueba que el contrato puede firmarlo el encuestador ahora mismo. */
  async assertSignableByContact(tenantId: string, profileId: string, contractId: string): Promise<SurveyorContract> {
    const c = await this.requireForPortal(tenantId, profileId, contractId);
    if (c.status !== 'draft') throw new ConflictException('Este contrato ya no está pendiente de firma.');
    if (c.signatureStatus === 'signed') throw new ConflictException('El contrato ya está firmado.');
    if (c.issueDate && c.issueDate > today()) throw new ConflictException(`Este contrato se puede firmar a partir del ${c.issueDate}.`);
    if (!this.integrityOk(c)) throw new ConflictException('El texto del contrato no coincide con su huella. Avisa a quien te lo envió.');
    return c;
  }

  /**
   * El encuestador acepta el contrato en el portal. La aceptación queda
   * respaldada por un código de un solo uso enviado a su correo o teléfono, la
   * huella del texto y la IP; la plataforma no firma por él.
   */
  async signByContact(
    tenantId: string,
    profileId: string,
    contractId: string,
    ctx: { channel: string; destinationMasked: string; ip?: string; userAgent?: string },
  ) {
    const contract = await this.assertSignableByContact(tenantId, profileId, contractId);
    const signedAt = today();
    const evidence = {
      method: 'electronic_simple',
      registeredBy: `portal:${profileId}`,
      registeredAt: new Date().toISOString(),
      contentHash: contract.contentHash!,
      signedBy: 'contractor_portal' as const,
      ip: ctx.ip?.slice(0, 64),
      userAgent: ctx.userAgent?.slice(0, 300),
      verifiedChannel: ctx.channel,
      verifiedDestination: ctx.destinationMasked,
    };
    await this.dataSource.transaction(async (em) => {
      const res = await em
        .getRepository(SurveyorContract)
        .update({ id: contractId, tenantId, profileId, status: 'draft', signatureStatus: 'unsigned' }, { signatureStatus: 'signed', signedAt, signatureEvidence: evidence });
      if (!res.affected) throw new ConflictException('El contrato cambió mientras se procesaba. Reintenta.');
      await this.audit.log(
        {
          tenantId,
          actorType: 'surveyor',
          actorId: profileId,
          action: 'reclutamiento.contract.sign',
          targetType: 'surveyor_contract',
          targetId: contractId,
          scopeId: profileId,
          metadata: { number: contract.contractNumber, method: 'electronic_simple', signedBy: 'contractor_portal', signedAt, contentHash: contract.contentHash },
        },
        em,
      );
    });
    return { signedAt };
  }

  /** Documento tal como se emitió (copia congelada), con la comprobación de integridad. */
  async document(tenantId: string, contractId: string) {
    const c = await this.requireContract(tenantId, contractId);
    if (!c.renderedClauses) throw new BadRequestException('Este contrato no se generó desde una plantilla y no tiene documento en la plataforma.');
    return {
      id: c.id,
      number: c.contractNumber,
      title: c.templateName,
      templateVersion: c.templateVersion,
      contractType: c.contractType,
      languageCode: c.languageCode,
      issueDate: c.issueDate,
      startDate: c.startDate,
      endDate: c.endDate,
      status: c.status,
      clauses: c.renderedClauses,
      parties: c.partiesSnapshot,
      contentHash: c.contentHash,
      integrityOk: this.integrityOk(c),
      signature: { status: c.signatureStatus, signedAt: c.signedAt, evidence: c.signatureEvidence },
    };
  }

  /** ¿El texto guardado sigue produciendo la huella registrada? */
  private integrityOk(c: SurveyorContract): boolean {
    if (!c.renderedClauses || !c.contentHash) return false;
    const parties = (c.partiesSnapshot ?? {}) as { company?: Record<string, any>; contractor?: Record<string, any> };
    const recomputed = this.render.hash({
      templateId: c.templateId,
      templateVersion: c.templateVersion,
      languageCode: c.languageCode,
      contractType: c.contractType,
      facts: {
        number: c.contractNumber!,
        issueDate: c.issueDate!,
        startDate: c.startDate,
        endDate: c.endDate,
        rate: c.defaultRate,
        currency: c.currency,
      },
      clauses: c.renderedClauses,
      parties: {
        // Los contratos anteriores al modelo simplificado conservan los datos de la empresa en su huella.
        companyName: parties.company?.legalName,
        companyTaxId: parties.company?.taxId,
        contractorName: parties.contractor?.fullName,
        contractorDocument: parties.contractor?.documentNumber,
      },
    });
    return recomputed === c.contentHash;
  }

  // ───────────────────────────── Estados ─────────────────────────────

  async activate(tenantId: string, actor: Actor, contractId: string) {
    const contract = await this.requireContract(tenantId, contractId);
    if (contract.status !== 'draft') {
      throw new ConflictException(`No se puede activar un contrato en estado "${contract.status}"`);
    }
    const profile = await this.profiles.requireProfile(tenantId, contract.profileId);
    if (profile.status === 'ended') {
      throw new ConflictException('El perfil está terminado. Reábrelo para activar contratos.');
    }
    // Un contrato generado desde plantilla se activa firmado.
    if (contract.templateId) {
      if (contract.signatureStatus !== 'signed') {
        throw new BadRequestException('El contrato debe estar firmado antes de activarse. Registra la firma primero.');
      }
      if (!this.integrityOk(contract)) {
        throw new ConflictException('El texto del contrato no coincide con su huella; no se puede activar.');
      }
    }

    try {
      await this.dataSource.transaction(async (em) => {
        const res = await em
          .getRepository(SurveyorContract)
          .update({ id: contractId, tenantId, status: 'draft' }, { status: 'active' });
        if (!res.affected) throw new ConflictException('El contrato cambió mientras se procesaba. Reintenta.');
        await this.audit.log(
          {
            tenantId,
            actorType: 'user',
            actorId: actor.id,
            actorLabel: actor.email,
            action: 'reclutamiento.contract.activate',
            targetType: 'surveyor_contract',
            targetId: contractId,
            scopeId: contract.profileId,
            metadata: { rate: contract.defaultRate, currency: contract.currency, number: contract.contractNumber },
          },
          em,
        );
      });
    } catch (err: any) {
      // Índice único parcial: ya existe otro contrato activo para este perfil.
      if (err?.code === '23505') {
        throw new ConflictException('El encuestador ya tiene un contrato activo. Termínalo antes de activar otro.');
      }
      throw err;
    }
    return this.requireContract(tenantId, contractId);
  }

  async end(tenantId: string, actor: Actor, contractId: string) {
    const contract = await this.requireContract(tenantId, contractId);
    if (contract.status !== 'active') {
      throw new ConflictException(`No se puede terminar un contrato en estado "${contract.status}"`);
    }

    await this.dataSource.transaction(async (em) => {
      const res = await em
        .getRepository(SurveyorContract)
        .createQueryBuilder()
        .update(SurveyorContract)
        .set({
          status: 'ended',
          endDate: () => 'LEAST(COALESCE(end_date, CURRENT_DATE), CURRENT_DATE)',
        })
        .where('id = :id AND tenant_id = :tenantId AND status = :status', {
          id: contractId,
          tenantId,
          status: 'active',
        })
        .execute();
      if (!res.affected) throw new ConflictException('El contrato cambió mientras se procesaba. Reintenta.');
      await this.audit.log(
        {
          tenantId,
          actorType: 'user',
          actorId: actor.id,
          actorLabel: actor.email,
          action: 'reclutamiento.contract.end',
          targetType: 'surveyor_contract',
          targetId: contractId,
          scopeId: contract.profileId,
          metadata: null,
        },
        em,
      );
    });
    return this.requireContract(tenantId, contractId);
  }

  /** Solo los borradores se pueden eliminar; los demás son historial. Un borrador firmado no se elimina. */
  async remove(tenantId: string, actor: Actor, contractId: string) {
    const contract = await this.requireContract(tenantId, contractId);
    if (contract.status !== 'draft') {
      throw new ConflictException('Solo se pueden eliminar contratos en borrador');
    }
    if (contract.signatureStatus === 'signed') {
      throw new ConflictException('Un contrato firmado no se elimina. Actívalo y termínalo para conservar el historial.');
    }
    await this.dataSource.transaction(async (em) => {
      await em.getRepository(SurveyorContract).delete({ id: contractId, tenantId, status: 'draft', signatureStatus: 'unsigned' });
      await this.audit.log(
        {
          tenantId,
          actorType: 'user',
          actorId: actor.id,
          actorLabel: actor.email,
          action: 'reclutamiento.contract.delete',
          targetType: 'surveyor_contract',
          targetId: contractId,
          scopeId: contract.profileId,
          metadata: { number: contract.contractNumber },
        },
        em,
      );
    });
    return { success: true };
  }

  /** `withCountry`: contrato manual (el país lo captura el usuario). Con plantilla, el país lo fija la plantilla. */
  private parseFields(body: Record<string, unknown>, withCountry: boolean) {
    const startDate = requireIsoDate(body.startDate, 'La fecha de inicio');
    const endDate =
      body.endDate === undefined || body.endDate === null || body.endDate === ''
        ? null
        : requireIsoDate(body.endDate, 'La fecha de fin');
    if (endDate && endDate < startDate) {
      throw new BadRequestException('La fecha de fin no puede ser anterior a la de inicio');
    }
    return {
      countryCode: withCountry ? requireCountry(body.countryCode) : undefined,
      startDate,
      endDate,
      defaultRate: requireRate(body.defaultRate, 'La tarifa'),
      currency: requireCurrency(body.currency),
      notes: optionalString(body.notes, 'Las notas', 2000),
    };
  }
}
