import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { RecordsService } from '../records/records.service';
import { MappingTemplate } from './mapping-template.entity';

export type FieldType = 'text' | 'number' | 'date' | 'currency' | 'percentage' | 'boolean' | 'list';

export interface TargetFieldDefinition {
  field: string;
  label: string;
  required: boolean;
  type: FieldType;
  allowMultiple: boolean;
  category: string;
}

export interface ParsedFileResult {
  headers: string[];
  preview: Record<string, string>[];
  totalRows: number;
  fileId: string;
}

export interface MappingConfig {
  [targetField: string]: string[] | string | null;
}

@Injectable()
export class UploadService {
  private parsedFiles = new Map<string, Record<string, string>[]>();

  constructor(
    private readonly recordsService: RecordsService,
    @InjectRepository(MappingTemplate)
    private readonly templateRepository: Repository<MappingTemplate>,
  ) {}

  getTargetFields(): TargetFieldDefinition[] {
    return [
      // Identificador
      { field: 'id', label: 'ID del cliente', required: false, type: 'text', allowMultiple: false, category: 'Identificación' },

      // Datos básicos
      { field: 'firstName', label: 'Nombre', required: false, type: 'text', allowMultiple: false, category: 'Identificación' },
      { field: 'lastName', label: 'Apellido', required: false, type: 'text', allowMultiple: false, category: 'Identificación' },
      { field: 'phone', label: 'Teléfono', required: false, type: 'text', allowMultiple: false, category: 'Identificación' },
      { field: 'email', label: 'Email', required: false, type: 'text', allowMultiple: false, category: 'Identificación' },

      // Estado y canal
      { field: 'status', label: 'Estado', required: false, type: 'list', allowMultiple: false, category: 'Segmentación' },
      { field: 'channelSource', label: 'Canal de origen', required: false, type: 'list', allowMultiple: false, category: 'Segmentación' },

      // Actividad
      { field: 'lastContactAt', label: 'Último contacto', required: false, type: 'date', allowMultiple: false, category: 'Temporalidad' },
    ];
  }

  parseFile(file: Express.Multer.File): ParsedFileResult {
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    let data: Record<string, string>[];

    if (ext === 'csv') {
      data = this.parseCsv(file.buffer);
    } else if (ext === 'xlsx' || ext === 'xls') {
      data = this.parseExcel(file.buffer);
    } else {
      throw new BadRequestException(
        'Formato no soportado. Use CSV o Excel (.xlsx/.xls)',
      );
    }

    if (data.length === 0) {
      throw new BadRequestException('El archivo está vacío');
    }

    const fileId = uuidv4();
    this.parsedFiles.set(fileId, data);

    setTimeout(() => this.parsedFiles.delete(fileId), 3600000);

    const headers = Object.keys(data[0]);
    const preview = data.slice(0, 10);

    return { headers, preview, totalRows: data.length, fileId };
  }

  async applyMapping(
    fileId: string,
    mapping: MappingConfig,
    tenantId?: string,
    matchField?: string,
    transforms?: Record<string, any>,
  ): Promise<{ saved: number }> {
    const data = this.parsedFiles.get(fileId);
    if (!data) {
      throw new BadRequestException(
        'Archivo no encontrado. Puede haber expirado. Suba el archivo nuevamente.',
      );
    }

    const targetFieldDefs = this.getTargetFields();
    const fieldTypeMap = new Map(targetFieldDefs.map((f) => [f.field, f.type]));

    const mappedRecords = data.map((row) => {
      const record: Record<string, unknown> = {};
      for (const [targetField, sourceFields] of Object.entries(mapping)) {
        const transform = transforms?.[targetField];

        // Handle fixed value transform (no source fields needed)
        if (transform?.type === 'fixed') {
          const fieldType = fieldTypeMap.get(targetField) || 'text';
          record[targetField] = this.castValue(transform.fixedValue || '', fieldType);
          continue;
        }

        // Handle template transform (uses row directly)
        if (transform?.type === 'template' && transform.template) {
          let result = transform.template;
          for (const [key, val] of Object.entries(row)) {
            result = result.replaceAll(`{{${key}}}`, val || '');
          }
          const fieldType = fieldTypeMap.get(targetField) || 'text';
          record[targetField] = this.castValue(result, fieldType);
          continue;
        }

        if (!sourceFields) continue;

        const fields = Array.isArray(sourceFields) ? sourceFields : [sourceFields];
        const values = fields
          .map((f) => row[f] ?? '')
          .filter((v) => v !== '');

        if (values.length === 0) continue;

        // Use concat separator if transform is concat, otherwise join with space
        const separator = (transform?.type === 'concat' && transform.separator != null)
          ? transform.separator
          : ' ';
        const rawValue = values.join(separator);
        const fieldType = fieldTypeMap.get(targetField) || 'text';

        let finalValue = rawValue;
        // Apply transform if configured (skip concat since separator already applied)
        if (transform && transform.type && transform.type !== 'none' && transform.type !== 'concat') {
          finalValue = this.applyTransform(finalValue, transform, row);
        }

        record[targetField] = this.castValue(finalValue, fieldType);
      }
      return record;
    });

    const result = await this.recordsService.saveRecords(mappedRecords, tenantId, matchField);
    this.parsedFiles.delete(fileId);

    return { saved: result.saved };
  }

  private castValue(value: string, type: FieldType): unknown {
    switch (type) {
      case 'number': {
        const cleaned = value.replace(/[^0-9,.\-]/g, '').replace(',', '.');
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
      }
      case 'currency': {
        const cleaned = value.replace(/[^0-9,.\-]/g, '').replace(',', '.');
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
      }
      case 'percentage': {
        const match = value.match(/[\d.,]+/);
        if (!match) return null;
        const num = parseFloat(match[0].replace(',', '.'));
        return isNaN(num) ? null : num;
      }
      case 'boolean': {
        const lower = value.toLowerCase().trim();
        if (['true', '1', 'si', 'sí', 'yes', 'verdadero'].includes(lower)) return true;
        if (['false', '0', 'no', 'falso'].includes(lower)) return false;
        return null;
      }
      case 'date': {
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date;
      }
      case 'list':
      case 'text':
      default:
        return value;
    }
  }

  private applyTransform(value: string, transform: Record<string, any>, row: Record<string, string>): string {
    switch (transform.type) {
      case 'uppercase':
        return value.toUpperCase();
      case 'lowercase':
        return value.toLowerCase();
      case 'trim':
        return value.trim();
      case 'extract': {
        const start = transform.start ?? 0;
        const end = transform.end ?? value.length;
        return value.slice(start, end);
      }
      case 'replace':
        return value.replaceAll(transform.from || '', transform.to || '');
      case 'math': {
        const num = parseFloat(value);
        if (isNaN(num)) return value;
        const operand = transform.operand ?? 0;
        switch (transform.operator) {
          case '+': return String(num + operand);
          case '-': return String(num - operand);
          case '*': return String(num * operand);
          case '/': return operand !== 0 ? String(num / operand) : value;
          default: return value;
        }
      }
      case 'fixed':
        return transform.fixedValue || '';
      case 'template': {
        let result = transform.template || '';
        for (const [key, val] of Object.entries(row)) {
          result = result.replaceAll(`{{${key}}}`, val || '');
        }
        return result;
      }
      case 'date_format':
        // Basic date format conversion - attempt to parse and reformat
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0]; // Default to YYYY-MM-DD
          }
        } catch {}
        return value;
      default:
        return value;
    }
  }

  private parseCsv(buffer: Buffer): Record<string, string>[] {
    const content = buffer.toString('utf-8');
    return parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  }

  private parseExcel(buffer: Buffer): Record<string, string>[] {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
      defval: '',
      raw: true,
      dateNF: 'yyyy-mm-dd',
    });
    // Convert all values to strings, avoiding scientific notation for numbers
    return raw.map((row) => {
      const result: Record<string, string> = {};
      for (const [key, val] of Object.entries(row)) {
        if (val === null || val === undefined) {
          result[key] = '';
        } else if (typeof val === 'number') {
          // Avoid scientific notation — use full number string
          result[key] = Number.isInteger(val) ? val.toString() : val.toFixed(10).replace(/\.?0+$/, '');
        } else if (val instanceof Date) {
          result[key] = val.toISOString().split('T')[0];
        } else {
          result[key] = String(val);
        }
      }
      return result;
    });
  }

  // === Mapping Templates ===

  private generateStructureHash(headers: string[]): string {
    const sorted = [...headers].sort().join('|');
    // Simple hash: use a basic string hash
    let hash = 0;
    for (let i = 0; i < sorted.length; i++) {
      const char = sorted.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  async getTemplates(tenantId?: string, structureHash?: string): Promise<MappingTemplate[]> {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (structureHash) where.structureHash = structureHash;

    return this.templateRepository.find({
      where,
      order: { isDefault: 'DESC', updatedAt: 'DESC' },
    });
  }

  async getTemplateByStructure(tenantId: string, headers: string[]): Promise<MappingTemplate | null> {
    const structureHash = this.generateStructureHash(headers);
    return this.templateRepository.findOne({
      where: { tenantId, structureHash },
      order: { updatedAt: 'DESC' },
    });
  }

  async saveTemplate(
    name: string,
    mapping: Record<string, string[]> | MappingConfig,
    tenantId?: string,
    headers?: string[],
    transforms?: Record<string, any>,
  ): Promise<MappingTemplate> {
    // Normalizar: asegurarse de que sea Record<string, string[]>
    const normalizedMapping: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(mapping)) {
      if (!value) continue;
      normalizedMapping[key] = Array.isArray(value) ? value : [value];
    }

    const structureHash = headers ? this.generateStructureHash(headers) : null;

    // Si ya existe un template con ese hash de estructura para el mismo tenant, actualizarlo
    if (structureHash && tenantId) {
      const existing = await this.templateRepository.findOne({
        where: { tenantId, structureHash },
      });
      if (existing) {
        existing.mapping = normalizedMapping;
        existing.name = name;
        existing.structureHeaders = headers || null as any;
        existing.transforms = transforms || null;
        return this.templateRepository.save(existing);
      }
    }

    const template = this.templateRepository.create({
      name,
      mapping: normalizedMapping,
      tenantId: tenantId || undefined,
      structureHash: structureHash || undefined,
      structureHeaders: headers || undefined,
      transforms: transforms || undefined,
    });
    return this.templateRepository.save(template as MappingTemplate);
  }

  async setDefaultTemplate(id: string, tenantId?: string): Promise<MappingTemplate> {
    // Quitar default de todos los del mismo tenant
    if (tenantId) {
      await this.templateRepository.update({ tenantId }, { isDefault: false });
    } else {
      await this.templateRepository.update({}, { isDefault: false });
    }
    // Asignar default al seleccionado
    await this.templateRepository.update(id, { isDefault: true });
    return this.templateRepository.findOneByOrFail({ id });
  }

  async deleteTemplate(id: string): Promise<{ deleted: boolean }> {
    await this.templateRepository.delete(id);
    return { deleted: true };
  }
}
