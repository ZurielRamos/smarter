import { api } from "./api";

/**
 * Cliente API del módulo Reclutamiento (encuestadores, contratos y datos de
 * pago). Espejo de backend/src/reclutamiento. El tenant va en la ruta.
 */

export type ProfileStatus = "candidate" | "active" | "suspended" | "ended";
export type ContractStatus = "draft" | "active" | "ended";
export type PaymentMethodType = "bank_transfer" | "wallet" | "other";

export interface SurveyorContact {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  city: string | null;
  region: string | null;
  countryCode: string | null;
  deleted: boolean;
}

export interface SurveyorProfile {
  id: string;
  tenantId: string;
  recordId: string;
  type: "surveyor";
  status: ProfileStatus;
  statusReason: string | null;
  enabledBy: string | null;
  enabledAt: string | null;
  data: Record<string, unknown>;
  qualityScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyorListItem extends SurveyorProfile {
  contact: SurveyorContact | null;
  activeContract: {
    id: string;
    defaultRate: number;
    currency: string;
    countryCode: string;
    endDate: string | null;
  } | null;
  paymentVerified: boolean;
}

export interface RenderedClause {
  key: string;
  number: number;
  title: string;
  body: string;
}

export interface SignatureEvidence {
  method: string;
  reference?: string;
  notes?: string;
  witnessName?: string;
  signedBy?: "admin" | "contractor_portal";
  verifiedChannel?: string;
  verifiedDestination?: string;
  registeredBy: string;
  registeredAt: string;
  contentHash: string;
}

export interface SurveyorContract {
  id: string;
  profileId: string;
  countryCode: string;
  startDate: string;
  endDate: string | null;
  defaultRate: number;
  currency: string;
  status: ContractStatus;
  notes: string | null;
  createdAt: string;
  // Contratos generados desde una plantilla (nulos en contratos manuales)
  templateId: string | null;
  templateName: string | null;
  templateVersion: number | null;
  contractType: string | null;
  languageCode: string | null;
  contractNumber: string | null;
  issueDate: string | null;
  variableValues: Record<string, any> | null;
  contentHash: string | null;
  sentToContactAt: string | null;
  signatureStatus: "unsigned" | "signed";
  signedAt: string | null;
  signatureEvidence: SignatureEvidence | null;
}

export interface SurveyorPaymentMethod {
  id: string;
  profileId: string;
  method: PaymentMethodType;
  holderName: string;
  hint: string | null;
  isDefault: boolean;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

export interface SurveyorDetail {
  profile: SurveyorProfile;
  contact: SurveyorContact | null;
  contracts: SurveyorContract[];
  paymentMethods: SurveyorPaymentMethod[];
}

export interface AuditEntry {
  id: string;
  actorType: string;
  actorLabel: string | null;
  action: string;
  targetType: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ContractInput {
  countryCode?: string;
  currency: string;
  defaultRate: number;
  startDate: string;
  endDate?: string | null;
  notes?: string | null;
  /** Generar desde una plantilla publicada. */
  templateId?: string;
  issueDate?: string;
  values?: ContractValues;
}

export interface ContractValues {
  /** Valores de {{datos.*}}. */
  datos?: Record<string, string>;
  /** Datos del contacto completados a mano (prevalecen sobre el CRM). */
  contacto?: Record<string, string>;
}

export interface PaymentMethodInput {
  method: PaymentMethodType;
  holderName: string;
  details: Record<string, string>;
}

// ───────────────────────── Plantillas de contrato ─────────────────────────

export type Language = "es" | "en";
export type TemplateStatus = "draft" | "published" | "archived";
export interface ContractTemplate {
  id: string;
  familyId: string;
  version: number;
  name: string;
  description: string | null;
  countryCode: string;
  languageCode: Language;
  status: TemplateStatus;
  /** Texto del contrato, con variables «{{contacto.ciudad}}». */
  body: string;
  contractPrefix: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CountryPreset {
  code: string;
  name: Record<Language, string>;
  currency: string;
  defaultLanguage: Language;
  contractTypeLabel: Record<Language, string>;
  notes: string[];
}

export type VariableGroup = "contacto" | "campos" | "contrato" | "datos";

export interface VariableDef {
  path: string;
  label: string;
  group: VariableGroup;
  /** Texto que se inserta entre llaves (puede incluir un filtro). */
  insert: string;
  hint?: string;
  /** Posiciones que retrocede el cursor tras insertar. */
  caretBack?: number;
}

export interface ContractCatalog {
  languages: Language[];
  variables: VariableDef[];
  filters: Array<{ name: string; help: string }>;
  presets: CountryPreset[];
}

export interface MissingItem {
  path: string;
  label: string;
  source: "contact" | "input" | "contract" | "template";
}

export interface TemplateAnalysis {
  errors: string[];
  warnings: string[];
  /** Nombres de los datos a completar que usa el texto ({{datos.zona}} → zona). */
  datos: string[];
  usedPaths: string[];
}

export interface PreviewResult extends TemplateAnalysis {
  text: string;
  missing: MissingItem[];
  blockers: string[];
  language: Language;
}

export interface TemplateDraft {
  name?: string;
  description?: string | null;
  countryCode?: string;
  languageCode?: Language;
  body?: string;
  contractPrefix?: string | null;
}

export interface ContractDocument {
  id: string;
  number: string | null;
  title: string | null;
  templateVersion: number | null;
  languageCode: Language | null;
  issueDate: string | null;
  startDate: string;
  endDate: string | null;
  status: ContractStatus;
  clauses: RenderedClause[];
  parties: { contractor?: Record<string, string> } | null;
  contentHash: string | null;
  integrityOk: boolean;
  signature: { status: "unsigned" | "signed"; signedAt: string | null; evidence: SignatureEvidence | null };
}

// ───────────────────────── Portal del encuestador ─────────────────────────

export type InvitationChannel = "email" | "whatsapp" | "both" | "manual";
export type VerificationChannel = "email" | "phone" | "both";
export type DocumentStatus = "pending" | "approved" | "rejected";

export interface PortalConfig {
  invitation: {
    channel: InvitationChannel;
    expiresDays: number;
    email: { subject: string; body: string };
    whatsapp: { inboxId: string | null; templateName: string; language: string; variables: string[] };
  };
  verification: {
    channel: VerificationChannel;
    email: { subject: string; body: string };
    whatsapp: { inboxId: string | null; templateName: string; language: string };
  };
  fields: Array<{ key: string; required: boolean }>;
  documents: Array<{ key: string; label: string; required: boolean; help: string }>;
  sessionHours: number;
  welcomeMessage: string;
}

export interface PortalFieldDef {
  key: string;
  label: string;
  type: "text" | "longtext" | "date" | "select" | "number" | "boolean";
  source: "fixed" | "custom";
  options?: Array<{ value: string; label: string }>;
  suggestions?: string[];
  maxLength: number;
}

export interface PortalDocumentCurrent {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  rejectReason: string | null;
  uploadedAt: string;
}

export interface PortalStatus {
  lastInvitation: { createdAt: string; expiresAt: string; channels: string[]; active: boolean } | null;
  lastPortalLoginAt: string | null;
  documents: Array<{ key: string; label: string; required: boolean; current: PortalDocumentCurrent | null }>;
}

export interface WhatsappInbox {
  id: string;
  name: string;
  connected: boolean;
}

export interface WhatsappTemplate {
  name: string;
  language: string;
  category: string;
  bodyText: string;
  variableCount: number;
}

const base = (tenantId: string) => `/reclutamiento/${tenantId}`;

export const reclutamientoApi = {
  async list(
    tenantId: string,
    params: { status?: string; search?: string; page?: number; limit?: number },
  ) {
    const { data } = await api.get<{ data: SurveyorListItem[]; total: number; page: number; limit: number }>(
      `${base(tenantId)}/profiles`,
      { params },
    );
    return data;
  },

  async detail(tenantId: string, profileId: string) {
    const { data } = await api.get<SurveyorDetail>(`${base(tenantId)}/profiles/${profileId}`);
    return data;
  },

  async create(tenantId: string, recordId: string) {
    const { data } = await api.post<SurveyorProfile>(`${base(tenantId)}/profiles`, { recordId });
    return data;
  },

  async transition(
    tenantId: string,
    profileId: string,
    action: "activate" | "suspend" | "end" | "reopen",
    reason?: string,
  ) {
    const { data } = await api.post<SurveyorProfile>(
      `${base(tenantId)}/profiles/${profileId}/${action}`,
      reason ? { reason } : {},
    );
    return data;
  },

  // Contratos
  async createContract(tenantId: string, profileId: string, input: ContractInput) {
    const { data } = await api.post<SurveyorContract>(`${base(tenantId)}/profiles/${profileId}/contracts`, input);
    return data;
  },
  async updateContract(tenantId: string, contractId: string, input: ContractInput) {
    const { data } = await api.patch<SurveyorContract>(`${base(tenantId)}/contracts/${contractId}`, input);
    return data;
  },
  async activateContract(tenantId: string, contractId: string) {
    const { data } = await api.post<SurveyorContract>(`${base(tenantId)}/contracts/${contractId}/activate`);
    return data;
  },
  async endContract(tenantId: string, contractId: string) {
    const { data } = await api.post<SurveyorContract>(`${base(tenantId)}/contracts/${contractId}/end`);
    return data;
  },
  async deleteContract(tenantId: string, contractId: string) {
    await api.delete(`${base(tenantId)}/contracts/${contractId}`);
  },

  // Métodos de pago
  async createPaymentMethod(tenantId: string, profileId: string, input: PaymentMethodInput) {
    const { data } = await api.post<SurveyorPaymentMethod>(
      `${base(tenantId)}/profiles/${profileId}/payment-methods`,
      input,
    );
    return data;
  },
  async updatePaymentMethod(tenantId: string, id: string, input: PaymentMethodInput) {
    const { data } = await api.patch<SurveyorPaymentMethod>(`${base(tenantId)}/payment-methods/${id}`, input);
    return data;
  },
  async verifyPaymentMethod(tenantId: string, id: string) {
    const { data } = await api.post<SurveyorPaymentMethod>(`${base(tenantId)}/payment-methods/${id}/verify`);
    return data;
  },
  async setDefaultPaymentMethod(tenantId: string, id: string) {
    const { data } = await api.post<SurveyorPaymentMethod>(`${base(tenantId)}/payment-methods/${id}/default`);
    return data;
  },
  async revealPaymentMethod(tenantId: string, id: string) {
    const { data } = await api.post<{
      id: string;
      method: PaymentMethodType;
      holderName: string;
      details: Record<string, string>;
    }>(`${base(tenantId)}/payment-methods/${id}/reveal`);
    return data;
  },
  async deletePaymentMethod(tenantId: string, id: string) {
    await api.delete(`${base(tenantId)}/payment-methods/${id}`);
  },

  // Firma y documento
  async signContract(
    tenantId: string,
    contractId: string,
    input: { method: string; signedAt: string; reference?: string; notes?: string; witnessName?: string },
  ) {
    const { data } = await api.post<SurveyorContract>(`${base(tenantId)}/contracts/${contractId}/sign`, input);
    return data;
  },
  async contractDocument(tenantId: string, contractId: string) {
    const { data } = await api.get<ContractDocument>(`${base(tenantId)}/contracts/${contractId}/document`);
    return data;
  },

  // Plantillas de contrato
  async contractCatalog(tenantId: string) {
    const { data } = await api.get<ContractCatalog>(`${base(tenantId)}/contract-catalog`);
    return data;
  },
  async listTemplates(tenantId: string, params?: { status?: string; countryCode?: string }) {
    const { data } = await api.get<ContractTemplate[]>(`${base(tenantId)}/templates`, { params });
    return data;
  },
  async getTemplate(tenantId: string, id: string) {
    const { data } = await api.get<ContractTemplate>(`${base(tenantId)}/templates/${id}`);
    return data;
  },
  async createTemplate(
    tenantId: string,
    input: TemplateDraft & { fromPreset?: { code: string; languageCode?: Language; countryCode?: string } },
  ) {
    const { data } = await api.post<ContractTemplate>(`${base(tenantId)}/templates`, input);
    return data;
  },
  async updateTemplate(tenantId: string, id: string, input: TemplateDraft) {
    const { data } = await api.patch<ContractTemplate>(`${base(tenantId)}/templates/${id}`, input);
    return data;
  },
  async deleteTemplate(tenantId: string, id: string) {
    await api.delete(`${base(tenantId)}/templates/${id}`);
  },
  async publishTemplate(tenantId: string, id: string) {
    const { data } = await api.post<{ template: ContractTemplate; analysis: TemplateAnalysis }>(`${base(tenantId)}/templates/${id}/publish`);
    return data;
  },
  async newTemplateVersion(tenantId: string, id: string) {
    const { data } = await api.post<ContractTemplate>(`${base(tenantId)}/templates/${id}/new-version`);
    return data;
  },
  async archiveTemplate(tenantId: string, id: string) {
    const { data } = await api.post<ContractTemplate>(`${base(tenantId)}/templates/${id}/archive`);
    return data;
  },
  async duplicateTemplate(tenantId: string, id: string) {
    const { data } = await api.post<ContractTemplate>(`${base(tenantId)}/templates/${id}/duplicate`);
    return data;
  },
  async previewTemplate(
    tenantId: string,
    input: {
      templateId?: string;
      draft?: TemplateDraft;
      profileId?: string;
      values?: ContractValues;
      contract?: { rate?: number; currency?: string; startDate?: string; endDate?: string };
    },
  ) {
    const { data } = await api.post<PreviewResult>(`${base(tenantId)}/templates/preview`, input);
    return data;
  },

  // Portal del encuestador
  async portalConfig(tenantId: string) {
    const { data } = await api.get<{ config: PortalConfig; fields: PortalFieldDef[] }>(`${base(tenantId)}/portal-config`);
    return data;
  },
  async savePortalConfig(tenantId: string, config: PortalConfig) {
    const { data } = await api.put<{ config: PortalConfig }>(`${base(tenantId)}/portal-config`, config);
    return data.config;
  },
  async whatsappInboxes(tenantId: string) {
    const { data } = await api.get<WhatsappInbox[]>(`${base(tenantId)}/portal-config/whatsapp-inboxes`);
    return data;
  },
  async whatsappTemplates(tenantId: string, inboxId: string) {
    const { data } = await api.get<WhatsappTemplate[]>(`${base(tenantId)}/portal-config/whatsapp-templates`, { params: { inboxId } });
    return data;
  },
  async invite(tenantId: string, profileId: string) {
    const { data } = await api.post<{ link: string; expiresAt: string; sent: string[]; failed: string[] }>(`${base(tenantId)}/profiles/${profileId}/invite`);
    return data;
  },
  async portalStatus(tenantId: string, profileId: string) {
    const { data } = await api.get<PortalStatus>(`${base(tenantId)}/profiles/${profileId}/portal`);
    return data;
  },
  /** Documento del encuestador como Blob (lo sirve la API, descifrado, solo a personal autorizado). */
  async documentBlob(tenantId: string, documentId: string) {
    const { data } = await api.get<Blob>(`${base(tenantId)}/documents/${documentId}/file`, { responseType: "blob" });
    return data;
  },
  async reviewDocument(tenantId: string, documentId: string, decision: "approve" | "reject", reason?: string) {
    const { data } = await api.post<{ id: string; status: DocumentStatus; rejectReason: string | null }>(
      `${base(tenantId)}/documents/${documentId}/review`,
      { decision, reason },
    );
    return data;
  },
  async sendContractToPortal(tenantId: string, contractId: string) {
    const { data } = await api.post<SurveyorContract>(`${base(tenantId)}/contracts/${contractId}/send`);
    return data;
  },
  async withdrawContractFromPortal(tenantId: string, contractId: string) {
    const { data } = await api.post<SurveyorContract>(`${base(tenantId)}/contracts/${contractId}/withdraw`);
    return data;
  },

  // Auditoría
  async audit(tenantId: string, profileId: string, limit = 50) {
    const { data } = await api.get<{ data: AuditEntry[]; total: number }>(`${base(tenantId)}/audit`, {
      params: { profileId, limit },
    });
    return data;
  },
};

/** Mensaje de error del servidor (si lo hay) para mostrar en un formulario. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (typeof message === "string") return message;
  if (Array.isArray(message) && typeof message[0] === "string") return message[0];
  return fallback;
}
