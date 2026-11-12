import type { FlowAgentConfig } from "./types";

/** Límites del nodo «Conversación con IA» (mismos que el servidor). */
export const AGENT_MAX_OUTCOMES = 8;
export const AGENT_MAX_COLLECT = 10;
export const AGENT_DEFAULT_TURNS = 10;
export const AGENT_MAX_TURNS = 30;

/** Qué le falta al nodo para funcionar (se muestra en el lienzo). */
export function agentIssue(agent: FlowAgentConfig | undefined): string | null {
  if (!agent) return "Configura la conversación";
  if (agent.source === "bot" && !agent.botId) return "Elige un bot";
  if (agent.source === "custom" && !agent.instructions?.trim()) return "Escribe el objetivo";
  if (!agent.outcomes.some((o) => o.name.trim())) return "Agrega al menos un resultado";
  if ((agent.collect || []).some((c) => !c.variable || !c.description.trim())) return "Completa los datos a averiguar";
  return null;
}
