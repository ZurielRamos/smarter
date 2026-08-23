import { Injectable } from '@nestjs/common';
import { FieldValidator, FieldValidationError } from '../validators/field.validator';
import { ValidationRule } from '../entities/import-job.entity';

export interface ValidationBatchResult {
  validRecords: Record<string, unknown>[];
  invalidRecords: { record: Record<string, unknown>; rowNumber: number }[];
  errors: FieldValidationError[];
  warnings: FieldValidationError[];
  summary: {
    totalProcessed: number;
    valid: number;
    invalid: number;
    warnings: number;
  };
}

@Injectable()
export class ValidateProcessor {
  /**
   * Valida un lote de registros transformados.
   * Retorna los registros válidos separados de los inválidos.
   */
  validateBatch(
    records: Record<string, unknown>[],
    rules: ValidationRule[],
    startRowOffset = 0,
  ): ValidationBatchResult {
    if (!rules || rules.length === 0) {
      // Sin reglas, todos son válidos
      return {
        validRecords: records,
        invalidRecords: [],
        errors: [],
        warnings: [],
        summary: {
          totalProcessed: records.length,
          valid: records.length,
          invalid: 0,
          warnings: 0,
        },
      };
    }

    const result = FieldValidator.validateBatch(records, rules, startRowOffset);

    // Identify rows with errors
    const errorRowNumbers = new Set(result.errors.map((e) => e.rowNumber));

    const validRecords: Record<string, unknown>[] = [];
    const invalidRecords: { record: Record<string, unknown>; rowNumber: number }[] = [];

    for (let i = 0; i < records.length; i++) {
      const rowNumber = i + startRowOffset + 1;
      if (errorRowNumbers.has(rowNumber)) {
        invalidRecords.push({ record: records[i], rowNumber });
      } else {
        validRecords.push(records[i]);
      }
    }

    return {
      validRecords,
      invalidRecords,
      errors: result.errors,
      warnings: result.warnings,
      summary: {
        totalProcessed: records.length,
        valid: validRecords.length,
        invalid: invalidRecords.length,
        warnings: result.warnings.length,
      },
    };
  }

  /**
   * Genera reglas de validación automáticas basadas en los campos mapeados.
   * Útil cuando el usuario no configura reglas manualmente.
   */
  generateDefaultRules(mappedFields: string[]): ValidationRule[] {
    const rules: ValidationRule[] = [];

    if (mappedFields.includes('email')) {
      rules.push({ field: 'email', type: 'email', message: 'Email inválido' });
    }

    if (mappedFields.includes('phone')) {
      rules.push({ field: 'phone', type: 'phone', value: 'AUTO', message: 'Teléfono inválido' });
    }

    // At least one identifier should be present
    const hasPhone = mappedFields.includes('phone');
    const hasEmail = mappedFields.includes('email');
    if (hasPhone && !hasEmail) {
      rules.push({ field: 'phone', type: 'required', message: 'Se requiere al menos un teléfono o email' });
    } else if (hasEmail && !hasPhone) {
      rules.push({ field: 'email', type: 'required', message: 'Se requiere al menos un teléfono o email' });
    }
    // If both are mapped, neither is strictly required (one or the other suffices)

    return rules;
  }
}
