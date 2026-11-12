import { api } from "./api";

/**
 * Cliente API del módulo Automatizaciones (canvas de flujos con integraciones).
 * Espejo de backend/src/automatizaciones.
 */

export type AutomationNodeType =
  | "trigger_manual"
  | "trigger_webhook"
  | "trigger_schedule"
  | "trigger_contact_created"
  | "trigger_message_received"
  | "trigger_conversation_created"
  | "condition"
  | "loop"
  | "set_variable"
  | "delay"
  | "stop"
  | "http_request"
  | "send_email"
  | "slack"
  | "discord"
  | "telegram"
  | "ai_prompt"
  | "send_message"
  | "contact_upsert"
  | "contact_find";

export interface AutomationNodeData {
  label?: string;
  onError?: "stop" | "continue";
  retries?: number;
  notes?: string;
  [key: string]: unknown;
}

export interface AutomationNode {
  id: string;
  type: AutomationNodeType;
  position: { x: number; y: number };
  data: AutomationNodeData;
}

export interface AutomationEdge {
  id: string;
  source: string;
  sourceHandle?: string | null;
  target: string;
}

export type AutomationStatus = "draft" | "active" | "inactive";

export interface AutomationSummary {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  status: AutomationStatus;
  settings: { timezone?: string } | null;
  webhookToken: string;
  triggerType: AutomationNodeType | null;
  nodeCount: number;
  runCount: number;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Automation extends AutomationSummary {
  nodes: AutomationNode[];
  edges: AutomationEdge[];
}

export interface AutomationStepLog {
  nodeId: string;
  type: string;
  label: string;
  status: "success" | "error" | "skipped";
  startedAt: string;
  durationMs: number;
  attempts: number;
  input?: unknown;
  output?: unknown;
  error?: string;
  iteration?: number;
}

export type AutomationRunStatus = "running" | "success" | "error";

export interface AutomationRun {
  id: string;
  tenantId: string;
  automationId: string;
  automationName?: string;
  status: AutomationRunStatus;
  triggerType: string;
  triggerData: unknown;
  steps: AutomationStepLog[];
  stepCount?: number;
  error: string | null;
  result: unknown;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface ConnectionTypeDef {
  type: string;
  label: string;
  fields: { key: string; label: string; secret: boolean }[];
}

export interface AutomationConnection {
  id: string;
  name: string;
  type: string;
  visible: Record<string, string>;
  secretsSet: string[];
  updatedAt: string;
}

export interface InboxOption {
  id: string;
  name: string;
  channel: string;
}

export interface GraphIssue {
  nodeId?: string;
  message: string;
}

export const automationsApi = {
  list: (tenantId: string) =>
    api.get<AutomationSummary[]>("/automatizaciones", { params: { tenantId } }).then((r) => r.data),

  get: (id: string, tenantId: string) =>
    api.get<Automation>(`/automatizaciones/${id}`, { params: { tenantId } }).then((r) => r.data),

  create: (tenantId: string, name: string, description?: string) =>
    api.post<Automation>("/automatizaciones", { tenantId, name, description: description || null }).then((r) => r.data),

  update: (
    id: string,
    tenantId: string,
    patch: Partial<Pick<Automation, "name" | "description" | "status" | "nodes" | "edges" | "settings">>,
  ) => api.put<Automation>(`/automatizaciones/${id}`, { tenantId, ...patch }).then((r) => r.data),

  remove: (id: string, tenantId: string) =>
    api.delete(`/automatizaciones/${id}`, { params: { tenantId } }),

  duplicate: (id: string, tenantId: string) =>
    api.post<Automation>(`/automatizaciones/${id}/duplicate`, { tenantId }).then((r) => r.data),

  rotateWebhook: (id: string, tenantId: string) =>
    api.post<Automation>(`/automatizaciones/${id}/rotate-webhook`, { tenantId }).then((r) => r.data),

  run: (id: string, tenantId: string, input?: Record<string, unknown>) =>
    api.post<AutomationRun>(`/automatizaciones/${id}/run`, { tenantId, input }).then((r) => r.data),

  runs: (id: string, tenantId: string) =>
    api.get<AutomationRun[]>(`/automatizaciones/${id}/runs`, { params: { tenantId } }).then((r) => r.data),

  tenantRuns: (tenantId: string) =>
    api.get<AutomationRun[]>("/automatizaciones/runs", { params: { tenantId } }).then((r) => r.data),

  getRun: (runId: string, tenantId: string) =>
    api.get<AutomationRun>(`/automatizaciones/runs/${runId}`, { params: { tenantId } }).then((r) => r.data),

  inboxes: (tenantId: string) =>
    api.get<InboxOption[]>("/automatizaciones/inboxes", { params: { tenantId } }).then((r) => r.data),

  connectionTypes: (tenantId: string) =>
    api.get<ConnectionTypeDef[]>("/automatizaciones/connection-types", { params: { tenantId } }).then((r) => r.data),

  connections: (tenantId: string) =>
    api.get<AutomationConnection[]>("/automatizaciones/connections", { params: { tenantId } }).then((r) => r.data),

  createConnection: (tenantId: string, body: { name: string; type: string; data: Record<string, string> }) =>
    api.post<AutomationConnection>("/automatizaciones/connections", { tenantId, ...body }).then((r) => r.data),

  updateConnection: (id: string, tenantId: string, body: { name: string; data: Record<string, string> }) =>
    api.put<AutomationConnection>(`/automatizaciones/connections/${id}`, { tenantId, ...body }).then((r) => r.data),

  removeConnection: (id: string, tenantId: string) =>
    api.delete(`/automatizaciones/connections/${id}`, { params: { tenantId } }),
};

export const statusLabels: Record<AutomationStatus, string> = {
  draft: "Borrador",
  active: "Activa",
  inactive: "Inactiva",
};

export const statusColors: Record<AutomationStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  inactive: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

/** Mensaje legible de un error de axios (incluye los `issues` de validación). */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { message?: string | string[]; issues?: GraphIssue[] } } })?.response?.data;
  if (data?.issues?.length) return data.issues.map((i) => i.message).join(" · ");
  if (Array.isArray(data?.message)) return data.message.join(", ");
  return data?.message || fallback;
}
