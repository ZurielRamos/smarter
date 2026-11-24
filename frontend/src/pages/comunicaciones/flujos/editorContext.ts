import { createContext } from "react";
import type { ConversationFlowSummary, InboxOption, LabelOption } from "./types";
import type { VariableOption } from "./variables";

/**
 * Variables que ofrece el dropdown al escribir `{` o `{{` en cualquier campo de
 * texto del editor (del flujo, campos del CRM, personalizados y especiales).
 */
export const FlowVariablesContext = createContext<VariableOption[]>([]);

/** Datos compartidos que los nodos necesitan para mostrar nombres (flujos, etiquetas). */
/** Proyecto de reclutamiento que se puede elegir en las acciones de proyecto. */
export interface FlowProjectOption {
  id: string;
  name: string;
  status: string;
  roles: Array<"participant" | "surveyor" | "moderator">;
  defaultRole: "participant" | "surveyor" | "moderator";
}
export interface FlowEditorContextValue {
  flows: ConversationFlowSummary[];
  labels: LabelOption[];
  inboxes: InboxOption[];
  currentFlowId: string;
  /** Con Reclutamiento activo (y permiso para verlo): proyectos y estados para las acciones de proyecto. */
  recruitment?: { projects: FlowProjectOption[]; states: Array<{ key: string; label: string; help: string }> } | null;
}
export const FlowEditorContext = createContext<FlowEditorContextValue>({ flows: [], labels: [], inboxes: [], currentFlowId: "", recruitment: null });

/** Canales donde se ejecutan los flujos (mismo criterio que el backend). */
export const FLOW_CHANNELS = new Set(["whatsapp", "messenger", "instagram", "chat", "evolution"]);

export { EMPTY_TRIGGERS } from "./triggers";
