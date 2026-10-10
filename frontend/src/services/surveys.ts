import { api } from "./api";

/**
 * Cliente API del módulo de Encuestas.
 *
 * Las encuestas son LOCALES: se crean/editan sin WhatsApp. Su contenido usa el
 * formato Meta Flow JSON (flowJson), lo que permite rellenarlas por enlace
 * público web y, opcionalmente, publicarlas como WhatsApp Flow de Meta.
 */

export interface SurveyItem {
  id: string;
  tenantId: string;
  name: string;
  displayTitle: string | null;
  description: string | null;
  logoUrl: string | null;
  theme: { primary?: string; background?: string } | null;
  requireLocation: boolean;
  status: string; // draft | active | archived
  slug: string | null;
  flowJson: Record<string, any> | null;
  responseCount: number;
  managedByUserId: string | null;
  metaFlowId: string | null;
  inboxId: string | null;
  metaSyncStatus: "synced" | "out_of_sync" | null;
  metaSyncErrors: Array<{ code?: string; type?: string; message: string; pointer?: string }> | null;
  crmMapping: {
    fields?: Record<string, string>;
    matchRules?: { logic: "and" | "or"; fields: string[] };
    matchField?: string | null;
  } | null;
  metadata: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyResponseItem {
  id: string;
  surveyId: string;
  channel: string; // web | whatsapp | api
  status: string;
  responseData: Record<string, any>;
  respondentIdentifier: string | null;
  attributedUserId: string | null;
  createdAt: string;
}

export async function getSurveyAgentLink(id: string): Promise<{ token: string }> {
  const { data } = await api.post<{ token: string }>(`/surveys/${id}/agent-link`);
  return data;
}

export interface SurveyQuestionAnalytics {
  name: string;
  question: string;
  screen: string;
  type: "choice" | "text" | "boolean" | "other";
  options?: Array<{ id: string; title: string; count: number; percentage: number }>;
  textSamples?: string[];
  answered: number;
}

export interface SurveyAnalytics {
  surveyId: string;
  name: string;
  status: string;
  totalResponses: number;
  byChannel: Record<string, number>;
  questions: SurveyQuestionAnalytics[];
}

export async function listSurveys(tenantId: string): Promise<SurveyItem[]> {
  const { data } = await api.get<SurveyItem[]>("/surveys", { params: { tenantId } });
  return data;
}

/**
 * Encuestas del tenant PUBLICADAS como Flow en Meta (estado real verificado en
 * Meta). Una sola llamada en lote para pintar el badge "Publicada" en la lista
 * sin consultar Meta por cada encuesta.
 */
export async function listPublishedSurveyFlows(
  tenantId: string,
): Promise<Array<{ id: string; name: string; metaFlowId: string; firstScreen: string | null }>> {
  const { data } = await api.get<
    Array<{ id: string; name: string; metaFlowId: string; firstScreen: string | null }>
  >("/surveys/published-flows", { params: { tenantId } });
  return data;
}

export async function getSurvey(id: string): Promise<SurveyItem> {
  const { data } = await api.get<SurveyItem>(`/surveys/${id}`);
  return data;
}

export async function createSurvey(body: {
  tenantId: string;
  name: string;
  description?: string;
  flowJson?: Record<string, any>;
}): Promise<SurveyItem> {
  const { data } = await api.post<SurveyItem>("/surveys", body);
  return data;
}

export async function updateSurvey(
  id: string,
  patch: Partial<{
    name: string;
    displayTitle: string | null;
    description: string | null;
    theme: { primary?: string; background?: string } | null;
    requireLocation: boolean;
  }>,
): Promise<SurveyItem> {
  const { data } = await api.put<SurveyItem>(`/surveys/${id}`, patch);
  return data;
}

export async function uploadSurveyLogo(id: string, file: File): Promise<SurveyItem> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<SurveyItem>(`/surveys/${id}/logo`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function removeSurveyLogo(id: string): Promise<SurveyItem> {
  const { data } = await api.delete<SurveyItem>(`/surveys/${id}/logo`);
  return data;
}

export async function saveSurveyFlowJson(
  id: string,
  flowJson: Record<string, any>,
): Promise<SurveyItem> {
  const { data } = await api.post<SurveyItem>(`/surveys/${id}/flow-json`, { flowJson });
  return data;
}

export async function activateSurvey(id: string): Promise<SurveyItem> {
  const { data } = await api.post<SurveyItem>(`/surveys/${id}/activate`);
  return data;
}

export async function archiveSurvey(id: string): Promise<SurveyItem> {
  const { data } = await api.post<SurveyItem>(`/surveys/${id}/archive`);
  return data;
}

export async function deleteSurvey(id: string): Promise<void> {
  await api.delete(`/surveys/${id}`);
}

export async function getSurveyAnalytics(id: string): Promise<SurveyAnalytics> {
  const { data } = await api.get<SurveyAnalytics>(`/surveys/${id}/analytics`);
  return data;
}

export async function getSurveyResponses(id: string): Promise<SurveyResponseItem[]> {
  const { data } = await api.get<SurveyResponseItem[]>(`/surveys/${id}/responses`);
  return data;
}

export interface CrmTargets {
  system: Array<{ value: string; label: string; group: string }>;
  custom: Array<{ value: string; label: string; group: string }>;
  matchable: string[];
}

export interface CrmMapping {
  fields?: Record<string, string>;
  matchRules?: { logic: "and" | "or"; fields: string[] };
  // Legado: un solo campo de match (se sigue aceptando por compatibilidad).
  matchField?: string | null;
}

export async function getCrmTargets(tenantId: string): Promise<CrmTargets> {
  const { data } = await api.get<CrmTargets>("/surveys/crm/targets", { params: { tenantId } });
  return data;
}

export async function updateSurveyCrmMapping(id: string, mapping: CrmMapping): Promise<SurveyItem> {
  const { data } = await api.put<SurveyItem>(`/surveys/${id}/crm-mapping`, mapping);
  return data;
}

export interface MetaValidationError {
  code?: string;
  type?: string;
  message: string;
  pointer?: string;
}

export interface MetaValidationResult {
  valid: boolean;
  errors: MetaValidationError[];
  metaReachable: boolean;
}

export async function retrySurveySync(
  id: string,
): Promise<{ metaSynced: boolean; metaErrors?: MetaValidationError[] }> {
  const { data } = await api.post(`/surveys/${id}/retry-sync`);
  return data;
}

/**
 * Estado real del Flow en Meta para la encuesta (DRAFT/PUBLISHED). Solo PUBLISHED
 * puede usarse en un botón de plantilla de WhatsApp.
 */
export async function getSurveyWhatsAppStatus(
  id: string,
): Promise<{ linked: boolean; status: string | null }> {
  const { data } = await api.get<{ linked: boolean; status: string | null }>(
    `/surveys/${id}/whatsapp-status`,
  );
  return data;
}

export async function validateSurveyOnMeta(
  id: string,
  inboxId: string,
): Promise<MetaValidationResult> {
  const { data } = await api.post<MetaValidationResult>(`/surveys/${id}/validate-whatsapp`, {
    inboxId,
  });
  return data;
}

export async function unpublishSurveyFromWhatsApp(
  id: string,
): Promise<{ success: boolean; deletedOnMeta: boolean; warning?: string }> {
  const { data } = await api.post(`/surveys/${id}/unpublish-whatsapp`);
  return data;
}

export async function publishSurveyToWhatsApp(
  id: string,
  inboxId: string,
  publish = false,
): Promise<{
  success: boolean;
  metaFlowId: string | null;
  status: string | null;
  error?: string;
  validationErrors?: MetaValidationError[];
}> {
  const { data } = await api.post(`/surveys/${id}/publish-whatsapp`, { inboxId, publish });
  return data;
}

export interface TenantMember {
  userId: string;
  name: string;
  email: string;
  status: string;
}

export async function getTenantMembers(slug: string): Promise<TenantMember[]> {
  const { data } = await api.get<TenantMember[]>(`/account/${slug}/members`);
  return data;
}

/** Cambia el usuario gestor (owner) de la encuesta. */
export async function setSurveyManager(
  id: string,
  managedByUserId: string | null,
): Promise<SurveyItem> {
  const { data } = await api.put<SurveyItem>(`/surveys/${id}/manager`, { managedByUserId });
  return data;
}


