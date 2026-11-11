import { Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACTION_LABELS,
  MAX_BUTTONS,
  MAX_BUTTON_TITLE,
  NODE_LABELS,
  OPERATOR_LABELS,
  VALIDATION_LABELS,
  WA_REPLY_BUTTON_TITLE,
  shortId,
  type ConversationFlowSummary,
  type FlowAction,
  type FlowActionType,
  type FlowConditionOperator,
  type FlowInputValidation,
  type FlowNodeData,
  type FlowNodeType,
  type LabelOption,
} from "./types";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";
const labelClass = "block text-xs font-medium text-foreground mb-1";
const hintClass = "text-[11px] text-muted-foreground mt-1";

interface NodeInspectorProps {
  nodeId: string;
  type: FlowNodeType;
  data: FlowNodeData;
  flows: ConversationFlowSummary[];
  currentFlowId: string;
  labels: LabelOption[];
  variables: string[];
  onChange: (data: FlowNodeData) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function NodeInspector({
  nodeId,
  type,
  data,
  flows,
  currentFlowId,
  labels,
  variables,
  onChange,
  onDelete,
  onClose,
}: NodeInspectorProps) {
  const set = (patch: Partial<FlowNodeData>) => onChange({ ...data, ...patch });
  const variableListId = `vars-${nodeId}`;

  return (
    <aside className="w-80 shrink-0 border-l border-border bg-card flex flex-col min-h-0" aria-label="Editar nodo">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{NODE_LABELS[type]}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar panel"
          className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <datalist id={variableListId}>
        {variables.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {type === "start" && (
          <p className="text-xs text-muted-foreground">
            Punto de entrada del flujo. Conecta su salida con el primer paso. Los disparadores (palabras clave, conversación
            nueva) se configuran en el botón <strong>Disparadores</strong> de la barra superior.
          </p>
        )}

        {type === "message" && <MessageFields data={data} set={set} />}

        {type === "user_input" && (
          <>
            <div>
              <label className={labelClass} htmlFor={`${nodeId}-text`}>
                Pregunta
              </label>
              <textarea
                id={`${nodeId}-text`}
                rows={4}
                value={data.text || ""}
                onChange={(e) => set({ text: e.target.value })}
                placeholder="¿Cuál es tu correo electrónico?"
                className={cn(inputClass, "resize-y")}
              />
              <VariableHint />
            </div>
            <div>
              <label className={labelClass} htmlFor={`${nodeId}-var`}>
                Guardar respuesta en la variable
              </label>
              <input
                id={`${nodeId}-var`}
                list={variableListId}
                value={data.variable || ""}
                onChange={(e) => set({ variable: e.target.value.replace(/[^\w]/g, "") })}
                placeholder="email"
                className={cn(inputClass, "font-mono")}
              />
              <p className={hintClass}>Letras, números y guion bajo. Úsala luego como {"{{variable}}"}.</p>
            </div>
            <div>
              <label className={labelClass} htmlFor={`${nodeId}-val`}>
                Validación
              </label>
              <select
                id={`${nodeId}-val`}
                value={data.validation || "any"}
                onChange={(e) => set({ validation: e.target.value as FlowInputValidation })}
                className={inputClass}
              >
                {Object.entries(VALIDATION_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor={`${nodeId}-err`}>
                Mensaje si la respuesta no es válida
              </label>
              <input
                id={`${nodeId}-err`}
                value={data.errorMessage || ""}
                onChange={(e) => set({ errorMessage: e.target.value })}
                placeholder="Por favor escribe un correo válido."
                className={inputClass}
              />
              <p className={hintClass}>Tras 3 respuestas no válidas el flujo deja la conversación al bot o al agente.</p>
            </div>
          </>
        )}

        {type === "action" && (
          <ActionFields data={data} set={set} labels={labels} variableListId={variableListId} />
        )}

        {type === "condition" && (
          <>
            <div>
              <label className={labelClass} htmlFor={`${nodeId}-cvar`}>
                Variable
              </label>
              <input
                id={`${nodeId}-cvar`}
                list={variableListId}
                value={data.conditionVariable || ""}
                onChange={(e) => set({ conditionVariable: e.target.value.replace(/[^\w]/g, "") })}
                placeholder="last_button"
                className={cn(inputClass, "font-mono")}
              />
              <p className={hintClass}>
                <code className="font-mono">last_button</code> guarda el título del último botón pulsado.
              </p>
            </div>
            <div>
              <label className={labelClass} htmlFor={`${nodeId}-op`}>
                Operador
              </label>
              <select
                id={`${nodeId}-op`}
                value={data.conditionOperator || "equals"}
                onChange={(e) => set({ conditionOperator: e.target.value as FlowConditionOperator })}
                className={inputClass}
              >
                {Object.entries(OPERATOR_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            {data.conditionOperator !== "is_set" && data.conditionOperator !== "is_not_set" && (
              <div>
                <label className={labelClass} htmlFor={`${nodeId}-cval`}>
                  Valor
                </label>
                <input
                  id={`${nodeId}-cval`}
                  value={data.conditionValue || ""}
                  onChange={(e) => set({ conditionValue: e.target.value })}
                  className={inputClass}
                />
                <p className={hintClass}>No distingue mayúsculas ni tildes.</p>
              </div>
            )}
          </>
        )}

        {type === "start_flow" && (
          <div>
            <label className={labelClass} htmlFor={`${nodeId}-flow`}>
              Flujo a iniciar
            </label>
            <select
              id={`${nodeId}-flow`}
              value={data.targetFlowId || ""}
              onChange={(e) => set({ targetFlowId: e.target.value || undefined })}
              className={inputClass}
            >
              <option value="">Selecciona un flujo…</option>
              {flows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.id === currentFlowId ? " (este flujo)" : ""}
                </option>
              ))}
            </select>
            <p className={hintClass}>
              El contacto continúa en el inicio del flujo seleccionado. Las variables se conservan. El flujo destino no
              necesita estar activo.
            </p>
          </div>
        )}
      </div>

      {type !== "start" && (
        <div className="px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={onDelete}
            className="flex w-full items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-500/30 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar nodo
          </button>
        </div>
      )}
    </aside>
  );
}

function VariableHint() {
  return (
    <p className={hintClass}>
      Usa <code className="font-mono">{"{{variable}}"}</code> o <code className="font-mono">{"{{contact_name}}"}</code> para
      personalizar.
    </p>
  );
}

function MessageFields({ data, set }: { data: FlowNodeData; set: (p: Partial<FlowNodeData>) => void }) {
  const buttons = data.buttons || [];
  const titleLimit = buttons.length <= 3 ? WA_REPLY_BUTTON_TITLE : MAX_BUTTON_TITLE;

  const updateButton = (id: string, title: string) =>
    set({ buttons: buttons.map((b) => (b.id === id ? { ...b, title: title.slice(0, MAX_BUTTON_TITLE) } : b)) });

  return (
    <>
      <div>
        <label className={labelClass} htmlFor="msg-text">
          Texto
        </label>
        <textarea
          id="msg-text"
          rows={5}
          value={data.text || ""}
          onChange={(e) => set({ text: e.target.value })}
          placeholder="¡Hola! ¿En qué podemos ayudarte?"
          className={cn(inputClass, "resize-y")}
        />
        <VariableHint />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className={labelClass}>
            Botones ({buttons.length}/{MAX_BUTTONS})
          </span>
          <button
            type="button"
            disabled={buttons.length >= MAX_BUTTONS}
            onClick={() => set({ buttons: [...buttons, { id: shortId("b"), title: "" }] })}
            className="flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-200 hover:underline disabled:opacity-40 disabled:no-underline"
          >
            <Plus className="h-3 w-3" /> Agregar
          </button>
        </div>
        {buttons.length === 0 ? (
          <p className={hintClass}>Sin botones, el flujo continúa directamente al siguiente paso.</p>
        ) : (
          <div className="space-y-2">
            {buttons.map((b, i) => {
              const over = b.title.length > titleLimit;
              return (
                <div key={b.id}>
                  <div className="flex items-center gap-1.5">
                    <input
                      aria-label={`Título del botón ${i + 1}`}
                      value={b.title}
                      onChange={(e) => updateButton(b.id, e.target.value)}
                      placeholder={`Opción ${i + 1}`}
                      className={cn(inputClass, "py-1.5", over && "border-amber-400")}
                    />
                    <button
                      type="button"
                      aria-label={`Eliminar botón ${i + 1}`}
                      onClick={() => set({ buttons: buttons.filter((x) => x.id !== b.id) })}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className={cn("text-[10px] mt-0.5 text-right", over ? "text-amber-600" : "text-muted-foreground")}>
                    {b.title.length}/{titleLimit}
                    {over && " · se recortará en WhatsApp"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 rounded-lg bg-muted/60 p-2.5 text-[11px] text-muted-foreground space-y-1">
          <p>
            <strong className="text-foreground">WhatsApp:</strong> hasta 3 botones de respuesta; de 4 a 10 se envían como
            lista.
          </p>
          <p>
            <strong className="text-foreground">Messenger / Instagram:</strong> respuestas rápidas.
          </p>
          <p>
            <strong className="text-foreground">Chat web y otros:</strong> opciones numeradas; el contacto responde con el
            número o el texto.
          </p>
        </div>
      </div>
    </>
  );
}

function ActionFields({
  data,
  set,
  labels,
  variableListId,
}: {
  data: FlowNodeData;
  set: (p: Partial<FlowNodeData>) => void;
  labels: LabelOption[];
  variableListId: string;
}) {
  const actions = data.actions || [];
  const update = (i: number, patch: Partial<FlowAction>) =>
    set({ actions: actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) });

  return (
    <div className="space-y-3">
      {actions.map((a, i) => (
        <div key={i} className="rounded-lg border border-border p-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <select
              aria-label={`Tipo de acción ${i + 1}`}
              value={a.type}
              onChange={(e) => update(i, { type: e.target.value as FlowActionType })}
              className={cn(inputClass, "py-1.5")}
            >
              {Object.entries(ACTION_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label={`Eliminar acción ${i + 1}`}
              onClick={() => set({ actions: actions.filter((_, idx) => idx !== i) })}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-red-600 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {a.type === "set_variable" && (
            <div className="grid grid-cols-2 gap-1.5">
              <input
                aria-label="Variable"
                list={variableListId}
                value={a.variable || ""}
                onChange={(e) => update(i, { variable: e.target.value.replace(/[^\w]/g, "") })}
                placeholder="variable"
                className={cn(inputClass, "py-1.5 font-mono")}
              />
              <input
                aria-label="Valor"
                value={a.value || ""}
                onChange={(e) => update(i, { value: e.target.value })}
                placeholder="valor"
                className={cn(inputClass, "py-1.5")}
              />
            </div>
          )}

          {(a.type === "add_label" || a.type === "remove_label") && (
            <select
              aria-label="Etiqueta"
              value={a.labelId || ""}
              onChange={(e) => update(i, { labelId: e.target.value })}
              className={cn(inputClass, "py-1.5")}
            >
              <option value="">Selecciona una etiqueta…</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          )}

          {(a.type === "handoff" || a.type === "resolve") && (
            <p className="text-[11px] text-muted-foreground">
              {a.type === "handoff"
                ? "Pausa el bot para que la atienda un agente. Las palabras clave de los flujos siguen funcionando."
                : "Cierra la conversación."}{" "}
              El flujo termina después de esta acción.
            </p>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={() => set({ actions: [...actions, { type: "set_variable", variable: "", value: "" }] })}
        className="flex w-full items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-brand-300 text-xs font-medium text-brand-600 dark:text-brand-200 hover:bg-brand-50 dark:hover:bg-brand-700/30 transition-colors"
      >
        <Plus className="h-3 w-3" /> Agregar acción
      </button>
    </div>
  );
}
