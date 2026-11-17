import axios from "axios";
import type { ContractDocument, DocumentStatus, VerificationChannel } from "./reclutamiento";

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
}

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
  profile: { status: string; name: string | null; email: string | null; phone: string | null };
  verificationChannel: VerificationChannel;
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
  async verifyCode(slug: string, otpId: string, code: string) {
    return (await http.post<{ portalToken: string; expiresInSec: number }>(`${root(slug)}/otp/verify`, { otpId, code })).data;
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
