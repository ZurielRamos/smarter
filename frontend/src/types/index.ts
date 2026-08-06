export type FieldType = 'text' | 'number' | 'date' | 'currency' | 'percentage' | 'boolean' | 'list';

export interface TargetField {
  field: string;
  label: string;
  required: boolean;
  type: FieldType;
  allowMultiple: boolean;
  category: string;
}

export interface ParseResult {
  headers: string[];
  preview: Record<string, string>[];
  totalRows: number;
  fileId: string;
}

export interface MappingConfig {
  [targetField: string]: string[];
}

export type TransformType =
  | 'none'
  | 'concat'
  | 'uppercase'
  | 'lowercase'
  | 'trim'
  | 'extract'
  | 'replace'
  | 'date_format'
  | 'math'
  | 'fixed'
  | 'template';

export interface TransformConfig {
  type: TransformType;
  separator?: string;        // for concat
  start?: number;            // for extract
  end?: number;              // for extract
  from?: string;             // for replace
  to?: string;               // for replace
  fromFormat?: string;       // for date_format
  toFormat?: string;         // for date_format
  operator?: string;         // for math: +, -, *, /
  operand?: number;          // for math
  fixedValue?: string;       // for fixed
  template?: string;         // for template: "{{Nombre}} {{Apellido}}"
}

export interface TransformsConfig {
  [targetField: string]: TransformConfig;
}

export interface MappingResult {
  saved: number;
  batchId?: string;
}

// === ETL Types ===

export type ImportJobStatus =
  | 'pending'
  | 'parsing'
  | 'awaiting_mapping'
  | 'validating'
  | 'transforming'
  | 'deduplicating'
  | 'loading'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'completed_with_errors';

export type DeduplicateStrategy = 'keep_existing' | 'overwrite' | 'merge_non_empty' | 'append_tags' | 'overwrite_selected';

export interface ValidationRule {
  field: string;
  type: 'required' | 'regex' | 'email' | 'phone' | 'min_length' | 'max_length' | 'in_list' | 'unique';
  value?: string;
  message?: string;
}

export interface ImportJob {
  id: string;
  tenantId: string;
  status: ImportJobStatus;
  currentPhase: string | null;
  progress: number;
  fileName: string;
  fileSize: number;
  fileType: string;
  fileId: string | null;
  parsedHeaders: string[] | null;
  parsedPreview: Record<string, string>[] | null;
  mapping: Record<string, string[]> | null;
  transforms: Record<string, any> | null;
  deduplicateConfig: {
    matchFields: string[];
    strategy: DeduplicateStrategy;
    fuzzyMatch?: boolean;
    fuzzyThreshold?: number;
  } | null;
  validationRules: ValidationRule[] | null;
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRows: number;
  createdRecords: number;
  updatedRecords: number;
  skippedRecords: number;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportError {
  id: string;
  jobId: string;
  rowNumber: number;
  field: string | null;
  severity: 'error' | 'warning' | 'info';
  phase: 'validation' | 'transform' | 'deduplicate' | 'load';
  message: string;
  originalValue: string | null;
  suggestedValue: string | null;
  rowData: Record<string, any> | null;
  createdAt: string;
}

export interface ValidationPreviewResult {
  totalRows: number;
  sampleSize: number;
  totalProcessed: number;
  valid: number;
  invalid: number;
  warnings: number;
  errors: {
    rowNumber: number;
    field: string;
    message: string;
    originalValue: string | null;
    suggestedValue: string | null;
    severity: 'error' | 'warning';
  }[];
  validationRules: ValidationRule[];
}

export interface DeduplicatePreviewDuplicate {
  rowNumber: number;
  matchedOn: string[];
  confidence: number;
  incoming: Record<string, unknown>;
  existing: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    email: string | null;
  };
}

export interface DeduplicatePreviewResult {
  totalSample: number;
  totalRows: number;
  total: number;
  new: number;
  duplicatesCount: number;
  isEstimate: boolean;
  sampleDupRate: number;
  duplicates: DeduplicatePreviewDuplicate[];
}
