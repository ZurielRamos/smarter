import axios from "axios";
import type { ContractDocument, DocumentStatus, FormQuestion, LandingConfig, VerificationChannel } from "./reclutamiento";

/**
 * Cliente del portal público del encuestador. Es independiente del cliente del
 * CRM (`api`): no envía el token del CRM ni redirige a /login, y usa su propio
 * token (cabecera `x-portal-token`), que se guarda por cuenta.
 */
const http = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });

const root = (slug: string) => `/recruit-portal/${encodeURIComponent(slug)}`;
const auth = (token: string) => ({ headers: { "x-portal-token": token } });

export const portalTokenKey = (slug: string) => `recruit_pt_${slug}`;

export interface PortalInfo {
  tenant: { name: string; slug: string; iconPath: string | null };
  verificationChannel: VerificationChannel;
  welcomeMessage: string;
  registration: { open: boolean; consentText: string };
  /** Null si la cuenta no publicó su landing: el portal muestra solo el acceso. */
  landing: LandingConfig | null;
  /** Solo en la dirección de un proyecto. */
  project?: {
    name: string;
    /** Perfiles entre los que elige quien se registra. */
    roles: Array<{ key: "participant" | "surveyor" | "moderator"; label: string; needsApproval: boolean }>;
    defaultRole: "participant" | "surveyor" | "moderator";
    fields: ProjectField[];
    questions: FormQuestion[];
  };
}

/** Dato personal que pide el proyecto al registrarse. */
export interface ProjectField {
  key: string;
  label: string;
  type: "text" | "longtext" | "date" | "select" | "number" | "boolean";
  options?: Array<{ value: string; label: string }>;
  suggestions?: string[];
  maxLength: number;
  required: boolean;
}
/** Lo que la persona ve de su estado (nunca el estado interno). */
export type ProspectStatus = "received" | "in_process" | "selected" | "not_selected" | "finished";
/** Proyecto en el que la persona está registrada, con su estado. */
export interface MyProject {
  slug: string;
  name: string;
  projectStatus: "active" | "paused" | "ended";
  role: "participant" | "surveyor" | "moderator";
  status: ProspectStatus;
  registeredAt: string;
}
/** Lo que ve la persona dentro de la landing de un proyecto. */
export interface ProjectMe {
  project: { name: string; slug: string; status: string };
  person: { name: string; email: string | null; phone: string | null };
  role: "participant" | "surveyor" | "moderator";
  roleLabel: string | null;
  status: ProspectStatus;
  registeredAt: string;
}
export interface ProjectSessionToken {
  sessionToken: string;
  expiresInSec: number;
}
export const projectTokenKey = (slug: string, projectSlug: string) => `recruit_pp_${slug}_${projectSlug}`;

export interface InvitationInfo {
  name: string | null;
  channels: Array<{ channel: "email" | "phone"; masked: string }>;
}

export interface CodeRequested {
  otpId: string;
  channel: "email" | "phone";
  maskedDestination: string;
  expiresInSec: number;
}

export interface PortalField {
  key: string;
  label: string;
  type: "text" | "longtext" | "date" | "select" | "number" | "boolean";
  options?: Array<{ value: string; label: string }>;
  suggestions?: string[];
  maxLength: number;
  required: boolean;
  value: string;
  locked: boolean;
}

export interface PortalDocumentItem {
  key: string;
  label: string;
  help: string;
  required: boolean;
  current: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    status: DocumentStatus;
    rejectReason: string | null;
    uploadedAt: string;
  } | null;
}

export interface PortalContractItem {
  id: string;
  number: string | null;
  title: string | null;
  status: "draft" | "active" | "ended";
  signatureStatus: "unsigned" | "signed";
  signedAt: string | null;
  issueDate: string | null;
  startDate: string;
  endDate: string | null;
  rate: number;
  currency: string;
  sentAt: string;
  canSign: boolean;
}

export interface PortalMe {
  tenant: { name: string; slug: string };
  welcomeMessage: string;
  /** `status` nulo: es un contacto registrado en proyectos que aún no tiene perfil en la cuenta. */
  profile: { status: string | null; name: string | null; email: string | null; phone: string | null };
  verificationChannel: VerificationChannel;
  projects: MyProject[];
  fields: PortalField[];
  documents: PortalDocumentItem[];
  contracts: PortalContractItem[];
  progress: { missingFields: number; missingDocuments: number; contractsToSign: number };
}

export const recruitPortalApi = {
  async info(slug: string) {
    return (await http.get<PortalInfo>(root(slug))).data;
  },
  async invitation(slug: string, token: string) {
    return (await http.get<InvitationInfo>(`${root(slug)}/invitation/${encodeURIComponent(token)}`)).data;
  },
  async requestCode(slug: string, body: { inviteToken?: string; channel: "email" | "phone"; destination?: string }) {
    return (await http.post<CodeRequested>(`${root(slug)}/otp/request`, body)).data;
  },
  async projectInfo(slug: string, projectSlug: string) {
    return (await http.get<PortalInfo>(`${root(slug)}/projects/${encodeURIComponent(projectSlug)}`)).data;
  },
  async requestRegistration(slug: string, body: { fullName: string; channel: "email" | "phone"; destination: string; consent: boolean }) {
    return (await http.post<CodeRequested>(`${root(slug)}/register/request`, body)).data;
  },
  async verifyCode(slug: string, otpId: string, code: string) {
    return (await http.post<{ portalToken: string; expiresInSec: number }>(`${root(slug)}/otp/verify`, { otpId, code })).data;
  },
  /** Registro por la landing de un proyecto: crea el contacto y el prospecto, y abre sesión solo en esa landing. */
  async requestProjectRegistration(
    slug: string,
    projectSlug: string,
    body: {
      fullName: string;
      channel: "email" | "phone";
      destination: string;
      /** El otro dato de contacto: el teléfono si se verifica el correo; el correo (opcional) si se verifica el teléfono. */
      phone?: string;
      email?: string;
      consent: boolean;
      values: Record<string, string>;
      answers: Record<string, unknown>;
      role?: "participant" | "surveyor" | "moderator";
    },
  ) {
    return (await http.post<CodeRequested>(`${root(slug)}/projects/${encodeURIComponent(projectSlug)}/register/request`, body)).data;
  },
  async verifyProjectRegistration(slug: string, projectSlug: string, otpId: string, code: string) {
    return (await http.post<{ status: "applied" | "existing" | "closed" } & Partial<ProjectSessionToken>>(`${root(slug)}/projects/${encodeURIComponent(projectSlug)}/register/verify`, { otpId, code })).data;
  },
  async requestProjectLogin(slug: string, projectSlug: string, body: { channel: "email" | "phone"; destination: string }) {
    return (await http.post<CodeRequested>(`${root(slug)}/projects/${encodeURIComponent(projectSlug)}/login/request`, body)).data;
  },
  async verifyProjectLogin(slug: string, projectSlug: string, otpId: string, code: string) {
    return (await http.post<ProjectSessionToken>(`${root(slug)}/projects/${encodeURIComponent(projectSlug)}/login/verify`, { otpId, code })).data;
  },
  async projectMe(slug: string, projectSlug: string, token: string) {
    return (await http.get<ProjectMe>(`${root(slug)}/projects/${encodeURIComponent(projectSlug)}/me`, auth(token))).data;
  },
  async earnings(slug: string, token: string) {
    return (await http.get<import("./reclutamiento").LedgerPage>(`${root(slug)}/me/earnings`, auth(token))).data;
  },
  async me(slug: string, token: string) {
    return (await http.get<PortalMe>(`${root(slug)}/me`, auth(token))).data;
  },
  async saveData(slug: string, token: string, values: Record<string, string>) {
    return (await http.patch<PortalMe>(`${root(slug)}/me/data`, { values }, auth(token))).data;
  },
  async uploadDocument(slug: string, token: string, docKey: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    return (await http.post<{ id: string; status: DocumentStatus }>(`${root(slug)}/documents/${docKey}`, form, auth(token))).data;
  },
  async deleteDocument(slug: string, token: string, id: string) {
    await http.delete(`${root(slug)}/documents/${id}`, auth(token));
  },
  async documentBlob(slug: string, token: string, id: string) {
    return (await http.get<Blob>(`${root(slug)}/documents/${id}/file`, { ...auth(token), responseType: "blob" })).data;
  },
  async contract(slug: string, token: string, id: string) {
    return (await http.get<ContractDocument>(`${root(slug)}/contracts/${id}`, auth(token))).data;
  },
  async requestSignCode(slug: string, token: string, id: string, channel: "email" | "phone") {
    return (await http.post<CodeRequested>(`${root(slug)}/contracts/${id}/sign/request`, { channel }, auth(token))).data;
  },
  async sign(slug: string, token: string, id: string, otpId: string, code: string) {
    return (await http.post<{ signedAt: string }>(`${root(slug)}/contracts/${id}/sign`, { otpId, code, accept: true }, auth(token))).data;
  },
};

/** Mensaje de error de la API para mostrar al usuario. */
export function portalError(err: unknown, fallback: string): string {
  const m = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (typeof m === "string") return m;
  if (Array.isArray(m) && typeof m[0] === "string") return m[0];
  return fallback;
}

export function isUnauthorized(err: unknown): boolean {
  return (err as { response?: { status?: number } })?.response?.status === 401;
}
