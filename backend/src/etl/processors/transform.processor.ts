import { Injectable } from '@nestjs/common';
import { PhoneValidator } from '../validators/phone.validator';
import { EmailValidator } from '../validators/email.validator';

export type FieldType = 'text' | 'number' | 'date' | 'currency' | 'percentage' | 'boolean' | 'list';

export interface TargetFieldDefinition {
  field: string;
  label: string;
  required: boolean;
  type: FieldType;
  allowMultiple: boolean;
  category: string;
}

@Injectable()
export class TransformProcessor {
  private readonly targetFields: TargetFieldDefinition[] = [
    // Identificación
    { field: 'id', label: 'ID del cliente', required: false, type: 'text', allowMultiple: false, category: 'Identificación' },
    { field: 'firstName', label: 'Nombre', required: false, type: 'text', allowMultiple: false, category: 'Identificación' },
    { field: 'lastName', label: 'Apellido', required: false, type: 'text', allowMultiple: false, category: 'Identificación' },
    { field: 'fullName', label: 'Nombre completo', required: false, type: 'text', allowMultiple: true, category: 'Identificación' },
    { field: 'documentType', label: 'Tipo de documento', required: false, type: 'list', allowMultiple: false, category: 'Identificación' },
    { field: 'documentNumber', label: 'Número de documento', required: false, type: 'text', allowMultiple: false, category: 'Identificación' },
    { field: 'phone', label: 'Teléfono', required: false, type: 'text', allowMultiple: false, category: 'Contacto' },
    { field: 'countryCode', label: 'Código de país', required: false, type: 'text', allowMultiple: false, category: 'Contacto' },
    { field: 'email', label: 'Email', required: false, type: 'text', allowMultiple: false, category: 'Contacto' },
    { field: 'gender', label: 'Género', required: false, type: 'list', allowMultiple: false, category: 'Demografía' },
    { field: 'birthDate', label: 'Fecha de nacimiento', required: false, type: 'date', allowMultiple: false, category: 'Demografía' },

    // Ubicación
    { field: 'city', label: 'Ciudad', required: false, type: 'text', allowMultiple: false, category: 'Ubicación' },
    { field: 'region', label: 'Departamento / Estado', required: false, type: 'text', allowMultiple: false, category: 'Ubicación' },

    // Segmentación
    { field: 'status', label: 'Estado', required: false, type: 'list', allowMultiple: false, category: 'Segmentación' },
    { field: 'channelSource', label: 'Canal de origen', required: false, type: 'list', allowMultiple: false, category: 'Segmentación' },
    { field: 'source', label: 'Fuente de adquisición', required: false, type: 'text', allowMultiple: false, category: 'Segmentación' },
    { field: 'score', label: 'Score / Puntaje', required: false, type: 'number', allowMultiple: false, category: 'Segmentación' },

    // Consentimiento
    { field: 'optInWhatsapp', label: 'Opt-in WhatsApp', required: false, type: 'boolean', allowMultiple: false, category: 'Consentimiento' },
    { field: 'optInEmail', label: 'Opt-in Email', required: false, type: 'boolean', allowMultiple: false, category: 'Consentimiento' },

    // Actividad
    { field: 'lastContactAt', label: 'Último contacto', required: false, type: 'date', allowMultiple: false, category: 'Actividad' },
    { field: 'lastActivityAt', label: 'Última actividad', required: false, type: 'date', allowMultiple: false, category: 'Actividad' },
  ];

  getTargetFields(): TargetFieldDefinition[] {
    return this.targetFields;
  }

  /**
   * Aplica el mapeo y las transformaciones a un lote de filas.
   * Retorna los registros transformados listos para validación.
   */
  transformBatch(
    rows: Record<string, string>[],
    mapping: Record<string, string[]>,
    transforms?: Record<string, any>,
  ): Record<string, unknown>[] {
    const fieldTypeMap = new Map(this.targetFields.map((f) => [f.field, f.type]));

    return rows.map((row) => {
      const record: Record<string, unknown> = {};

      for (const [targetField, sourceFields] of Object.entries(mapping)) {
        const transform = transforms?.[targetField];

        // Fixed value transform
        if (transform?.type === 'fixed') {
          const fieldType = fieldTypeMap.get(targetField) || 'text';
          record[targetField] = this.castValue(transform.fixedValue || '', fieldType);
          continue;
        }

        // Template transform
        if (transform?.type === 'template' && transform.template) {
          let result = transform.template;
          for (const [key, val] of Object.entries(row)) {
            result = result.replaceAll(`{{${key}}}`, val || '');
          }
          const fieldType = fieldTypeMap.get(targetField) || 'text';
          record[targetField] = this.castValue(result, fieldType);
          continue;
        }

        if (!sourceFields || sourceFields.length === 0) continue;

        const fields = Array.isArray(sourceFields) ? sourceFields : [sourceFields];
        const values = fields.map((f) => row[f] ?? '').filter((v) => v !== '');

        if (values.length === 0) continue;

        // Join with separator
        const separator = (transform?.type === 'concat' && transform.separator != null)
          ? transform.separator
          : ' ';
        let rawValue = values.join(separator);

        // Apply transform
        if (transform && transform.type && transform.type !== 'none' && transform.type !== 'concat') {
          rawValue = this.applyTransform(rawValue, transform, row);
        }

        // Special normalization for phone and email
        if (targetField === 'phone') {
          rawValue = this.normalizePhone(rawValue);
        } else if (targetField === 'email') {
          rawValue = EmailValidator.normalize(rawValue);
        }

        const fieldType = fieldTypeMap.get(targetField) || 'text';
        record[targetField] = this.castValue(rawValue, fieldType);
      }

      return record;
    });
  }

  private normalizePhone(value: string): string {
    // Remove common formatting, keep only digits
    return value.replace(/[\s\-\(\)\.+]/g, '');
  }

  private applyTransform(value: string, transform: Record<string, any>, row: Record<string, string>): string {
    switch (transform.type) {
      case 'uppercase':
        return value.toUpperCase();
      case 'lowercase':
        return value.toLowerCase();
      case 'trim':
        return value.trim();
      case 'capitalize':
        return value.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      case 'extract': {
        const start = transform.start ?? 0;
        const end = transform.end ?? value.length;
        return value.slice(start, end);
      }
      case 'replace':
        return value.replaceAll(transform.from || '', transform.to || '');
      case 'split_first': {
        const sep = transform.separator || ' ';
        return value.split(sep)[0] || value;
      }
      case 'split_last': {
        const sep = transform.separator || ' ';
        const parts = value.split(sep);
        return parts[parts.length - 1] || value;
      }
      case 'split_rest': {
        const sep = transform.separator || ' ';
        const parts = value.split(sep);
        return parts.slice(1).join(sep) || '';
      }
      case 'prefix':
        return `${transform.prefix || ''}${value}`;
      case 'suffix':
        return `${value}${transform.suffix || ''}`;
      case 'phone_normalize':
        return PhoneValidator.normalize(value, transform.country || 'CO') || value;
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
      case 'date_format':
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
          }
        } catch { /* noop */ }
        return value;
      case 'template': {
        let result = transform.template || '';
        for (const [key, val] of Object.entries(row)) {
          result = result.replaceAll(`{{${key}}}`, val || '');
        }
        return result;
      }
      default:
        return value;
    }
  }

  private castValue(value: string, type: FieldType): unknown {
    switch (type) {
      case 'number':
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
        return value.trim();
    }
  }
}
