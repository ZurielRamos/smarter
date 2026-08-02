import { PhoneValidator } from './phone.validator';
import { EmailValidator } from './email.validator';
import { ValidationRule } from '../entities/import-job.entity';

export interface ValidationResult {
  valid: boolean;
  errors: FieldValidationError[];
  warnings: FieldValidationError[];
}

export interface FieldValidationError {
  rowNumber: number;
  field: string;
  message: string;
  originalValue: string | null;
  suggestedValue: string | null;
  severity: 'error' | 'warning';
}

/**
 * Validador de campos que aplica reglas de validación a registros mapeados.
 */
export class FieldValidator {
  /**
   * Valida un lote de registros contra las reglas proporcionadas.
   */
  static validateBatch(
    records: Record<string, unknown>[],
    rules: ValidationRule[],
    startRowOffset = 0,
  ): ValidationResult {
    const errors: FieldValidationError[] = [];
    const warnings: FieldValidationError[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const rowNumber = i + startRowOffset + 1; // 1-indexed for user display

      for (const rule of rules) {
        const value = record[rule.field];
        const strValue = value != null ? String(value) : '';
        const result = this.validateField(strValue, rule, rowNumber);

        if (result) {
          if (result.severity === 'error') {
            errors.push(result);
          } else {
            warnings.push(result);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private static validateField(
    value: string,
    rule: ValidationRule,
    rowNumber: number,
  ): FieldValidationError | null {
    const { field, type, value: ruleValue, message } = rule;

    switch (type) {
      case 'required': {
        if (!value || value.trim() === '') {
          return {
            rowNumber,
            field,
            message: message || `El campo "${field}" es requerido`,
            originalValue: value || null,
            suggestedValue: null,
            severity: 'error',
          };
        }
        return null;
      }

      case 'email': {
        if (!value || value.trim() === '') return null; // Skip empty (use 'required' for that)
        if (!EmailValidator.isValid(value)) {
          const suggestion = EmailValidator.suggestCorrection(value);
          return {
            rowNumber,
            field,
            message: message || EmailValidator.getErrorMessage(value),
            originalValue: value,
            suggestedValue: suggestion,
            severity: 'error',
          };
        }
        return null;
      }

      case 'phone': {
        if (!value || value.trim() === '') return null;
        const country = ruleValue || 'AUTO';
        if (!PhoneValidator.isValid(value, country)) {
          const normalized = PhoneValidator.normalize(value, country);
          return {
            rowNumber,
            field,
            message: message || PhoneValidator.getErrorMessage(value, country),
            originalValue: value,
            suggestedValue: normalized,
            severity: 'error',
          };
        }
        return null;
      }

      case 'regex': {
        if (!value || value.trim() === '') return null;
        if (!ruleValue) return null;
        try {
          const regex = new RegExp(ruleValue);
          if (!regex.test(value)) {
            return {
              rowNumber,
              field,
              message: message || `El campo "${field}" no cumple el patrón esperado`,
              originalValue: value,
              suggestedValue: null,
              severity: 'error',
            };
          }
        } catch {
          // Invalid regex, skip
        }
        return null;
      }

      case 'min_length': {
        if (!value || value.trim() === '') return null;
        const min = parseInt(ruleValue || '0', 10);
        if (value.length < min) {
          return {
            rowNumber,
            field,
            message: message || `El campo "${field}" debe tener al menos ${min} caracteres`,
            originalValue: value,
            suggestedValue: null,
            severity: 'error',
          };
        }
        return null;
      }

      case 'max_length': {
        if (!value || value.trim() === '') return null;
        const max = parseInt(ruleValue || '255', 10);
        if (value.length > max) {
          return {
            rowNumber,
            field,
            message: message || `El campo "${field}" excede los ${max} caracteres permitidos`,
            originalValue: value,
            suggestedValue: value.slice(0, max),
            severity: 'warning',
          };
        }
        return null;
      }

      case 'in_list': {
        if (!value || value.trim() === '') return null;
        if (!ruleValue) return null;
        const allowedValues = ruleValue.split(',').map((v) => v.trim().toLowerCase());
        if (!allowedValues.includes(value.toLowerCase())) {
          return {
            rowNumber,
            field,
            message: message || `El valor "${value}" no está en la lista permitida: ${ruleValue}`,
            originalValue: value,
            suggestedValue: null,
            severity: 'error',
          };
        }
        return null;
      }

      case 'unique': {
        // Unique validation is handled at batch level in the deduplicate processor
        return null;
      }

      default:
        return null;
    }
  }
}
