import axios from 'axios';
import type { TargetField, ParseResult, MappingConfig, MappingResult, ImportJob, ImportError, ValidationPreviewResult, DeduplicatePreviewResult, ValidationRule, DeduplicateStrategy } from '../types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

// Add auth token to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses - redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export { api };

export interface MappingTemplate {
  id: string;
  name: string;
  mapping: Record<string, string[]>;
  transforms: Record<string, any> | null;
  structureHash: string | null;
  structureHeaders: string[] | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

// === ETL Endpoints ===

export async function getTargetFields(): Promise<TargetField[]> {
  const { data } = await api.get<TargetField[]>('/etl/target-fields');
  return data;
}

export async function uploadFile(file: File): Promise<ParseResult> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<ParseResult>('/etl/parse', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function validatePreview(params: {
  fileId: string;
  tenantId: string;
  mapping: MappingConfig;
  transforms?: Record<string, any>;
  validationRules?: ValidationRule[];
  matchFields?: string[];
}): Promise<ValidationPreviewResult> {
  const { data } = await api.post<ValidationPreviewResult>('/etl/validate-preview', params);
  return data;
}

export async function deduplicatePreview(params: {
  fileId: string;
  tenantId: string;
  mapping: MappingConfig;
  transforms?: Record<string, any>;
  matchFields?: string[];
  fuzzyMatch?: boolean;
  fuzzyThreshold?: number;
}): Promise<DeduplicatePreviewResult> {
  const { data } = await api.post<DeduplicatePreviewResult>('/etl/deduplicate-preview', params);
  return data;
}

export async function executeImport(params: {
  tenantId: string;
  fileId: string;
  mapping: MappingConfig;
  transforms?: Record<string, any>;
  matchFields?: string[];
  deduplicateStrategy?: DeduplicateStrategy;
  overwriteFields?: string[];
  fuzzyMatch?: boolean;
  fuzzyThreshold?: number;
  validationRules?: ValidationRule[];
  templateName?: string;
  headers?: string[];
}): Promise<ImportJob> {
  const { data } = await api.post<ImportJob>('/etl/import', params);
  return data;
}

export async function getImportJob(jobId: string): Promise<ImportJob> {
  const { data } = await api.get<ImportJob>(`/etl/jobs/${jobId}`);
  return data;
}

export async function getImportJobErrors(jobId: string, page = 1, limit = 50): Promise<{ data: ImportError[]; total: number }> {
  const { data } = await api.get<{ data: ImportError[]; total: number }>(`/etl/jobs/${jobId}/errors`, { params: { page, limit } });
  return data;
}

export async function getImportHistory(tenantId: string, page = 1, limit = 20): Promise<{ data: ImportJob[]; total: number }> {
  const { data } = await api.get<{ data: ImportJob[]; total: number }>('/etl/jobs', { params: { tenantId, page, limit } });
  return data;
}

export async function cancelImportJob(jobId: string): Promise<ImportJob> {
  const { data } = await api.post<ImportJob>(`/etl/jobs/${jobId}/cancel`);
  return data;
}

/** @deprecated Use executeImport instead */
export async function applyMapping(
  fileId: string,
  mapping: MappingConfig,
  templateName?: string,
  matchField?: string,
  headers?: string[],
  tenantId?: string,
  transforms?: Record<string, any>,
): Promise<MappingResult> {
  const { data } = await api.post<MappingResult>('/upload/map', {
    fileId,
    mapping,
    templateName,
    matchField,
    headers,
    tenantId,
    transforms,
  });
  return data;
}

// === Templates ===

export async function getTemplates(tenantId?: string): Promise<MappingTemplate[]> {
  const { data } = await api.get<MappingTemplate[]>('/etl/templates', {
    params: tenantId ? { tenantId } : {},
  });
  return data;
}

export async function getTemplateByStructure(tenantId: string, headers: string[]): Promise<MappingTemplate | null> {
  const { data } = await api.post<MappingTemplate | null>('/etl/templates/by-structure', {
    tenantId,
    headers,
  });
  return data;
}

export async function saveTemplate(
  name: string,
  mapping: MappingConfig,
  tenantId?: string,
): Promise<MappingTemplate> {
  const { data } = await api.post<MappingTemplate>('/etl/templates', {
    name,
    mapping,
    tenantId,
  });
  return data;
}

export async function setDefaultTemplate(id: string): Promise<MappingTemplate> {
  const { data } = await api.put<MappingTemplate>(`/upload/templates/${id}/default`);
  return data;
}

export async function deleteTemplate(id: string): Promise<void> {
  await api.delete(`/etl/templates/${id}`);
}


// === Clients ===

export interface ClientRecord {
  id: string;
  tenantId: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  channelSource: string | null;
  lastContactAt: string | null;
  tags: string[] | null;
  customData: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientsResponse {
  data: ClientRecord[];
  total: number;
}

export async function getClients(tenantId: string, page = 1, limit = 50, sortBy?: string, sortOrder?: string): Promise<ClientsResponse> {
  const params: any = { page, limit, tenantId };
  if (sortBy) params.sortBy = sortBy;
  if (sortOrder) params.sortOrder = sortOrder;
  const { data } = await api.get<ClientsResponse>('/records', { params });
  return data;
}

export interface CreateClientPayload {
  tenantId: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  status?: string;
  channelSource?: string;
  tags?: string[];
  customData?: Record<string, any>;
}

export async function createClient(payload: CreateClientPayload): Promise<ClientRecord> {
  const { data } = await api.post<ClientRecord>('/records', payload);
  return data;
}

// === Custom Fields ===

export interface CustomField {
  id: string;
  tenantId: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: string;
  fieldGroup: string;
  options: string[] | null;
  isRequired: boolean;
  isSystem: boolean;
  isUnique: boolean;
  isNullable: boolean;
  defaultValue: string | null;
  validations: Record<string, any> | null;
  sortOrder: number;
  createdAt: string;
}

export async function getCustomFields(tenantId: string): Promise<CustomField[]> {
  const { data } = await api.get<CustomField[]>(`/custom-fields/${tenantId}`);
  return data;
}

export async function createCustomField(payload: {
  tenantId: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: string;
  options?: string[];
  isRequired?: boolean;
  isSystem?: boolean;
  sortOrder?: number;
  validations?: Record<string, any>;
}): Promise<CustomField> {
  const { data } = await api.post<CustomField>('/custom-fields', payload);
  return data;
}

export async function updateCustomField(
  id: string,
  payload: Partial<Pick<CustomField, 'fieldLabel' | 'fieldType' | 'options' | 'isRequired' | 'sortOrder'>>,
): Promise<CustomField> {
  const { data } = await api.put<CustomField>(`/custom-fields/${id}`, payload);
  return data;
}

export async function deleteCustomField(id: string): Promise<void> {
  await api.delete(`/custom-fields/${id}`);
}

export async function generateFieldValues(fieldId: string): Promise<{ updated: number }> {
  const { data } = await api.post<{ updated: number }>(`/custom-fields/${fieldId}/generate`);
  return data;
}

// === Record Lists ===

export interface RecordListItem {
  id: string;
  tenantId: string;
  name: string;
  type: 'static' | 'dynamic';
  filters: { logic: 'and' | 'or'; conditions: { field: string; operator: string; value: string }[] } | null;
  recordIds: string[] | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getRecordLists(tenantId: string): Promise<RecordListItem[]> {
  const { data } = await api.get<RecordListItem[]>('/record-lists', { params: { tenantId } });
  return data;
}

export async function createRecordList(payload: {
  tenantId: string;
  name: string;
  type: 'static' | 'dynamic';
  filters?: { logic: 'and' | 'or'; conditions: { field: string; operator: string; value: string }[] };
  color?: string;
}): Promise<RecordListItem> {
  const { data } = await api.post<RecordListItem>('/record-lists', payload);
  return data;
}

export async function getRecordListRecords(listId: string, page = 1, limit = 50): Promise<ClientsResponse> {
  const { data } = await api.get<ClientsResponse>(`/record-lists/${listId}/records`, { params: { page, limit } });
  return data;
}

export async function addRecordsToList(listId: string, recordIds: string[]): Promise<RecordListItem> {
  const { data } = await api.post<RecordListItem>(`/record-lists/${listId}/records`, { recordIds });
  return data;
}

export async function removeRecordsFromList(listId: string, recordIds: string[]): Promise<RecordListItem> {
  const { data } = await api.delete<RecordListItem>(`/record-lists/${listId}/records`, { data: { recordIds } });
  return data;
}

export async function deleteRecordList(listId: string): Promise<void> {
  await api.delete(`/record-lists/${listId}`);
}
