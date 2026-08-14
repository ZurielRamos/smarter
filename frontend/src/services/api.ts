import axios from 'axios';
import { toast } from 'sonner';
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

// Handle error responses - show toasts and redirect on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    if (error.response?.status === 429) {
      toast.error('Demasiadas solicitudes', {
        description: 'Has excedido el límite de peticiones. Espera un momento antes de intentarlo de nuevo.',
      });
      return Promise.reject(error);
    }

    if (error.response?.status === 403) {
      toast.error('Acceso denegado', {
        description: 'No tienes permisos para realizar esta acción.',
      });
      return Promise.reject(error);
    }

    if (error.response?.status >= 500) {
      toast.error('Error del servidor', {
        description: 'Ocurrió un error inesperado. Intenta de nuevo más tarde.',
      });
      return Promise.reject(error);
    }

    // 4xx errors (except 401, 403, 429) - show the server message if available
    if (error.response?.status >= 400 && error.response?.status < 500) {
      const message = error.response?.data?.message;
      if (message) {
        toast.error(typeof message === 'string' ? message : Array.isArray(message) ? message[0] : 'Error en la solicitud');
      }
    }

    // Network errors
    if (!error.response && error.code === 'ERR_NETWORK') {
      toast.error('Sin conexión', {
        description: 'No se pudo conectar con el servidor. Verifica tu conexión a internet.',
      });
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

export async function uploadFileAsync(file: File, tenantId: string): Promise<ImportJob> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('tenantId', tenantId);
  const { data } = await api.post<ImportJob>('/etl/parse-async', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getActiveImportJob(tenantId: string): Promise<ImportJob | null> {
  const { data } = await api.get<ImportJob | null>('/etl/active-job', { params: { tenantId } });
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
  avatarUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  documentType: string | null;
  documentNumber: string | null;
  phone: string | null;
  countryCode: string | null;
  email: string | null;
  gender: string | null;
  birthDate: string | null;
  city: string | null;
  region: string | null;
  status: string | null;
  channelSource: string | null;
  source: string | null;
  score: number;
  optInWhatsapp: boolean;
  optInEmail: boolean;
  language: string;
  assignedTo: string | null;
  assignedTeamId: string | null;
  lastContactAt: string | null;
  lastActivityAt: string | null;
  tags: string[] | null;
  customData: Record<string, any> | null;
  hasAdTracking?: boolean;
  adFirstPlatform?: string | null;
  adLastPlatform?: string | null;
  adTouchpoints?: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientsResponse {
  data: ClientRecord[];
  total: number;
}

export async function getClient(id: string): Promise<ClientRecord> {
  const { data } = await api.get<ClientRecord>(`/records/${id}`);
  return data;
}

export async function getClients(tenantId: string, page = 1, limit = 50, sortBy?: string, sortOrder?: string, assignedTo?: string, assignedTeamId?: string, filters?: Array<{ field: string; operator: string; value: string }>): Promise<ClientsResponse> {
  const params: any = { page, limit, tenantId };
  if (sortBy) params.sortBy = sortBy;
  if (sortOrder) params.sortOrder = sortOrder;
  if (assignedTo) params.assignedTo = assignedTo;
  if (assignedTeamId) params.assignedTeamId = assignedTeamId;
  if (filters && filters.length > 0) params.filters = JSON.stringify(filters);
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
  payload: Partial<Pick<CustomField, 'fieldLabel' | 'fieldType' | 'options' | 'isRequired' | 'sortOrder' | 'fieldGroup'>>,
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


// === Conversations ===

export interface ConversationRecord {
  id: string;
  inboxId: string;
  recordId: string | null;
  contactId: string;
  contactName: string | null;
  contactAvatar: string | null;
  status: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  labelIds: string[];
  createdAt: string;
  updatedAt: string;
  inbox?: { id: string; name: string; channel: string };
}

export interface ConversationsResponse {
  data: ConversationRecord[];
  total: number;
}

export async function getConversationsByRecord(recordId: string, limit = 20, offset = 0): Promise<ConversationsResponse> {
  const { data } = await api.get<ConversationsResponse>('/chats/conversations', {
    params: { recordId, limit, offset },
  });
  return data;
}

// === Kanban ===

export async function getKanbanColumn(params: {
  tenantId: string;
  groupBy: string;
  columnValue: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  page?: number;
  limit?: number;
  assignedTo?: string;
  assignedTeamId?: string;
}): Promise<ClientsResponse> {
  const { data } = await api.get<ClientsResponse>('/records/kanban', { params });
  return data;
}

export async function getKanbanCounts(tenantId: string, groupBy: string): Promise<Record<string, number>> {
  const { data } = await api.get<Record<string, number>>('/records/kanban/counts', { params: { tenantId, groupBy } });
  return data;
}

export interface KanbanInitialResponse {
  counts: Record<string, number>;
  columns: Record<string, { data: ClientRecord[]; total: number }>;
}

export async function getKanbanInitial(tenantId: string, groupBy: string, limit = 20, assignedTo?: string, assignedTeamId?: string): Promise<KanbanInitialResponse> {
  const params: any = { tenantId, groupBy, limit };
  if (assignedTo) params.assignedTo = assignedTo;
  if (assignedTeamId) params.assignedTeamId = assignedTeamId;
  const { data } = await api.get<KanbanInitialResponse>('/records/kanban/initial', { params });
  return data;
}


// === Notes ===

export interface NoteRecord {
  id: string;
  tenantId: string;
  recordId: string;
  content: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotesResponse {
  data: NoteRecord[];
  total: number;
}

export async function getNotes(recordId: string, page = 1, limit = 20): Promise<NotesResponse> {
  const { data } = await api.get<NotesResponse>('/records/notes', { params: { recordId, page, limit } });
  return data;
}

export async function createNote(payload: { tenantId: string; recordId: string; content: string; authorId?: string; authorName?: string }): Promise<NoteRecord> {
  const { data } = await api.post<NoteRecord>('/records/notes', payload);
  return data;
}

export async function deleteNote(noteId: string): Promise<void> {
  await api.delete(`/records/notes/${noteId}`);
}


// === Messages ===

export interface MessageRecord {
  id: string;
  conversationId: string;
  content: string;
  messageType: string;
  direction: string; // inbound | outbound
  senderId: string | null;
  senderName: string | null;
  externalId: string | null;
  status: string;
  createdAt: string;
}

export async function getMessages(conversationId: string, limit = 20): Promise<MessageRecord[]> {
  const { data } = await api.get<MessageRecord[]>(`/chats/conversations/${conversationId}/messages`, { params: { limit } });
  return data;
}


// === Global Search ===

export interface GlobalSearchResult {
  contacts: Array<{ id: string; firstName: string | null; lastName: string | null; phone: string | null; email: string | null; status: string | null; avatarUrl: string | null }>;
  messages: Array<{ id: string; conversationId: string; content: string; direction: string; createdAt: string; contactName: string | null; inboxName: string | null }>;
}

export async function globalSearch(tenantId: string, query: string, limit = 10): Promise<GlobalSearchResult> {
  const { data } = await api.get<GlobalSearchResult>('/records/search', { params: { tenantId, q: query, limit } });
  return data;
}


// === Activities ===

export interface ActivityRecord {
  id: string;
  tenantId: string;
  recordId: string;
  type: string;
  description: string | null;
  metadata: Record<string, any> | null;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface ActivitiesResponse {
  data: ActivityRecord[];
  total: number;
}

export async function getActivities(recordId: string, page = 1, limit = 30): Promise<ActivitiesResponse> {
  const { data } = await api.get<ActivitiesResponse>('/records/activities', { params: { recordId, page, limit } });
  return data;
}


// === Contact Events ===

export interface ContactEventRecord {
  id: string;
  tenantId: string;
  recordId: string;
  type: string;
  name: string;
  value: number | null;
  currency: string;
  metadata: Record<string, any> | null;
  source: string;
  actorId: string | null;
  actorName: string | null;
  dispatched: boolean;
  dispatchedAt: string | null;
  createdAt: string;
}

export async function getContactEvents(recordId: string, limit = 50, offset = 0): Promise<{ data: ContactEventRecord[]; total: number }> {
  const { data } = await api.get<{ data: ContactEventRecord[]; total: number }>('/contact-events', { params: { recordId, limit, offset } });
  return data;
}

export async function createContactEvent(payload: {
  tenantId: string;
  recordId: string;
  type: string;
  name: string;
  value?: number;
  currency?: string;
  metadata?: Record<string, any>;
  actorId?: string;
  actorName?: string;
}): Promise<ContactEventRecord> {
  const { data } = await api.post<ContactEventRecord>('/contact-events', payload);
  return data;
}

export async function deleteContactEvent(id: string): Promise<void> {
  await api.delete(`/contact-events/${id}`);
}
