import { useId } from "react";
import { cn } from "@/lib/utils";
import { NumberField } from "@/components/ui/number-field";
import { FlowSelect } from "./FlowSelect";
import { Toggle } from "./Toggle";
import { AiModePicker } from "./AiModePicker";
import { VariableInput } from "./VariableField";
import type { FlowNoMatch, FlowNodeData } from "./types";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";
const labelClass = "block text-xs font-medium text-foreground mb-1";
const hintClass = "text-[11px] text-muted-foreground mt-1";

const DEFAULT_RETRIES = 2;
const MAX_RETRIES = 5;

/**
 * «Si responde otra cosa» en un mensaje con botones: cómo reconocer lo que
 * escribe, qué decirle y cuándo seguir por la salida «Otra respuesta».
 */
export function NoMatchEditor({ data, set }: { data: FlowNodeData; set: (p: Partial<FlowNodeData>) => void }) {
  const id = useId();
  const nm: FlowNoMatch = data.noMatch ?? {};
  const setNm = (patch: Partial<FlowNoMatch>) => {
    const next = { ...nm, ...patch };
    // Sin ajustes se guarda vacío para que los nodos antiguos sigan igual.
    for (const k of Object.keys(next) as (keyof FlowNoMatch)[]) if (next[k] === undefined) delete next[k];
    set({ noMatch: Object.keys(next).length ? next : undefined });
  };
  const mode = nm.mode ?? "retry";
  const repeat = nm.repeatOptions !== false;
  const retries = nm.maxRetries ?? DEFAULT_RETRIES;

  return (
    <fieldset className="rounded-lg border border-border p-2.5 space-y-3">
      <legend className="px-1 text-xs font-medium text-foreground">Si responde otra cosa</legend>
      <p className="text-[11px] text-muted-foreground">
        Si escribe en lugar de pulsar un botón, se reconoce la opción por su título, sus sinónimos, su número («2», «la
        segunda») o pequeños errores de tipeo. Si aun así no es ninguna:
      </p>

      <div>
        <label className={labelClass} htmlFor={`${id}-mode`}>
          Qué hacer
        </label>
        <FlowSelect
          id={`${id}-mode`}
          value={mode}
          onChange={(v) => setNm({ mode: v === "branch" ? "branch" : undefined })}
          options={[
            { value: "retry", label: "Avisar y repetir las opciones" },
            { value: "branch", label: "Seguir por «Otra respuesta» de inmediato" },
          ]}
        />
        <p className={hintClass}>
          {mode === "branch"
            ? "Útil para responder preguntas libres, por ejemplo conectando una Conversación con IA. Sin esa salida conectada, se avisa y se repiten las opciones."
            : `Tras ${retries} ${retries === 1 ? "intento" : "intentos"} sigue por «Otra respuesta». Sin esa salida conectada, el flujo deja la conversación al bot o a un agente.`}
        </p>
      </div>

      {mode === "retry" && (
        <>
          <div>
            <label className={labelClass} htmlFor={`${id}-msg`}>
              Aviso
            </label>
            <VariableInput
              id={`${id}-msg`}
              value={nm.message || ""}
              onChange={(v) => setNm({ message: v || undefined })}
              placeholder={
                repeat
                  ? "No reconocí tu respuesta. Por favor elige una de las opciones:"
                  : "Por favor elige una de las opciones."
              }
              className={inputClass}
            />
            <p className={hintClass}>
              Puedes usar <code className="font-mono">{"{{last_reply}}"}</code> para citar lo que escribió.
            </p>
          </div>
          <Toggle
            checked={repeat}
            onChange={(v) => setNm({ repeatOptions: v ? undefined : false })}
            label="Repetir los botones con el aviso"
            description="Se envía un solo mensaje con el aviso y las opciones, sin volver a mandar el archivo ni los enlaces."
          />
          <label className="block">
            <span className={labelClass}>Intentos antes de seguir por «Otra respuesta»</span>
            <NumberField
              value={nm.maxRetries ?? null}
              onChange={(n) => setNm({ maxRetries: n == null ? undefined : n })}
              min={0}
              max={MAX_RETRIES}
              decimals={0}
              placeholder={String(DEFAULT_RETRIES)}
            />
          </label>
        </>
      )}

      <Toggle
        checked={!!nm.ai}
        onChange={(v) => setNm({ ai: v || undefined, aiMode: v ? nm.aiMode : undefined })}
        label="Entender respuestas libres con IA"
        description="Si el texto no coincide, la IA decide si quiso elegir una opción («necesito ayuda con mi pedido» → Soporte). Consume créditos solo en esos casos."
      />
      {nm.ai && (
        <div className={cn("rounded-lg border border-brand-200 bg-brand-50/40 p-2.5 dark:border-brand-700/50 dark:bg-brand-900/10")}>
          <AiModePicker value={nm.aiMode} onChange={(aiMode) => setNm({ aiMode })} />
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Lo que escribió queda en <code className="font-mono">{"{{last_reply}}"}</code> para usarlo en la rama «Otra
        respuesta».
      </p>
    </fieldset>
  );
}
