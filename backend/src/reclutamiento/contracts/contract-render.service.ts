import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { ClientRecord } from '../../records/record.entity';
import { CustomField } from '../../records/custom-field.entity';
import type { RenderedClause } from '../entities/surveyor-contract.entity';
import { Language, renderTemplate } from './contract-engine';
import { CustomFieldInfo, MissingInfo, VariableValues, buildContactContext, describeMissing } from './contract-variables';

/** Edad mínima para contratar. Regla de la plataforma, no configurable. */
export const MINIMUM_AGE = 18;

/** Lo que el motor necesita saber de una plantilla (también sirve para un borrador sin guardar). */
export interface TemplateContent {
  body: string;
  languageCode: string;
  countryCode: string;
}

export interface ContractFacts {
  number: string;
  issueDate: string;
  startDate: string;
  endDate: string | null;
  rate: number;
  currency: string;
}

export type MissingItem = MissingInfo;

export interface RenderOutput {
  text: string;
  missing: MissingItem[];
  /** Problemas que impiden emitir el contrato aunque no falte ningún dato (p. ej. menor de edad). */
  blockers: string[];
  /** Datos del contacto que quedan en el documento. */
  parties: { contractor: Record<string, any> };
}

/** El documento se guarda como un único bloque de texto. */
export const toRenderedClauses = (text: string): RenderedClause[] => [{ key: 'contrato', number: 1, title: '', body: text }];

const regionName = (code: string, lang: Language): string => {
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

const isoDate = (d: unknown): string | undefined => {
  if (!d) return undefined;
  const date = d instanceof Date ? d : new Date(String(d));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
};

@Injectable()
export class ContractRenderService {
  constructor(
    @InjectRepository(ClientRecord) private readonly records: Repository<ClientRecord>,
    @InjectRepository(CustomField) private readonly customFields: Repository<CustomField>,
  ) {}

  /** Contacto del tenant (nunca uno de otra cuenta). */
  loadContact(tenantId: string, recordId: string): Promise<ClientRecord | null> {
    return this.records.findOne({ where: { id: recordId, tenantId, deletedAt: IsNull() } });
  }

  /** Campos personalizados del CRM de la cuenta (para ofrecerlos como variables). */
  async loadCustomFields(tenantId: string): Promise<CustomFieldInfo[]> {
    const rows = await this.customFields.find({ where: { tenantId }, order: { sortOrder: 'ASC' } });
    return rows.map((r) => ({ fieldKey: r.fieldKey, fieldLabel: r.fieldLabel, isSystem: r.isSystem }));
  }

  /** Datos de ejemplo para previsualizar una plantilla sin un encuestador real. */
  sampleContact(language: Language): Partial<ClientRecord> {
    return language === 'es'
      ? { fullName: 'Nombre Apellido (ejemplo)', documentType: 'CC', documentNumber: '1.000.000.000', address: 'Calle 1 # 2-3', city: 'Ciudad', email: 'ejemplo@correo.com', phone: '+57 300 000 0000', birthDate: new Date('1990-01-01') as any }
      : { fullName: 'First Last (sample)', documentType: 'ID', documentNumber: '000-00-0000', address: '1 Main St', city: 'City', email: 'sample@mail.com', phone: '+1 555 000 0000', birthDate: new Date('1990-01-01') as any };
  }

  /**
   * Redacta el contrato: sustituye las variables y evalúa los condicionales. No
   * lanza por datos faltantes: los devuelve en `missing` para que el llamador
   * decida (vista previa vs. emisión).
   */
  render(
    template: TemplateContent,
    contact: Partial<ClientRecord>,
    values: VariableValues,
    facts: ContractFacts,
    customFields: CustomFieldInfo[],
  ): RenderOutput {
    const language = (template.languageCode === 'en' ? 'en' : 'es') as Language;
    const contacto = buildContactContext(contact, values.contacto);

    const ctx = {
      contacto,
      contrato: {
        numero: facts.number,
        fecha_emision: facts.issueDate,
        fecha_inicio: facts.startDate,
        fecha_fin: facts.endDate ?? undefined,
        tarifa: facts.rate,
        moneda: facts.currency,
        pais: regionName(template.countryCode, language),
      },
      datos: values.datos,
    };

    const rendered = renderTemplate(template.body, ctx, { language, currency: facts.currency });
    const labels: Record<string, string> = {};
    for (const f of customFields) labels[f.fieldKey] = f.fieldLabel;
    const missing = rendered.missing.sort().map((p) => describeMissing(p, labels));

    const blockers: string[] = [];
    if (contacto.fecha_nacimiento) {
      const birth = new Date(`${contacto.fecha_nacimiento}T00:00:00Z`);
      const ref = new Date(`${facts.issueDate}T00:00:00Z`);
      let age = ref.getUTCFullYear() - birth.getUTCFullYear();
      if (ref.getUTCMonth() < birth.getUTCMonth() || (ref.getUTCMonth() === birth.getUTCMonth() && ref.getUTCDate() < birth.getUTCDate())) age--;
      if (age < MINIMUM_AGE) blockers.push(`El contacto no cumple la edad mínima para contratar (${MINIMUM_AGE} años).`);
    }

    return {
      text: rendered.text.trim(),
      missing,
      blockers,
      parties: {
        contractor: {
          fullName: contacto.nombre_completo,
          documentType: contacto.tipo_documento,
          documentNumber: contacto.numero_documento,
          birthDate: isoDate(contacto.fecha_nacimiento),
        },
      },
    };
  }

  /**
   * Huella SHA-256 del documento. Se calcula sobre una estructura de orden fijo,
   * así que dos redacciones idénticas dan siempre la misma huella.
   */
  hash(input: {
    templateId: string | null;
    templateVersion: number | null;
    languageCode: string | null;
    contractType: string | null;
    facts: ContractFacts;
    clauses: Array<{ key: string; title: string; body: string }>;
    parties: { companyName?: string; companyTaxId?: string; contractorName?: string; contractorDocument?: string };
  }): string {
    const canonical = JSON.stringify({
      v: 1,
      templateId: input.templateId,
      templateVersion: input.templateVersion,
      languageCode: input.languageCode,
      contractType: input.contractType,
      number: input.facts.number,
      issueDate: input.facts.issueDate,
      startDate: input.facts.startDate,
      endDate: input.facts.endDate,
      rate: input.facts.rate,
      currency: input.facts.currency,
      parties: [
        input.parties.companyName ?? '',
        input.parties.companyTaxId ?? '',
        input.parties.contractorName ?? '',
        input.parties.contractorDocument ?? '',
      ],
      clauses: input.clauses.map((c) => [c.key, c.title, c.body]),
    });
    return createHash('sha256').update(canonical, 'utf8').digest('hex');
  }
}
