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

export type LedgerType = "accrual" | "reversal" | "payout" | "adjustment";
/** Movimiento del saldo de un encuestador (de solo agregar). */
export interface LedgerEntry {
  id: string;
  type: LedgerType;
  amount: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  reference: string | null;
  note: string | null;
  study: string | null;
  point: string | null;
}
export interface LedgerPage {
  balances: Array<{ currency: string; balance: number }>;
  data: LedgerEntry[];
  total: number;
  page: number;
  limit: number;
}
export interface BalanceRow {
  profileId: string;
  name: string | null;
  email: string | null;
  status: ProfileStatus | null;
  currency: string;
  balance: number;
  lastMovement: string;
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

// ───────────────────────── Proyectos de reclutamiento ─────────────────────────
export type ProjectStatus = "draft" | "active" | "paused" | "ended";
export type ProjectAction = "activate" | "pause" | "resume" | "end";
/** Perfil de la persona dentro de un proyecto. */
export type ProspectRole = "participant" | "surveyor" | "moderator";
/** Cómo se le cuenta a la persona su estado (nunca ve el estado interno). */
export type PublicStatus = "received" | "in_process" | "selected" | "not_selected" | "finished";
/** Estado de un prospecto. El catálogo es el mismo para todos los perfiles. */
export interface ProspectState {
  key: string;
  label: string;
  help: string;
  public: PublicStatus;
  negative?: boolean;
  participated?: boolean;
}
export interface ProspectCatalog {
  roles: Array<{ key: ProspectRole; label: string }>;
  states: ProspectState[];
  initial: string;
}
/** Proyecto genérico: una convocatoria con su landing, su formulario y sus prospectos. */
export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** Informativo: las personas del proyecto necesitan contrato firmado. */
  requiresSignedContract: boolean;
  /** Perfiles que acepta el proyecto. */
  roles: ProspectRole[];
  /** Perfil con que entra quien se registra por la landing. */
  defaultRole: ProspectRole;
  /** Quien se registra puede postularse como moderador. */
  moderatorSignup: boolean;
  status: ProjectStatus;
  publicName: string | null;
  registrationOpen: boolean;
  landingEnabled: boolean;
  questionCount: number;
  prospectCount?: number;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ProjectInput {
  name?: string;
  slug?: string;
  description?: string | null;
  requiresSignedContract?: boolean;
  roles?: ProspectRole[];
  defaultRole?: ProspectRole;
  moderatorSignup?: boolean;
}
// Cara pública del proyecto: nombre, landing, formulario y registro.
export type QuestionType = "short" | "long" | "single" | "multi" | "yesno" | "number";

export interface FormQuestion {
  id: string;
  type: QuestionType;
  label: string;
  help: string;
  required: boolean;
  /** Solo para `single` y `multi`. */
  options: string[];
  /** Solo para `number`. */
  min: number | null;
  max: number | null;
}

/** Dato personal del contacto que se pide al registrarse (clave del catálogo de campos del CRM). */
export interface PersonalField {
  key: string;
  required: boolean;
}
/** Cómo se verifica a quien se registra: canales con código y, si es WhatsApp, el número y la plantilla. */
export interface ProjectVerification {
  channels: Array<"email" | "phone">;
  whatsapp: { inboxId: string | null; templateName: string; language: string };
}
export interface ProjectForm {
  questions: FormQuestion[];
  fields: PersonalField[];
  /** Nulo: usa la verificación del portal de la cuenta. */
  verification: ProjectVerification | null;
}

export interface ProjectPublicSettings {
  publicName: string | null;
  registrationOpen: boolean;
}

export interface ProjectFace {
  settings: ProjectPublicSettings;
  landing: LandingConfig;
  form: ProjectForm;
}

// Prospectos: personas que se registraron por la landing de un proyecto.
export interface ProspectAnswer {
  id: string;
  label: string;
  type: QuestionType;
  value: string | number | boolean | string[];
}
export interface ContactSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}
/** Resumen de la persona en toda la cuenta. */
export interface PersonSummary {
  ratingAverage: number | null;
  ratingCount: number;
  participations: number;
  lastParticipationAt: string | null;
}
export interface Prospect {
  id: string;
  role: ProspectRole;
  /** Estado (ver el catálogo de estados). */
  status: string;
  rating: number | null;
  ratingNote: string | null;
  ratedAt: string | null;
  /** Solo en el listado. */
  person?: PersonSummary | null;
  /** Motivo interno del rechazo: la persona no lo ve. */
  statusReason: string | null;
  decidedAt: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  answers: ProspectAnswer[];
  /** Cómo llegó: por la landing o agregado por el equipo (p. ej. desde un chat). */
  source: "landing" | "manual";
  /** Nulo si lo agregó el equipo. */
  consentAt: string | null;
  createdAt: string;
  /** Contacto del CRM vinculado; `record` es nulo si el contacto ya no existe. */
  link: { method: "auto" | "manual" | null; linkedAt: string | null; record: ContactSummary | null } | null;
}
export interface LinkCandidate extends ContactSummary {
  /** Coincide en correo o teléfono con el prospecto. */
  matchesData: boolean;
}
export interface ProspectEvent {
  id: string;
  role: ProspectRole;
  fromRole: ProspectRole | null;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  byTeam: boolean;
  /** Quién hizo el cambio: el equipo, un flujo de conversación o el registro por la landing. */
  by: "team" | "flow" | "landing";
  createdAt: string;
}
export interface ContactProjectLink {
  prospectId: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  projectStatus: ProjectStatus;
  role: ProspectRole;
  status: string;
  rating: number | null;
  linkMethod: "auto" | "manual";
  linkedAt: string;
  registeredAt: string;
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
  registration: { mode: RegistrationMode; consentText: string };
  landing: LandingConfig;
}

export type RegistrationMode = "invite" | "open";
export type LandingSectionId = "hero" | "about" | "benefits" | "steps" | "requirements" | "faq" | "cta";
export type LandingImageSlot = "logo" | "hero" | "background" | "about";
export type HeroBackgroundType = "none" | "image" | "preset";

export interface HeroBackground {
  type: HeroBackgroundType;
  imageUrl: string;
  preset: string;
  /** Oscurecimiento de la imagen, de 0 a 80 %. */
  overlay: number;
}
export type LandingAppearance = "light" | "dark" | "auto";

export interface LandingItem {
  title: string;
  text: string;
  /** Identificador del icono (p. ej. «clock»); vacío usa el predeterminado. */
  icon: string;
}

/** Landing pública del portal: secciones fijas que la cuenta activa, ordena y edita. `{{empresa}}` se reemplaza por el nombre de la cuenta. */
export interface LandingConfig {
  enabled: boolean;
  brand: { primaryColor: string; font: "sans" | "serif"; appearance: LandingAppearance; logoUrl: string; showName: boolean };
  sections: Array<{ id: LandingSectionId; enabled: boolean }>;
  content: {
    hero: { title: string; subtitle: string; ctaLabel: string; imageUrl: string; background: HeroBackground };
    about: { title: string; body: string; imageUrl: string };
    benefits: { title: string; items: LandingItem[] };
    steps: { title: string; items: LandingItem[] };
    requirements: { title: string; items: string[] };
    faq: { title: string; items: Array<{ question: string; answer: string }> };
    cta: { title: string; text: string; buttonLabel: string };
    footer: { text: string; email: string; phone: string; links: Array<{ label: string; url: string }> };
  };
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

  // Proyectos
  async projects(tenantId: string, params: { status?: ProjectStatus; search?: string; page?: number; limit?: number } = {}) {
    const { data } = await api.get<{ data: Project[]; total: number; page: number; limit: number }>(`${base(tenantId)}/projects`, { params });
    return data;
  },
  async project(tenantId: string, id: string) {
    const { data } = await api.get<Project>(`${base(tenantId)}/projects/${id}`);
    return data;
  },
  async createProject(tenantId: string, input: ProjectInput & { name: string }) {
    const { data } = await api.post<Project>(`${base(tenantId)}/projects`, input);
    return data;
  },
  async updateProject(tenantId: string, id: string, input: ProjectInput) {
    const { data } = await api.patch<Project>(`${base(tenantId)}/projects/${id}`, input);
    return data;
  },
  async deleteProject(tenantId: string, id: string) {
    await api.delete(`${base(tenantId)}/projects/${id}`);
  },
  async projectAction(tenantId: string, id: string, action: ProjectAction) {
    const { data } = await api.post<Project>(`${base(tenantId)}/projects/${id}/${action}`);
    return data;
  },
  // Cara pública del proyecto
  async projectFace(tenantId: string, id: string) {
    const { data } = await api.get<ProjectFace>(`${base(tenantId)}/projects/${id}/public`);
    return data;
  },
  async saveProjectSettings(tenantId: string, id: string, input: Partial<ProjectPublicSettings>) {
    const { data } = await api.put<ProjectPublicSettings>(`${base(tenantId)}/projects/${id}/public/settings`, input);
    return data;
  },
  async saveProjectLanding(tenantId: string, id: string, landing: LandingConfig) {
    const { data } = await api.put<{ landing: LandingConfig }>(`${base(tenantId)}/projects/${id}/public/landing`, landing);
    return data.landing;
  },
  async uploadProjectLandingImage(tenantId: string, id: string, slot: LandingImageSlot, file: File) {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post<{ url: string }>(`${base(tenantId)}/projects/${id}/public/landing/images/${slot}`, form);
    return data.url;
  },
  async saveProjectForm(tenantId: string, id: string, form: ProjectForm) {
    const { data } = await api.put<{ form: ProjectForm }>(`${base(tenantId)}/projects/${id}/public/form`, form);
    return data.form;
  },
  // Prospectos
  async prospects(tenantId: string, id: string, params: { search?: string; linked?: "yes" | "no"; status?: string; role?: ProspectRole; page?: number; limit?: number } = {}) {
    const { data } = await api.get<{ data: Prospect[]; total: number; page: number; limit: number; roleCounts: Partial<Record<ProspectRole, number>> }>(`${base(tenantId)}/projects/${id}/prospects`, { params });
    return data;
  },
  /** Agrega un contacto del CRM al proyecto con un perfil y un estado de entrada (por defecto, los del proyecto y «Nuevo»). */
  async addProspect(tenantId: string, id: string, recordId: string, role?: ProspectRole, status?: string) {
    const { data } = await api.post<Prospect>(`${base(tenantId)}/projects/${id}/prospects`, { recordId, role, status });
    return data;
  },
  /** Perfiles y estados de los prospectos (catálogo fijo). */
  async prospectCatalog(tenantId: string) {
    const { data } = await api.get<ProspectCatalog>(`${base(tenantId)}/projects/prospect-states`);
    return data;
  },
  async setProspectRole(tenantId: string, id: string, prospectId: string, role: ProspectRole) {
    const { data } = await api.put<Prospect>(`${base(tenantId)}/projects/${id}/prospects/${prospectId}/role`, { role });
    return data;
  },
  async rateProspect(tenantId: string, id: string, prospectId: string, rating: number | null, note?: string) {
    const { data } = await api.put<Prospect>(`${base(tenantId)}/projects/${id}/prospects/${prospectId}/rating`, { rating, note: note || undefined });
    return data;
  },
  async prospectHistory(tenantId: string, id: string, prospectId: string) {
    const { data } = await api.get<{ data: ProspectEvent[] }>(`${base(tenantId)}/projects/${id}/prospects/${prospectId}/history`);
    return data.data;
  },
  async setProspectStatus(tenantId: string, id: string, prospectId: string, status: string, reason?: string) {
    const { data } = await api.put<Prospect>(`${base(tenantId)}/projects/${id}/prospects/${prospectId}/status`, { status, reason: reason || undefined });
    return data;
  },
  async prospectCandidates(tenantId: string, id: string, prospectId: string, search?: string) {
    const { data } = await api.get<{ data: LinkCandidate[] }>(`${base(tenantId)}/projects/${id}/prospects/${prospectId}/candidates`, { params: { search: search || undefined } });
    return data.data;
  },
  async linkProspect(tenantId: string, id: string, prospectId: string, recordId: string) {
    const { data } = await api.put<Prospect>(`${base(tenantId)}/projects/${id}/prospects/${prospectId}/link`, { recordId });
    return data;
  },
  async unlinkProspect(tenantId: string, id: string, prospectId: string) {
    const { data } = await api.delete<Prospect>(`${base(tenantId)}/projects/${id}/prospects/${prospectId}/link`);
    return data;
  },
  async autoLinkProspects(tenantId: string, id: string) {
    const { data } = await api.post<{ linked: number; ambiguous: number; unmatched: number }>(`${base(tenantId)}/projects/${id}/prospects/auto-link`);
    return data;
  },
  async deleteProspect(tenantId: string, id: string, prospectId: string) {
    await api.delete(`${base(tenantId)}/projects/${id}/prospects/${prospectId}`);
  },
  /** Proyectos en los que un contacto del CRM tiene prospectos vinculados. */
  async contactProjects(tenantId: string, recordId: string) {
    const { data } = await api.get<{ data: ContactProjectLink[]; summary: PersonSummary }>(`${base(tenantId)}/projects/by-record/${recordId}`);
    return data;
  },
  // Cara pública del proyecto
  // Postulantes y encuestadores del proyecto
  // Estudios del proyecto
  async ledger(tenantId: string, profileId: string, page = 1) {
    const { data } = await api.get<LedgerPage>(`${base(tenantId)}/profiles/${profileId}/ledger`, { params: { page } });
    return data;
  },
  async registerPayout(tenantId: string, profileId: string, input: { amount: number; currency: string; paidAt?: string; reference?: string | null; note?: string | null; paymentMethodId?: string | null }) {
    const { data } = await api.post<{ id: string; balance: number; currency: string }>(`${base(tenantId)}/profiles/${profileId}/payouts`, input);
    return data;
  },
  async registerAdjustment(tenantId: string, profileId: string, input: { amount: number; currency: string; note: string }) {
    const { data } = await api.post<{ id: string }>(`${base(tenantId)}/profiles/${profileId}/adjustments`, input);
    return data;
  },
  async balances(tenantId: string, search?: string) {
    const { data } = await api.get<{ data: BalanceRow[]; totals: Array<{ currency: string; total: number }> }>(`${base(tenantId)}/payouts/balances`, { params: { search: search || undefined } });
    return data;
  },
  /** Lotes programados del estudio en este proyecto (solo lectura). */
  // Portal del encuestador
  async portalConfig(tenantId: string) {
    const { data } = await api.get<{ config: PortalConfig; fields: PortalFieldDef[] }>(`${base(tenantId)}/portal-config`);
    return data;
  },
  async savePortalConfig(tenantId: string, config: PortalConfig) {
    const { data } = await api.put<{ config: PortalConfig }>(`${base(tenantId)}/portal-config`, config);
    return data.config;
  },
  async saveLanding(tenantId: string, landing: LandingConfig) {
    const { data } = await api.put<{ landing: LandingConfig }>(`${base(tenantId)}/portal-landing`, landing);
    return data.landing;
  },
  async uploadLandingImage(tenantId: string, slot: LandingImageSlot, file: File) {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post<{ url: string }>(`${base(tenantId)}/portal-landing/images/${slot}`, form);
    return data.url;
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
