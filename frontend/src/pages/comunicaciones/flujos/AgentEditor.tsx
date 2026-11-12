import { useEffect, useState } from "react";
import { Bot as BotIcon, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { NumberField } from "@/components/ui/number-field";
import { FlowSelect, type SelectOption } from "./FlowSelect";
import { Toggle } from "./Toggle";
import { AiModePicker } from "./AiModePicker";
import { VariableTextarea } from "./VariableField";
import { VARIABLE_GROUP_LABELS, type VariableOption } from "./variables";
import { AGENT_DEFAULT_TURNS, AGENT_MAX_COLLECT, AGENT_MAX_OUTCOMES, AGENT_MAX_TURNS } from "./agent";
import { flowsApi, shortId, type FlowAgentConfig, type FlowAgentOutcome, type FlowNodeData } from "./types";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";
const smallInput =
  "w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";
const labelClass = "block text-xs font-medium text-foreground mb-1";
const hintClass = "text-[11px] text-muted-foreground mt-1";

interface BotSummary {
  id: string;
  name: string;
  type: string;
  status: string;
}

interface Props {
  nodeId: string;
  data: FlowNodeData;
  set: (patch: Partial<FlowNodeData>) => void;
  options: VariableOption[];
  tenantId?: string;
}

/** Editor del nodo «Conversación con IA». */
export function AgentEditor({ nodeId, data, set, options, tenantId }: Props) {
  const agent: FlowAgentConfig = data.agent ?? { source: "custom", outcomes: [] };
  const setAgent = (patch: Partial<FlowAgentConfig>) => set({ agent: { ...agent, ...patch } });
  const bots = useBots(tenantId);
  const crmOptions: SelectOption[] = [
    { value: "", label: "No guardar en el CRM" },
    ...options
      .filter((o) => o.writable && (o.group === "crm" || o.group === "custom"))
      .map((o) => ({ value: o.key, label: o.label, hint: o.key, group: VARIABLE_GROUP_LABELS[o.group] })),
  ];

  const outcomes = agent.outcomes;
  const setOutcome = (id: string, patch: Partial<FlowAgentOutcome>) =>
    setAgent({ outcomes: outcomes.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const collect = agent.collect ?? [];
  const setCollect = (i: number, patch: Partial<(typeof collect)[number]>) =>
    setAgent({ collect: collect.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  const selectedBot = bots?.find((b) => b.id === agent.botId);

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-muted-foreground">
        La IA conversa con el contacto durante varios mensajes. Cuando llega a uno de los resultados, el flujo sigue por
        la salida de ese resultado.
      </p>

      <Section title="Quién conversa">
        <div role="radiogroup" aria-label="Quién conversa" className="grid grid-cols-2 gap-1.5">
          {(
            [
              { value: "custom", label: "Instrucciones propias", description: "Escribes el objetivo aquí" },
              { value: "bot", label: "Un bot existente", description: "Usa su conocimiento y herramientas" },
            ] as const
          ).map((o) => {
            const active = agent.source === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setAgent({ source: o.value })}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-left transition-colors",
                  active ? "border-brand-400 bg-brand-100 dark:bg-brand-900/40" : "border-border bg-card hover:bg-muted",
                )}
              >
                <span className={cn("block text-xs font-medium", active ? "text-brand-800 dark:text-brand-100" : "text-foreground")}>
                  {o.label}
                </span>
                <span className="block text-[10px] text-muted-foreground">{o.description}</span>
              </button>
            );
          })}
        </div>

        {agent.source === "bot" && (
          <div>
            <label className={labelClass} htmlFor={`${nodeId}-bot`}>
              Bot
            </label>
            <FlowSelect
              id={`${nodeId}-bot`}
              searchable={(bots?.length ?? 0) > 8}
              value={agent.botId || ""}
              onChange={(v) => setAgent({ botId: v || undefined })}
              placeholder={bots === null ? "Cargando bots…" : "Elige un bot…"}
              options={[
                ...(agent.botId && bots && !selectedBot ? [{ value: agent.botId, label: "(bot no disponible)" }] : []),
                ...(bots ?? []).map((b) => ({
                  value: b.id,
                  label: b.name,
                  hint: b.status === "active" ? undefined : b.status === "draft" ? "borrador" : "inactivo",
                })),
              ]}
            />
            <p className={hintClass}>
              {bots && bots.length === 0
                ? "No hay bots conversacionales. Créalos en Comunicaciones → Bots."
                : "Se usan su prompt, su base de conocimiento y sus herramientas. Los bots de pasos (secuenciales) no aparecen."}
            </p>
          </div>
        )}

        <div>
          <label className={labelClass} htmlFor={`${nodeId}-instr`}>
            {agent.source === "bot" ? "Instrucciones para este tramo (opcional)" : "Objetivo e instrucciones"}
          </label>
          <textarea
            id={`${nodeId}-instr`}
            rows={5}
            maxLength={4000}
            value={agent.instructions || ""}
            onChange={(e) => setAgent({ instructions: e.target.value || undefined })}
            placeholder={
              agent.source === "bot"
                ? "En este punto enfócate en resolver dudas sobre los planes."
                : "Eres el asistente de la tienda. Resuelve dudas sobre los planes Básico ($50.000) y Premium ($90.000) y averigua cuál le interesa. No ofrezcas descuentos."
            }
            className={cn(inputClass, "resize-y")}
          />
          {agent.source === "custom" && (
            <p className={hintClass}>Incluye la información que necesita (precios, horarios, políticas): no la inventará.</p>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor={`${nodeId}-first`}>
            Primer mensaje (opcional)
          </label>
          <VariableTextarea
            id={`${nodeId}-first`}
            rows={2}
            value={agent.firstMessage || ""}
            onChange={(v) => setAgent({ firstMessage: v || undefined })}
            placeholder="¡Hola {{contact_name}}! Cuéntame qué dudas tienes."
            className={cn(inputClass, "resize-y")}
          />
          <p className={hintClass}>Si lo dejas vacío, la IA escribe el saludo según el objetivo.</p>
        </div>
      </Section>

      <Section title="Resultados">
        <p className="text-[11px] text-muted-foreground">
          Cada resultado es una salida del nodo. Describe cuándo debe elegirlo la IA.
        </p>
        {outcomes.map((o, i) => (
          <div key={o.id} className="space-y-1.5 rounded-lg border border-border bg-card p-2">
            <div className="flex items-center gap-1.5">
              <input
                aria-label={`Nombre del resultado ${i + 1}`}
                value={o.name}
                maxLength={40}
                onChange={(e) => setOutcome(o.id, { name: e.target.value })}
                placeholder="Quiere comprar"
                className={cn(smallInput, "font-medium")}
              />
              <button
                type="button"
                aria-label={`Eliminar resultado ${i + 1}`}
                disabled={outcomes.length <= 1}
                onClick={() => setAgent({ outcomes: outcomes.filter((x) => x.id !== o.id) })}
                className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-red-600 disabled:opacity-30 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <input
              aria-label={`Cuándo elegir el resultado ${i + 1}`}
              value={o.description || ""}
              maxLength={300}
              onChange={(e) => setOutcome(o.id, { description: e.target.value || undefined })}
              placeholder="Cuando pide precio, quiere pagar o pregunta cómo comprar"
              className={smallInput}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setAgent({ outcomes: [...outcomes, { id: shortId("o"), name: `Resultado ${outcomes.length + 1}` }] })
          }
          disabled={outcomes.length >= AGENT_MAX_OUTCOMES}
          className="flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline disabled:opacity-40 dark:text-brand-300"
        >
          <Plus className="h-3 w-3" />
          {outcomes.length >= AGENT_MAX_OUTCOMES ? `Máximo ${AGENT_MAX_OUTCOMES} resultados` : "Agregar resultado"}
        </button>
        <p className={hintClass}>
          Queda guardado en <code className="font-mono">{"{{ai_outcome}}"}</code> y el resumen de la IA en{" "}
          <code className="font-mono">{"{{ai_summary}}"}</code>.
        </p>
      </Section>

      <Section title="Datos a averiguar">
        {collect.map((c, i) => (
          <div key={i} className="space-y-1.5 rounded-lg border border-border bg-card p-2">
            <div className="flex items-center gap-1.5">
              <input
                aria-label={`Variable del dato ${i + 1}`}
                value={c.variable}
                onChange={(e) => setCollect(i, { variable: e.target.value.replace(/[^\w]/g, "").slice(0, 50) })}
                placeholder="presupuesto"
                className={cn(smallInput, "font-mono")}
              />
              <button
                type="button"
                aria-label={`Eliminar dato ${i + 1}`}
                onClick={() => setAgent({ collect: collect.filter((_, j) => j !== i) })}
                className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-red-600 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <input
              aria-label={`Qué dato es (${i + 1})`}
              value={c.description}
              maxLength={200}
              onChange={(e) => setCollect(i, { description: e.target.value })}
              placeholder="El presupuesto aproximado en pesos"
              className={smallInput}
            />
            <FlowSelect
              compact
              searchable
              aria-label={`Campo del CRM del dato ${i + 1}`}
              value={c.saveToField || ""}
              onChange={(v) => setCollect(i, { saveToField: v || undefined })}
              placeholder="No guardar en el CRM"
              options={crmOptions}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setAgent({ collect: [...collect, { variable: "", description: "" }] })}
          disabled={collect.length >= AGENT_MAX_COLLECT}
          className="flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline disabled:opacity-40 dark:text-brand-300"
        >
          <Plus className="h-3 w-3" />
          {collect.length >= AGENT_MAX_COLLECT ? `Máximo ${AGENT_MAX_COLLECT} datos` : "Agregar dato"}
        </button>
        <p className={hintClass}>La IA los pregunta con naturalidad y los guarda en cuanto el contacto los da.</p>
      </Section>

      <Section title="Límites y comportamiento">
        <label className="block">
          <span className={labelClass}>Máximo de mensajes del contacto</span>
          <NumberField
            value={agent.maxTurns ?? null}
            onChange={(n) => setAgent({ maxTurns: n == null ? undefined : n })}
            min={1}
            max={AGENT_MAX_TURNS}
            decimals={0}
            placeholder={String(AGENT_DEFAULT_TURNS)}
          />
        </label>
        <p className={hintClass}>
          Al llegar al límite sin resultado sigue por <strong>Límite de mensajes</strong>. Controla el costo y evita
          conversaciones sin fin.
        </p>
        <Toggle
          checked={agent.allowHandoff !== false}
          onChange={(v) => setAgent({ allowHandoff: v ? undefined : false })}
          label="Permitir transferir a un agente"
          description="Si el contacto pide una persona o la IA no puede ayudar, sale por «Transferir a agente». Sin nada conectado, se transfiere directamente."
        />
        <AiModePicker value={agent.mode} onChange={(mode) => setAgent({ mode })} />
        <p className="text-[11px] text-muted-foreground">
          {agent.source === "bot" && selectedBot ? (
            <>
              <BotIcon className="mr-1 inline h-3 w-3" aria-hidden />
              Sin modo elegido se usa el del bot.{" "}
            </>
          ) : null}
          Usa el modelo de IA predeterminado de tu cuenta y consume créditos por cada mensaje según los tokens. Si la IA
          falla, sigue por <strong>Si la IA falla</strong>; sin esa salida, la conversación pasa al bot o a un agente.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

/** Bots conversacionales del tenant (null mientras carga). */
function useBots(tenantId?: string): BotSummary[] | null {
  const [bots, setBots] = useState<BotSummary[] | null>(null);
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    flowsApi
      .get<BotSummary[]>("/bots", { params: { tenantId } })
      .then(({ data }) => !cancelled && setBots(data.filter((b) => b.type !== "sequential")))
      .catch(() => !cancelled && setBots([]));
    return () => {
      cancelled = true;
    };
  }, [tenantId]);
  return bots;
}
