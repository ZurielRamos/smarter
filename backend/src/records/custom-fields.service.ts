import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomField } from './custom-field.entity';
import { ClientRecord } from './record.entity';

@Injectable()
export class CustomFieldsService {
  constructor(
    @InjectRepository(CustomField)
    private readonly customFieldRepo: Repository<CustomField>,
    @InjectRepository(ClientRecord)
    private readonly recordRepo: Repository<ClientRecord>,
  ) {}

  async findAllByTenant(tenantId: string): Promise<CustomField[]> {
    return this.customFieldRepo.find({
      where: { tenantId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async create(data: Partial<CustomField>): Promise<CustomField> {
    const field = this.customFieldRepo.create(data);
    return this.customFieldRepo.save(field);
  }

  async update(id: string, data: Partial<CustomField>): Promise<CustomField> {
    const field = await this.customFieldRepo.findOne({ where: { id } });
    if (!field) {
      throw new NotFoundException(`CustomField with id ${id} not found`);
    }
    Object.assign(field, data);
    return this.customFieldRepo.save(field);
  }

  async remove(id: string): Promise<void> {
    const field = await this.customFieldRepo.findOne({ where: { id } });
    if (!field) {
      throw new NotFoundException(`CustomField with id ${id} not found`);
    }
    await this.customFieldRepo.remove(field);
  }

  // === Generate computed field values ===

  async generateValues(fieldId: string): Promise<{ updated: number }> {
    const field = await this.customFieldRepo.findOne({ where: { id: fieldId } });
    if (!field) throw new NotFoundException(`Field ${fieldId} not found`);
    if (field.fieldType !== 'computed') throw new NotFoundException(`Field ${fieldId} is not a computed field`);

    const config = field.validations?.['computed'] as {
      operation: string;
      fields: string[];
      separator?: string;
      template?: string;
      condition?: { operator: string; value: string; thenValue: string; elseValue: string };
    } | undefined;

    if (!config || !config.operation) {
      throw new NotFoundException(`El campo no tiene una fórmula configurada. Edita el campo y configura la operación antes de generar valores.`);
    }

    // Load all records for the tenant
    const records = await this.recordRepo.find({ where: { tenantId: field.tenantId } });
    let updated = 0;
    const chunkSize = 500;

    // System field map for reading values from records
    const SYSTEM_FIELDS = new Set(['firstName', 'lastName', 'phone', 'email', 'status', 'channelSource', 'lastContactAt', 'tags']);

    const getFieldValue = (record: ClientRecord, fieldKey: string): any => {
      if (SYSTEM_FIELDS.has(fieldKey)) return (record as any)[fieldKey];
      return record.customData?.[fieldKey] ?? null;
    };

    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      const toSave: ClientRecord[] = [];

      for (const record of chunk) {
        const computedValue = this.computeValue(record, config, getFieldValue);
        const currentCustomData = record.customData || {};
        if (currentCustomData[field.fieldKey] !== computedValue) {
          record.customData = { ...currentCustomData, [field.fieldKey]: computedValue };
          toSave.push(record);
        }
      }

      if (toSave.length > 0) {
        await this.recordRepo.save(toSave);
        updated += toSave.length;
      }
    }

    return { updated };
  }

  private computeValue(
    record: ClientRecord,
    config: { operation: string; fields: string[]; separator?: string; template?: string; condition?: { operator: string; value: string; thenValue: string; elseValue: string } },
    getFieldValue: (record: ClientRecord, fieldKey: string) => any,
  ): any {
    const { operation, fields, separator, template, condition } = config;
    const values = fields.map((f) => getFieldValue(record, f));

    switch (operation) {
      case 'concat':
        return values.filter((v) => v != null && v !== '').join(separator || ' ');

      case 'uppercase':
        return values[0] != null ? String(values[0]).toUpperCase() : null;

      case 'lowercase':
        return values[0] != null ? String(values[0]).toLowerCase() : null;

      case 'first_word': {
        if (values[0] == null) return null;
        const words = String(values[0]).trim().split(/\s+/);
        return words[0] || null;
      }

      case 'template': {
        if (!template) return null;
        let result = template;
        // Replace {{fieldKey}} with actual values
        result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
          const val = getFieldValue(record, key);
          return val != null ? String(val) : '';
        });
        return result;
      }

      case 'sum':
        return values.reduce((acc, v) => acc + (parseFloat(v) || 0), 0);

      case 'subtract':
        return (parseFloat(values[0]) || 0) - (parseFloat(values[1]) || 0);

      case 'multiply':
        return values.reduce((acc, v) => acc * (parseFloat(v) || 0), 1);

      case 'divide': {
        const divisor = parseFloat(values[1]) || 0;
        return divisor !== 0 ? (parseFloat(values[0]) || 0) / divisor : null;
      }

      case 'percentage': {
        const divisor = parseFloat(values[1]) || 0;
        return divisor !== 0 ? ((parseFloat(values[0]) || 0) / divisor) * 100 : null;
      }

      case 'if_then': {
        if (!condition) return null;
        const fieldVal = String(values[0] ?? '');
        let passes = false;
        switch (condition.operator) {
          case 'equals': passes = fieldVal === condition.value; break;
          case 'not_equals': passes = fieldVal !== condition.value; break;
          case 'contains': passes = fieldVal.includes(condition.value); break;
          case 'starts_with': passes = fieldVal.startsWith(condition.value); break;
          case 'ends_with': passes = fieldVal.endsWith(condition.value); break;
          case 'is_empty': passes = !fieldVal || fieldVal.trim() === ''; break;
          case 'is_not_empty': passes = !!fieldVal && fieldVal.trim() !== ''; break;
          case 'greater_than': passes = parseFloat(fieldVal) > parseFloat(condition.value); break;
          case 'less_than': passes = parseFloat(fieldVal) < parseFloat(condition.value); break;
        }
        return passes ? condition.thenValue : condition.elseValue;
      }

      case 'coalesce':
        return values.find((v) => v != null && v !== '') ?? null;

      case 'days_diff': {
        const d1 = new Date(values[0]);
        const d2 = new Date(values[1]);
        if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
        return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
      }

      case 'age': {
        const birthDate = new Date(values[0]);
        if (isNaN(birthDate.getTime())) return null;
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
        return age;
      }

      case 'count': {
        const val = values[0];
        if (Array.isArray(val)) return val.length;
        return 0;
      }

      default:
        return null;
    }
  }
}
