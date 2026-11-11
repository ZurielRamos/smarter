import { createContext } from "react";
import type { ConversationFlowSummary, FlowTriggers, LabelOption } from "./types";

/** Datos compartidos que los nodos necesitan para mostrar nombres (flujos, etiquetas). */
export interface FlowEditorContextValue {
  flows: ConversationFlowSummary[];
  labels: LabelOption[];
  currentFlowId: string;
}

export const FlowEditorContext = createContext<FlowEditorContextValue>({ flows: [], labels: [], currentFlowId: "" });

/** Canales donde se ejecutan los flujos (mismo criterio que el backend). */
export const FLOW_CHANNELS = new Set(["whatsapp", "messenger", "instagram", "chat", "evolution"]);

export const EMPTY_TRIGGERS: FlowTriggers = { keywords: [], matchType: "exact", onNewConversation: false, inboxIds: [] };
