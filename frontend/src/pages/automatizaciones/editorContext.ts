import { createContext, useContext } from "react";
import type { AutomationConnection, AutomationNode, InboxOption } from "@/services/automatizaciones";

export interface NodeRunInfo {
  status: "success" | "error" | "skipped";
  durationMs: number;
}

export interface EditorContextValue {
  tenantId: string;
  automationId: string;
  webhookToken: string;
  /** Estado de la última ejecución mostrada, por id de nodo. */
  runInfo: Record<string, NodeRunInfo>;
  /** Nodos con problemas de configuración (al intentar activar). */
  issueNodeIds: Set<string>;
  connections: AutomationConnection[];
  inboxes: InboxOption[];
  reloadConnections: () => void;
  /** Nodos actuales, para sugerir variables `{{steps.<id>...}}`. */
  nodes: AutomationNode[];
  onRotateWebhook: () => Promise<void>;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor fuera de EditorContext");
  return ctx;
}
