import { api } from "./api";
import type { DeduplicatePreviewResult, DeduplicateStrategy, ImportJob, MappingConfig, TargetField, ValidationPreviewResult } from "../types";

/**
 * Cliente API del módulo Empresas. Espejo de backend/src/companies. El tenant
 * va en la ruta.
 */

export type OrganizationType = "client" | "establishment" | "other";
export type OrganizationStatus = "active" | "inactive";
export type ContactOrgRole = "owner" | "manager" | "employee" | "other";

export const ORGANIZATION_TYPE_LABELS: Record<OrganizationType, string> = {
  client: "Cliente",
  establishment: "Establecimiento",
  other: "Otro",
};

export type OrganizationSize = "micro" | "small" | "medium" | "large";
export type EmployeeRange = "1-10" | "11-50" | "51-200" | "201-500" | "501-1000" | "1001-5000" | "5001+";

export const SIZE_LABELS: Record<OrganizationSize, string> = {
  micro: "Microempresa",
  small: "Pequeña",
  medium: "Mediana",
  large: "Grande",
};

export const EMPLOYEE_RANGE_LABELS: Record<EmployeeRange, string> = {
  "1-10": "1 a 10",
  "11-50": "11 a 50",
  "51-200": "51 a 200",
  "201-500": "201 a 500",
  "501-1000": "501 a 1.000",
  "1001-5000": "1.001 a 5.000",
  "5001+": "Más de 5.000",
};

export interface OrganizationPhone {
  number: string;
  label?: string | null;
}

export const CONTACT_ROLE_LABELS: Record<ContactOrgRole, string> = {
  owner: "Dueño",
  manager: "Gerente",
  employee: "Empleado",
  other: "Otro",
};

export interface Organization {
  id: string;
  tenantId: string;
  parentId: string | null;
  name: string;
  type: OrganizationType;
  status: OrganizationStatus;
  legalName: string | null;
  industry: string | null;
  size: OrganizationSize | null;
  employeeRange: EmployeeRange | null;
  documentType: string | null;
  documentNumber: string | null;
  phones: OrganizationPhone[] | null;
  email: string | null;
  website: string | null;
  address: string | null;
  postalCode: string | null;
  openingHours: string | null;
  tags: string[] | null;
  notes: string | null;
  city: string | null;
  region: string | null;
  countryCode: string | null;
  lat: number | null;
  lng: number | null;
  customData: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationListItem extends Organization {
  parentName: string | null;
  childCount: number;
  contactCount: number;
}

export interface OrganizationContact {
  linkId: string;
  role: ContactOrgRole;
  recordId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}

export interface OrganizationDetail {
  organization: Organization;
  parent: Pick<Organization, "id" | "name" | "type"> | null;
  children: Pick<Organization, "id" | "name" | "type" | "status" | "city" | "address">[];
  contacts: OrganizationContact[];
}

/** Campos editables. Al editar solo se envían los que cambian. */
export type OrganizationInput = Partial<
  Pick<
    Organization,
    | "name"
    | "type"
    | "status"
    | "parentId"
    | "documentType"
    | "documentNumber"
    | "address"
    | "city"
    | "region"
    | "countryCode"
    | "lat"
    | "lng"
    | "legalName"
    | "industry"
    | "size"
    | "employeeRange"
    | "phones"
    | "email"
    | "website"
    | "postalCode"
    | "openingHours"
    | "tags"
    | "notes"
  >
>;

export interface ContactCompany {
  linkId: string;
  role: ContactOrgRole;
  id: string;
  name: string;
  type: OrganizationType;
  city: string | null;
}

export interface MapPoint {
  id: string;
  name: string;
  type: OrganizationType;
  status: OrganizationStatus;
  city: string | null;
  address: string | null;
  lat: number;
  lng: number;
}

export interface MigrationReport {
  dryRun: boolean;
  distinctNames: number;
  toCreate: number;
  existing: number;
  contactsToLink: number;
  skipped: number;
}

const base = (tenantId: string) => `/companies/${tenantId}`;

export const companiesApi = {
  async list(
    tenantId: string,
    params: { search?: string; type?: string; status?: string; parentId?: string; page?: number; limit?: number },
  ) {
    const { data } = await api.get<{ data: OrganizationListItem[]; total: number; page: number; limit: number }>(
      base(tenantId),
      { params },
    );
    return data;
  },

  async detail(tenantId: string, id: string) {
    const { data } = await api.get<OrganizationDetail>(`${base(tenantId)}/${id}`);
    return data;
  },

  async create(tenantId: string, body: OrganizationInput) {
    const { data } = await api.post<Organization>(base(tenantId), body);
    return data;
  },

  async update(tenantId: string, id: string, body: OrganizationInput) {
    const { data } = await api.patch<Organization>(`${base(tenantId)}/${id}`, body);
    return data;
  },

  async remove(tenantId: string, id: string) {
    await api.delete(`${base(tenantId)}/${id}`);
  },

  async linkContact(tenantId: string, id: string, body: { recordId: string; role: ContactOrgRole }) {
    const { data } = await api.post(`${base(tenantId)}/${id}/contacts`, body);
    return data;
  },

  async unlinkContact(tenantId: string, id: string, linkId: string) {
    await api.delete(`${base(tenantId)}/${id}/contacts/${linkId}`);
  },

  async byContact(tenantId: string, recordId: string) {
    const { data } = await api.get<{ data: ContactCompany[] }>(`${base(tenantId)}/by-contact/${recordId}`);
    return data.data;
  },

  async mapPoints(tenantId: string, params: { search?: string; type?: string; status?: string }) {
    const { data } = await api.get<{ data: MapPoint[]; total: number; truncated: boolean }>(`${base(tenantId)}/map`, {
      params,
    });
    return data;
  },

  async migrateFromContacts(tenantId: string, dryRun: boolean) {
    const { data } = await api.post<MigrationReport>(`${base(tenantId)}/migrate-from-contacts`, { dryRun });
    return data;
  },
};

/** Parámetros comunes de los pasos de la importación de empresas. */
export interface CompanyImportParams {
  fileId: string;
  mapping: MappingConfig;
  transforms?: Record<string, unknown>;
  matchFields?: string[];
  deduplicateStrategy?: DeduplicateStrategy;
  overwriteFields?: string[];
  headers?: string[];
  templateName?: string;
}

const importBase = (tenantId: string) => `/companies/${tenantId}/import`;

/** Importación de empresas desde archivo. El archivo se sube con los endpoints del ETL (`entity=companies`). */
export const companiesImportApi = {
  async targetFields(tenantId: string) {
    const { data } = await api.get<TargetField[]>(`${importBase(tenantId)}/target-fields`);
    return data;
  },

  async validatePreview(tenantId: string, params: CompanyImportParams) {
    const { data } = await api.post<ValidationPreviewResult>(`${importBase(tenantId)}/validate-preview`, params);
    return data;
  },

  async deduplicatePreview(tenantId: string, params: CompanyImportParams) {
    const { data } = await api.post<DeduplicatePreviewResult>(`${importBase(tenantId)}/deduplicate-preview`, params);
    return data;
  },

  async execute(tenantId: string, params: CompanyImportParams) {
    const { data } = await api.post<ImportJob>(`${importBase(tenantId)}/execute`, params);
    return data;
  },
};
